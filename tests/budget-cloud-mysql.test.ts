import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createBudgetApp } from "../server/budget/app";
import { databaseOptions, MysqlBudgetRepository } from "../server/budget/mysql";
import { demoData } from "../lib/budget/model";

// Only an explicitly supplied disposable local database may run this destructive suite.
const databaseUrl = process.env.BUDGET_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("Gerçek MySQL üzerinde SQL API", () => {
  let pool: Pool;
  let repository: MysqlBudgetRepository;
  let server: Server;
  let origin: string;
  let cookie = "";
  const email = "owner@example.test";
  const password = "synthetic-only-test-password";
  const data = demoData();
  async function request(
    action: string,
    body?: unknown,
    auth = cookie,
    source?: string,
  ) {
    return fetch(`${origin}/api/cloud?action=${action}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(auth ? { Cookie: auth } : {}),
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json", Origin: source ?? origin }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/butce_test"
    )
      throw new Error("Only disposable localhost/butce_test allowed");
    pool = createPool(
      databaseOptions({
        BUDGET_DATABASE_URL: databaseUrl!,
        BUDGET_DATABASE_TLS: "local-only",
        NODE_ENV: "test",
      })!,
    );
    for (const statement of (
      await readFile(
        new URL("../database/budget/001-initial.sql", import.meta.url),
        "utf8",
      )
    )
      .split(";")
      .filter((s) => s.trim()))
      await pool.query(statement);
    await pool.query("DELETE FROM budget_cloud_accounts");
    await pool.query("DELETE FROM budget_cloud_login_limits");
    repository = new MysqlBudgetRepository(pool);
    const app = createBudgetApp({
      repository,
      ownerEmail: email,
      ownerPassword: password,
      production: false,
      origin: "http://localhost:8769",
    });
    // Origin is configured separately from the ephemeral listen port.
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) await pool.end();
  });
  const post = (action: string, body: unknown, auth = cookie) =>
    request(action, body, auth, "http://localhost:8769");
  it("kişisel veriyi anonim erişime kapatır ve önbelleğe aldırmaz", async () => {
    const result = await request("data");
    expect(result.status).toBe(401);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("yabancı origin ve herkese açık kayıt girişimini reddeder", async () => {
    expect(
      (await request("login", { email, password }, "", "https://evil.example"))
        .status,
    ).toBe(403);
    expect(
      (await post("login", { email: "stranger@example.test", password }))
        .status,
    ).toBe(401);
  });
  it("hesap oluşturur, parolayı ve oturum belirtecini açık saklamaz", async () => {
    const result = await post("login", { email, password });
    expect(result.status).toBe(200);
    const header = result.headers.get("set-cookie")!;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    cookie = header.split(";")[0];
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT password_hash FROM budget_cloud_accounts",
    );
    expect(rows[0].password_hash).not.toContain(password);
    const [sessions] = await pool.query<RowDataPacket[]>(
      "SELECT token_hash FROM budget_cloud_sessions",
    );
    expect(sessions[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessions[0].token_hash).not.toBe(cookie.split("=")[1]);
    expect(await (await request("data")).json()).toEqual({
      revision: 0,
      data: null,
    });
  });
  it("kategoriler, hedefler ve döviz alanlarını kayıpsız kaydeder", async () => {
    data.savingsGoals = { "2026-10": 30000 };
    data.trackedCurrencies = ["USD", "EUR"];
    expect((await post("data", { revision: 0, data })).status).toBe(200);
    expect(await (await request("data")).json()).toEqual({ revision: 1, data });
  });
  it("eşzamanlı iki yazmanın birini kabul eder, eski verinin yeniyi ezmesini engeller", async () => {
    const results = await Promise.all([
      post("data", { revision: 1, data }),
      post("data", { revision: 1, data }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await (await request("data")).json()).revision).toBe(2);
  });
  it("bozuk belgeleri kaydetmez, yetkiyi istemci hesap kimliğinden almaz", async () => {
    expect(
      (await post("data", { revision: 2, data: { version: 1 } })).status,
    ).toBe(400);
    const other = randomUUID();
    await repository.createAccount(
      { id: other, email: "other@example.test", passwordHash: "invalid" },
      Date.now(),
    );
    expect(
      (await post("data", { revision: 2, accountId: other, data })).status,
    ).toBe(200);
    expect(await repository.read(other)).toEqual({ revision: 0, data: null });
  });
  it("oturum süresini ve çıkışını sunucuda uygular", async () => {
    const oldCookie = cookie;
    expect((await post("logout", {})).status).toBe(200);
    expect((await request("data", undefined, oldCookie)).status).toBe(401);
    const account = await repository.account(email);
    await repository.createSession(
      "a".repeat(64),
      account!.id,
      Date.now() - 1000,
    );
    expect(await repository.session("a".repeat(64), Date.now())).toBe(null);
  });
  it("giriş limiti SQL’de kalıcıdır ve pencere süresinde sıfırlanır", async () => {
    const key = "b".repeat(64);
    const now = Date.now();
    for (let i = 0; i < 20; i++)
      expect(await repository.allowLogin(key, now)).toBe(true);
    expect(await repository.allowLogin(key, now)).toBe(false);
    expect(await repository.allowLogin(key, now + 900001)).toBe(true);
  });
});
