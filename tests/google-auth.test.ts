import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  makeGoogleVerifier,
  type GoogleVerifier,
} from "../server/budget/google";
import { isPristineBudget } from "../lib/budget/account";
import { emptyData } from "../lib/budget/model";
let privateKey: CryptoKey;
let verify: GoogleVerifier;
const clientId = "unit-test.apps.googleusercontent.com";
async function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: "https://accounts.google.com",
    aud: clientId,
    sub: "google-subject-alice",
    email: "alice@gmail.com",
    email_verified: true,
    nonce: "n".repeat(43),
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "unit-test" })
    .sign(privateKey);
}
beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  verify = makeGoogleVerifier(
    clientId,
    createLocalJWKSet({
      keys: [
        {
          ...(await exportJWK(keys.publicKey)),
          kid: "unit-test",
          alg: "RS256",
        },
      ],
    }),
  );
});
describe("Google kimliğinin sunucuda doğrulanması", () => {
  it("imzalı kimliği ve Gmail sahipliğini doğrular", async () => {
    expect(await verify(await token())).toMatchObject({
      subject: "google-subject-alice",
      email: "alice@gmail.com",
      authoritativeEmail: true,
    });
  });
  it.each([
    ["yanlış istemci", { aud: "other.apps.googleusercontent.com" }],
    ["yanlış sağlayıcı", { iss: "https://evil.example" }],
    ["süresi dolmuş kimlik", { exp: 1 }],
    [
      "gelecekte oluşturulmuş kimlik",
      { iat: Math.floor(Date.now() / 1000) + 3600 },
    ],
    ["doğrulanmamış e-posta", { email_verified: false }],
    ["boolean olmayan doğrulama", { email_verified: "true" }],
    ["eksik nonce", { nonce: undefined }],
    ["eksik bitiş tarihi", { exp: undefined }],
    ["farklı yetkili taraf", { azp: "other.apps.googleusercontent.com" }],
  ])("%s reddedilir", async (_name, overrides) => {
    await expect(verify(await token(overrides))).rejects.toThrow();
  });
  it("değiştirilmiş JWT imzasını reddeder", async () => {
    const jwt = await token();
    const parts = jwt.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    await expect(verify(parts.join("."))).rejects.toThrow();
  });
  it("üçüncü taraf e-postasını eski hesapla otomatik eşlemek için yetkili saymaz", async () => {
    expect(
      (await verify(await token({ email: "alice@example.com" })))
        .authoritativeEmail,
    ).toBe(false);
    expect(
      (
        await verify(
          await token({ email: "alice@example.com", hd: "example.com" }),
        )
      ).authoritativeEmail,
    ).toBe(true);
  });
});
describe("Boş hesap ve eski kayıtları koruma", () => {
  it("yeni hesabın bütçesi demosuz ve finansal verisizdir", () => {
    const data = emptyData();
    expect(data.demo).toBe(false);
    expect(data.transactions).toEqual([]);
    expect(data.budgets).toEqual({});
    expect(data.savingsGoals).toEqual({});
    expect(isPristineBudget(data)).toBe(true);
  });
  it("MySQL JSON nesne anahtar sırasını değiştirse de boş bütçeyi tanır", () => {
    const data = emptyData();
    data.categories = data.categories.map((c) => ({
      icon: c.icon,
      name: c.name,
      id: c.id,
      type: c.type,
      color: c.color,
    }));
    expect(isPristineBudget(data)).toBe(true);
  });
  it("kategori veya takip listesi düzenlenmiş bütçenin üzerine aktarım yapmaz", () => {
    const data = structuredClone(emptyData());
    data.categories[0].name = "Özel";
    expect(isPristineBudget(data)).toBe(false);
    const tracked = emptyData();
    tracked.trackedCurrencies = [];
    expect(isPristineBudget(tracked)).toBe(false);
  });
});
