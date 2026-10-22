import { describe, expect, it } from "vitest";
import { databaseOptions } from "../server/budget/mysql";
import {
  hashPassword,
  verifyPassword,
  validCloudData,
  sameSecret,
} from "../server/budget/security";
import { demoData } from "../lib/budget/model";

describe("SQL güvenliği ve belge doğrulama", () => {
  it("parolaları rastgele tuzla hashler ve yanlış parolayı reddeder", async () => {
    const password = "test-only-long-password";
    const first = await hashPassword(password);
    expect(first).not.toContain(password);
    expect(first).not.toBe(await hashPassword(password));
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword("wrong", first)).toBe(false);
    expect(await verifyPassword(password, "invalid")).toBe(false);
    expect(sameSecret(password, "wrong")).toBe(false);
  });
  it("eski bütçeyi kabul eder, tekrar eden kimlikleri ve aşırı tutarları reddeder", () => {
    const data = demoData();
    expect(validCloudData(data)).toBe(true);
    data.transactions.push(data.transactions[0]);
    expect(validCloudData(data)).toBe(false);
    const other = demoData();
    other.transactions[0].amount = 1e12;
    expect(validCloudData(other)).toBe(false);
    expect(validCloudData({ version: 1 })).toBe(false);
  });
  it("TLS ve sunucu kimliğini doğrular; URL TLS atlatma bayraklarını kullanmaz", () => {
    const options = databaseOptions({
      BUDGET_DATABASE_URL: "mysql://u:p@db.example.test/budget?ssl=false",
    });
    expect(options?.ssl).toMatchObject({
      rejectUnauthorized: true,
      verifyIdentity: true,
    });
    expect(databaseOptions({})).toBe(null);
    expect(() =>
      databaseOptions({
        BUDGET_DATABASE_URL: "mysql://u:p@db.example.test/budget",
        BUDGET_DATABASE_TLS: "local-only",
      }),
    ).toThrow();
    expect(() =>
      databaseOptions({
        BUDGET_DATABASE_URL: "mysql://u:p@localhost/budget",
        BUDGET_DATABASE_TLS: "local-only",
        NODE_ENV: "production",
      }),
    ).toThrow();
  });
});
