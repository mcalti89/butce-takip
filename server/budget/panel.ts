import type { JWTVerifyGetKey } from "jose";
import type { GoogleIdentity } from "./google";

// The panel (https://panel.muratcalti.com) is the only Google sign-in. It sets one signed
// "main session" cookie, mc_sso, on .muratcalti.com for every app (CPanel docs/SSO.md).
// Its `sub` is the Google account id, so existing budget accounts linked to that Google
// identity keep working without a migration.
export const PANEL_COOKIE = "mc_sso";
export type PanelVerifier = (token: string) => Promise<GoogleIdentity>;
let panelKeys: JWTVerifyGetKey | undefined;

export function makePanelVerifier(
  panelUrl: string,
  allowedEmails: string[],
  keys?: JWTVerifyGetKey,
): PanelVerifier {
  return async (token) => {
    // Vercel emits this function as CommonJS; jose v6 is ESM-only.
    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const verificationKeys = keys ?? (panelKeys ??= createRemoteJWKSet(
      new URL(panelUrl + "/.well-known/jwks.json"),
      { timeoutDuration: 10000 },
    ));
    const { payload } = await jwtVerify(token, verificationKeys, {
      algorithms: ["ES256"],
      issuer: panelUrl,
      audience: "muratcalti-apps",
      requiredClaims: ["sub", "email", "iat", "exp"],
      clockTolerance: 5,
    });
    if (
      payload.email_verified !== true ||
      typeof payload.sub !== "string" ||
      !/^[\x21-\x7e]{1,255}$/.test(payload.sub) ||
      typeof payload.email !== "string" ||
      payload.email.length > 254
    )
      throw new Error("Invalid panel identity");
    const email = payload.email.trim().toLowerCase();
    if (allowedEmails.length && !allowedEmails.includes(email))
      throw new Error("Account not allowed");
    return {
      subject: payload.sub,
      email,
      name: typeof payload.name === "string" ? payload.name.slice(0, 200) : "",
      nonce: "panel",
      // The panel only accepts Google-verified addresses; Gmail ones are authoritative.
      authoritativeEmail: email.endsWith("@gmail.com"),
    };
  };
}
