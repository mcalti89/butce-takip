import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { makePanelVerifier, type PanelVerifier } from "../server/budget/panel";
import { createBudgetApp } from "../server/budget/app";
import type { BudgetRepository } from "../server/budget/mysql";

const PANEL = "https://panel.example.test";
let privateKey: CryptoKey;
let verify: PanelVerifier;
let jwks: ReturnType<typeof createLocalJWKSet>;

async function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: PANEL,
    aud: "muratcalti-apps",
    sub: "google-subject-alice",
    email: "alice@gmail.com",
    email_verified: true,
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "ES256", kid: "unit-test" })
    .sign(privateKey);
}

beforeAll(async () => {
  const keys = await generateKeyPair("ES256");
  privateKey = keys.privateKey;
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(keys.publicKey)), kid: "unit-test", alg: "ES256" }],
  });
  verify = makePanelVerifier(PANEL, ["alice@gmail.com"], jwks);
});

describe("panelin ana oturumunun doğrulanması", () => {
  it("imzalı panel oturumunu Google kimliği olarak kabul eder", async () => {
    expect(await verify(await token())).toMatchObject({
      subject: "google-subject-alice",
      email: "alice@gmail.com",
      authoritativeEmail: true,
    });
  });
  it.each([
    ["yanlış hedef", { aud: "other" }],
    ["yanlış panel", { iss: "https://evil.example" }],
    ["süresi dolmuş oturum", { exp: 1 }],
    ["izin listesinde olmayan e-posta", { email: "bob@gmail.com" }],
    ["doğrulanmamış e-posta", { email_verified: false }],
  ])("%s reddedilir", async (_name, overrides) => {
    await expect(verify(await token(overrides))).rejects.toThrow();
  });
});

describe("panel modunda bulut API'si", () => {
  let server: Server;
  let base = "";
  const origin = "https://butce.example.test";
  const linked: string[] = [];
  beforeAll(async () => {
    const repository = {
      async googleAccount(identity: { subject: string; email: string }) {
        linked.push(identity.subject);
        return { id: "acc-" + identity.subject, email: identity.email, passwordHash: "" };
      },
      async account() {
        return null;
      },
    } as unknown as BudgetRepository;
    server = createBudgetApp({
      repository,
      origin,
      production: false,
      panelUrl: PANEL,
      panelVerifier: verify,
    }).listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const a = server.address();
    base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const status = (cookie = "") =>
    fetch(`${base}/api/cloud?action=status`, { headers: cookie ? { cookie } : {} }).then((r) => r.json());

  it("panel çerezi yoksa giriş istemez, panel adresini bildirir", async () => {
    expect(await status()).toMatchObject({ authenticated: false, googleEnabled: true, panelUrl: PANEL });
  });
  it("geçerli panel çereziyle hesabı Google kimliğinden açar", async () => {
    expect(await status(`mc_sso=${await token()}`)).toMatchObject({
      authenticated: true,
      accountId: "acc-google-subject-alice",
    });
    expect(linked).toContain("google-subject-alice");
  });
  it("sahte panel çerezini kabul etmez", async () => {
    expect(await status("mc_sso=not-a-token")).toMatchObject({ authenticated: false });
  });
  it("uygulama içi Google girişi kapalıdır", async () => {
    const r = await fetch(`${base}/api/cloud?action=google-config`);
    expect(r.status).toBe(410);
  });
});
