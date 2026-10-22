import type { JWTVerifyGetKey } from "jose";

export type GoogleIdentity = {
  subject: string;
  email: string;
  name: string;
  nonce: string;
  authoritativeEmail: boolean;
};
let googleKeys: JWTVerifyGetKey | undefined;
export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity>;
export function makeGoogleVerifier(
  clientId: string,
  keys?: JWTVerifyGetKey,
): GoogleVerifier {
  return async (credential) => {
    // Vercel emits this function as CommonJS; jose v6 is ESM-only.
    // Native import() also keeps the remote key cache shared across requests.
    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const verificationKeys = keys ?? (googleKeys ??= createRemoteJWKSet(
      new URL("https://www.googleapis.com/oauth2/v3/certs"),
      { timeoutDuration: 10000 },
    ));
    const { payload } = await jwtVerify(credential, verificationKeys, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
      requiredClaims: ["sub", "email", "email_verified", "nonce", "iat", "exp"],
      maxTokenAge: "1h",
      clockTolerance: 5,
    });
    if (
      payload.email_verified !== true ||
      typeof payload.sub !== "string" ||
      !/^[\x21-\x7e]{1,255}$/.test(payload.sub) ||
      typeof payload.email !== "string" ||
      payload.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
      typeof payload.nonce !== "string" ||
      !/^[a-zA-Z0-9_-]{32,128}$/.test(payload.nonce) ||
      (payload.azp !== undefined && payload.azp !== clientId)
    )
      throw new Error("Invalid Google identity");
    const email = payload.email.trim().toLowerCase();
    return {
      subject: payload.sub,
      email,
      name: typeof payload.name === "string" ? payload.name.slice(0, 200) : "",
      nonce: payload.nonce,
      authoritativeEmail:
        email.endsWith("@gmail.com") ||
        (typeof payload.hd === "string" &&
          payload.hd.toLowerCase() === email.split("@")[1]),
    };
  };
}
export class GoogleAccountConflict extends Error {}
