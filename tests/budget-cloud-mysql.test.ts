import { summarize } from "../lib/budget/model";
import { nextMonthForecast } from "../lib/budget/reports";
import { buildExchange, buildManualExchange } from "../lib/budget/exchange";
import {
  saveExchange,
  accountBalance,
  saveFinancialAccount,
  saveTransfer,
} from "../lib/budget/finance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { readFile, readdir } from "node:fs/promises";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createBudgetApp } from "../server/budget/app";
import { databaseOptions, MysqlBudgetRepository } from "../server/budget/mysql";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  makeGoogleVerifier,
  GoogleAccountConflict,
} from "../server/budget/google";
import { hashPassword, tokenHash } from "../server/budget/security";
import { emptyData, demoData } from "../lib/budget/model";

// Only an explicitly supplied disposable local database may run this destructive suite.
const databaseUrl = process.env.BUDGET_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("Gerçek MySQL üzerinde SQL API", () => {
  let pool: Pool;
  let repository: MysqlBudgetRepository;
  let server: Server;
  let origin: string;
  let cookie = "";
  let ownerId = "";
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
    const directory = new URL("../database/budget/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((n) => /^\d+-.*\.sql$/.test(n))
      .sort()) {
      for (const statement of (await readFile(new URL(file, directory), "utf8"))
        .split(";")
        .filter((s) => s.trim()))
        await pool.query(statement);
    }
    await pool.query("DELETE FROM budget_cloud_google_challenges");
    await pool.query("DELETE FROM budget_cloud_accounts");
    await pool.query("DELETE FROM budget_cloud_login_limits");
    repository = new MysqlBudgetRepository(pool);
    const app = createBudgetApp({
      repository,
      googleClientId: "",
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
    ownerId = (await result.json()).accountId;
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
      accountId: ownerId,
      revision: 0,
      data: null,
    });
  });
  it("kategoriler, hedefler ve döviz alanlarını kayıpsız kaydeder", async () => {
    data.savingsGoals = { "2026-10": 30000 };
    data.trackedCurrencies = ["USD", "EUR"];
    expect((await post("data", { revision: 0, data })).status).toBe(200);
    expect(await (await request("data")).json()).toEqual({
      accountId: ownerId,
      revision: 1,
      data,
    });
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
    ).toBe(409);
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

  describe("Google ile çok kullanıcılı bütçe", () => {
    let googleServer: Server;
    let base: string;
    let key: CryptoKey;
    const googleOrigin = "https://budget.example.test";
    const clientId = "mysql-test.apps.googleusercontent.com";
    const legacyEmail = "legacy-owner@gmail.com";
    let alice: {
      accountId: string;
      cookie: string;
      credential: string;
      challenge: string;
    };
    let bob: typeof alice;
    async function call(
      action: string,
      body?: unknown,
      auth = "",
      source = googleOrigin,
    ) {
      return fetch(`${base}/api/cloud?action=${action}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(auth ? { Cookie: auth } : {}),
          ...(body === undefined
            ? {}
            : { Origin: source, "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function challenge() {
      const response = await call("google-config");
      expect(response.status).toBe(200);
      return {
        ...(await response.json()),
        cookie: response.headers
          .getSetCookie()
          .find((h) => h.startsWith("__Host-budget_google_challenge_"))!
          .split(";")[0],
      } as { clientId: string; nonce: string; cookie: string };
    }
    async function signed(
      subject: string,
      email: string,
      nonce: string,
      overrides: Record<string, unknown> = {},
    ) {
      return new SignJWT({ email, email_verified: true, nonce, ...overrides })
        .setProtectedHeader({ alg: "RS256", kid: "mysql-test" })
        .setIssuer("https://accounts.google.com")
        .setAudience(clientId)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(key);
    }
    async function login(subject: string, email: string) {
      const config = await challenge();
      const credential = await signed(subject, email, config.nonce);
      const response = await call(
        "google-login",
        { credential },
        config.cookie,
      );
      expect(response.status).toBe(200);
      const header = response.headers
        .getSetCookie()
        .find((h) => h.startsWith("__Host-budget_google_session="))!;
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
      expect(header).toContain("SameSite=Lax");
      return {
        accountId: (await response.json()).accountId as string,
        cookie: header.split(";")[0],
        credential,
        challenge: config.cookie,
      };
    }
    beforeAll(async () => {
      const pair = await generateKeyPair("RS256");
      key = pair.privateKey;
      const verifier = makeGoogleVerifier(
        clientId,
        createLocalJWKSet({
          keys: [
            {
              ...(await exportJWK(pair.publicKey)),
              kid: "mysql-test",
              alg: "RS256",
            },
          ],
        }),
      );
      googleServer = createBudgetApp({
        repository,
        ownerEmail: legacyEmail,
        googleClientId: clientId,
        googleVerifier: verifier,
        origin: googleOrigin,
        production: true,
      }).listen(0, "127.0.0.1");
      await new Promise<void>((resolve) =>
        googleServer.once("listening", resolve),
      );
      const address = googleServer.address();
      base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    });
    afterAll(async () => {
      if (googleServer) {
        googleServer.closeAllConnections();
        await new Promise<void>((resolve) =>
          googleServer.close(() => resolve()),
        );
      }
    });
    it("girişten önce verileri kapatır, parola girişini Google modunda devre dışı bırakır", async () => {
      expect((await call("data")).status).toBe(401);
      expect((await call("login", { email, password })).status).toBe(410);
      expect(await (await call("status")).json()).toMatchObject({
        googleEnabled: true,
        authenticated: false,
      });
      await repository.createSession(
        tokenHash("old-password-session"),
        ownerId,
        Date.now() + 60000,
      );
      expect(
        (
          await call(
            "data",
            undefined,
            "__Host-budget_session=old-password-session",
          )
        ).status,
      ).toBe(401);
    });
    it("yabancı origin, geçersiz imza ve yanlış nonce kayıt oluşturamaz", async () => {
      const c = await challenge();
      const jwt = await signed(
        "invalid-login",
        "invalid-login@gmail.com",
        c.nonce,
      );
      expect(
        (
          await call(
            "google-login",
            { credential: jwt },
            c.cookie,
            "https://evil.example",
          )
        ).status,
      ).toBe(403);
      expect(
        (await call("google-login", { credential: "not-a-jwt" }, c.cookie))
          .status,
      ).toBe(401);
      expect(
        (
          await call(
            "google-login",
            {
              credential: await signed(
                "invalid-login",
                "invalid-login@gmail.com",
                "z".repeat(43),
              ),
            },
            c.cookie,
          )
        ).status,
      ).toBe(401);
      expect(await repository.account("invalid-login@gmail.com")).toBe(null);
    });
    it("ilk Google kullanıcısını boş bütçeyle oluşturur", async () => {
      alice = await login("google-alice", "alice@gmail.com");
      const result = await (await call("data", undefined, alice.cookie)).json();
      expect(result).toEqual({
        accountId: alice.accountId,
        revision: 1,
        data: emptyData(),
      });
      expect((await repository.account("alice@gmail.com"))!.passwordHash).toBe(
        "",
      );
    });
    it("ikinci kullanıcı ilk kullanıcının kayıtlarını göremez", async () => {
      const data = emptyData();
      data.transactions = [
        {
          id: "alice-expense",
          type: "expense",
          categoryId: "market",
          date: "2026-10-22",
          amount: 75,
          description: "Alice only",
        },
      ];
      expect(
        (
          await call(
            "data",
            { accountId: alice.accountId, revision: 1, data },
            alice.cookie,
          )
        ).status,
      ).toBe(200);
      bob = await login("google-bob", "bob@gmail.com");
      expect(bob.accountId).not.toBe(alice.accountId);
      expect(await (await call("data", undefined, bob.cookie)).json()).toEqual({
        accountId: bob.accountId,
        revision: 1,
        data: emptyData(),
      });
    });
    it("hesap kimliğini değiştirerek veya eski sekmeden başka hesaba yazmayı engeller", async () => {
      expect(
        (
          await call(
            "data",
            { accountId: alice.accountId, revision: 1, data: emptyData() },
            bob.cookie,
          )
        ).status,
      ).toBe(409);
      const stale = await call(
        "data",
        { accountId: alice.accountId, revision: 2, data: emptyData() },
        bob.cookie,
      );
      expect((await stale.json()).code).toBe("ACCOUNT_CHANGED");
      expect(
        (await call("data", { revision: 1, data: emptyData() }, bob.cookie))
          .status,
      ).toBe(409);
      expect(
        (await repository.read(alice.accountId)).data!.transactions[0]
          .description,
      ).toBe("Alice only");
      expect((await repository.read(bob.accountId)).data).toEqual(emptyData());
    });
    it("kullanılmış ve süresi dolmuş giriş isteğini tekrar kabul etmez", async () => {
      expect(
        (
          await call(
            "google-login",
            { credential: alice.credential },
            alice.challenge,
          )
        ).status,
      ).toBe(401);
      const c = await challenge();
      await pool.execute(
        "UPDATE budget_cloud_google_challenges SET expires_at_ms=1 WHERE token_hash=?",
        [tokenHash(c.cookie.split("=")[1])],
      );
      expect(
        (
          await call(
            "google-login",
            {
              credential: await signed(
                "expired-sub",
                "expired@gmail.com",
                c.nonce,
              ),
            },
            c.cookie,
          )
        ).status,
      ).toBe(401);
    });
    it("Google subject sabit kaldığında e-posta değişse de aynı bütçeyi açar", async () => {
      const again = await login("google-alice", "alice-new@gmail.com");
      expect(again.accountId).toBe(alice.accountId);
      expect(
        (await (await call("data", undefined, again.cookie)).json()).data
          .transactions[0].description,
      ).toBe("Alice only");
    });
    it("eşzamanlı ilk girişte aynı kullanıcı için iki bütçe oluşturmaz", async () => {
      const results = await Promise.all([
        login("google-race", "google-race@gmail.com"),
        login("google-race", "google-race@gmail.com"),
      ]);
      expect(results[0].accountId).toBe(results[1].accountId);
    });
    it("doğrulanmış eski sahibin bütçesini Google hesabıyla kayıpsız eşler", async () => {
      const id = randomUUID();
      const original = demoData();
      await repository.createAccount(
        { id, email: legacyEmail, passwordHash: await hashPassword(password) },
        Date.now(),
      );
      await repository.write(id, 0, original, Date.now());
      const linked = await login("google-legacy-owner", legacyEmail);
      expect(linked.accountId).toBe(id);
      expect((await repository.read(id)).data).toEqual(original);
      expect(
        (await (await call("status", undefined, linked.cookie)).json())
          .legacyImportAllowed,
      ).toBe(true);
      const c = await challenge();
      expect(
        (
          await call(
            "google-login",
            {
              credential: await signed(
                "different-subject-same-email",
                legacyEmail,
                c.nonce,
              ),
            },
            c.cookie,
          )
        ).status,
      ).toBe(409);
      expect((await repository.read(id)).data).toEqual(original);
    });
    it("üçüncü taraf e-posta doğrulaması eski parola hesabını sahiplenmeye yetmez", async () => {
      const id = randomUUID();
      const email = "old-owner@example.com";
      await repository.createAccount(
        { id, email, passwordHash: await hashPassword(password) },
        Date.now(),
      );
      await expect(
        repository.googleAccount(
          {
            subject: "untrusted-email-sub",
            email,
            name: "",
            nonce: "n".repeat(43),
            authoritativeEmail: false,
          },
          email,
          Date.now(),
        ),
      ).rejects.toBeInstanceOf(GoogleAccountConflict);
    });
    it("hesap, transfer ve taksit belgesi SQL'de kayıpsız ve kullanıcıya özel saklanır; eski istemci silemez", async () => {
      const user = await login(
        "finance-" + randomUUID(),
        `finance-${randomUUID()}@gmail.com`,
      );
      const other = await login(
        "finance-other-" + randomUUID(),
        `finance-${randomUUID()}@gmail.com`,
      );
      const initial = await (await call("data", undefined, user.cookie)).json();
      const doc = emptyData();
      doc.financialAccounts = [
        {
          id: "bank",
          name: "Test banka",
          kind: "bank",
          currency: "TRY",
          openingBalance: 1000,
          openingDate: "2026-01-01",
          archived: false,
        },
        {
          id: "card",
          name: "Test kart",
          kind: "card",
          currency: "TRY",
          openingBalance: 0,
          openingDate: "2026-01-01",
          archived: false,
          creditLimit: 10000,
          statementDay: 15,
          paymentDay: 25,
        },
      ];
      doc.paymentPlans = [
        {
          id: "plan",
          title: "Taksit",
          kind: "installment",
          type: "expense",
          amount: 300,
          currency: "TRY",
          categoryId: "market",
          accountId: "card",
          startDate: "2026-01-20",
          count: 3,
          archived: false,
        },
      ];
      doc.transactions = [
        {
          id: "paid",
          type: "expense",
          amount: 100,
          currency: "TRY",
          baseAmount: 100,
          date: "2026-01-20",
          description: "Taksit 1",
          categoryId: "market",
          accountId: "card",
          planId: "plan",
          planIndex: 0,
        },
      ];
      doc.accountTransfers = [
        {
          id: "payment",
          fromId: "bank",
          toId: "card",
          amount: 100,
          currency: "TRY",
          date: "2026-01-21",
          note: "Kart ödemesi",
        },
      ];
      const saved = await call(
        "data",
        { accountId: user.accountId, revision: initial.revision, data: doc },
        user.cookie,
      );
      expect(saved.status).toBe(200);
      const current = await (await call("data", undefined, user.cookie)).json();
      expect(current.data).toEqual(doc);
      expect((await repository.read(user.accountId)).data).toEqual(doc);
      expect(
        (await (await call("data", undefined, other.cookie)).json()).data
          .financialAccounts,
      ).toEqual([]);
      const old = emptyData();
      delete old.financialAccounts;
      delete old.accountTransfers;
      delete old.paymentPlans;
      const stale = await call(
        "data",
        { accountId: user.accountId, revision: current.revision, data: old },
        user.cookie,
      );
      expect(stale.status).toBe(409);
      expect((await stale.json()).code).toBe("APP_UPDATE_REQUIRED");
      expect((await repository.read(user.accountId)).data).toEqual(doc);
      const duplicate = {
        ...doc,
        transactions: [
          ...doc.transactions,
          { ...doc.transactions[0], id: "duplicate" },
        ],
      };
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: current.revision,
              data: duplicate,
            },
            user.cookie,
          )
        ).status,
      ).toBe(400);
    });
    it("döviz al/sat iki hesabı tek SQL belgesinde kaydeder, bozuk kuru reddeder ve diğer kullanıcıdan ayırır", async () => {
      const user = await login(
        "exchange-" + randomUUID(),
        `exchange-${randomUUID()}@gmail.com`,
      );
      const other = await login(
        "exchange-other-" + randomUUID(),
        `exchange-${randomUUID()}@gmail.com`,
      );
      const initial = await (await call("data", undefined, user.cookie)).json();
      let doc = emptyData();
      doc.financialAccounts = [
        {
          id: "usd",
          name: "Dolar",
          kind: "bank",
          currency: "USD",
          openingBalance: 100,
          openingDate: "2026-01-01",
          archived: false,
        },
        {
          id: "try",
          name: "TL",
          kind: "bank",
          currency: "TRY",
          openingBalance: 0,
          openingDate: "2026-01-01",
          archived: false,
        },
      ];
      doc = saveExchange(doc, {
        id: "exchange",
        fromId: "usd",
        toId: "try",
        currency: "USD",
        amount: 25,
        date: "2026-10-24",
        time: "14:30",
        note: "Synthetic exchange",
        exchange: buildExchange(25, "USD", "TRY", "2026-10-24", {
          currency: "USD",
          currencyName: "Dolar",
          date: "2026-10-23",
          unit: 1,
          forexBuying: 40,
          forexSelling: 41,
          banknoteBuying: null,
          banknoteSelling: null,
          bulletinNo: "1",
        }),
      });
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: initial.revision,
              data: doc,
            },
            user.cookie,
          )
        ).status,
      ).toBe(200);
      const current = await (await call("data", undefined, user.cookie)).json();
      expect(current.data).toEqual(doc);
      expect((await repository.read(user.accountId)).data).toEqual(doc);
      expect(
        accountBalance(
          current.data,
          current.data.financialAccounts[0],
          "2026-10-24",
        ),
      ).toBe(75);
      expect(
        accountBalance(
          current.data,
          current.data.financialAccounts[1],
          "2026-10-24",
        ),
      ).toBe(1000);
      expect(
        (await (await call("data", undefined, other.cookie)).json()).data,
      ).toEqual(emptyData());
      const invalid = structuredClone(doc);
      invalid.accountTransfers![0].exchange!.toAmount = 2000;
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: current.revision,
              data: invalid,
            },
            user.cookie,
          )
        ).status,
      ).toBe(400);
      expect((await repository.read(user.accountId)).data).toEqual(doc);
    });
    it("manuel kur SQL'de saklanır, sonradan aynı kayıt üzerinde değiştirilir ve iki bakiyeyi düzeltir", async () => {
      const user = await login(
        "manual-" + randomUUID(),
        `manual-${randomUUID()}@gmail.com`,
      );
      const other = await login(
        "manual-other-" + randomUUID(),
        `manual-${randomUUID()}@gmail.com`,
      );
      const initial = await (await call("data", undefined, user.cookie)).json();
      let doc = emptyData();
      doc.financialAccounts = [
        {
          id: "usd",
          name: "Dolar",
          kind: "bank",
          currency: "USD",
          openingBalance: 100,
          openingDate: "2026-01-01",
          archived: false,
        },
        {
          id: "try",
          name: "TL",
          kind: "bank",
          currency: "TRY",
          openingBalance: 1000,
          openingDate: "2026-01-01",
          archived: false,
        },
      ];
      const t = {
        id: "manual",
        fromId: "usd",
        toId: "try",
        amount: 25,
        currency: "USD",
        date: "2026-10-23",
        note: "Manual bank rate",
        exchange: buildManualExchange(25, "USD", "TRY", "2026-10-23", 40.25),
      };
      doc = saveExchange(doc, t);
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: initial.revision,
              data: doc,
            },
            user.cookie,
          )
        ).status,
      ).toBe(200);
      const saved = await (await call("data", undefined, user.cookie)).json();
      expect(saved.data).toEqual(doc);
      expect(
        (await repository.read(user.accountId)).data?.accountTransfers?.[0]
          .exchange,
      ).toMatchObject({ source: "MANUAL", manualRate: 40.25 });
      doc = saveExchange(saved.data, {
        ...t,
        exchange: buildManualExchange(25, "USD", "TRY", "2026-10-23", 41.1),
      });
      expect(
        (
          await call(
            "data",
            { accountId: user.accountId, revision: saved.revision, data: doc },
            user.cookie,
          )
        ).status,
      ).toBe(200);
      const edited = await (await call("data", undefined, user.cookie)).json();
      expect(edited.data.accountTransfers).toHaveLength(1);
      expect(edited.data.accountTransfers[0].exchange.manualRate).toBe(41.1);
      expect(
        accountBalance(
          edited.data,
          edited.data.financialAccounts[0],
          "2026-10-23",
        ),
      ).toBe(75);
      expect(
        accountBalance(
          edited.data,
          edited.data.financialAccounts[1],
          "2026-10-23",
        ),
      ).toBe(2027.5);
      const invalid = structuredClone(doc);
      invalid.accountTransfers![0].exchange!.toAmount = 999;
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: edited.revision,
              data: invalid,
            },
            user.cookie,
          )
        ).status,
      ).toBe(400);
      expect((await repository.read(user.accountId)).data).toEqual(doc);
      expect(
        (await (await call("data", undefined, other.cookie)).json()).data,
      ).toEqual(emptyData());
    });
    it("yatırım türünü, fon transferini ve kullanılan hesapta tür değişimini SQL'de korur; yatırım için yeni işlemleri reddeder", async () => {
      const user = await login(
        "investment-" + randomUUID(),
        `investment-${randomUUID()}@gmail.com`,
      );
      const other = await login(
        "investment-other-" + randomUUID(),
        `investment-${randomUUID()}@gmail.com`,
      );
      const initial = await (await call("data", undefined, user.cookie)).json();
      let doc = emptyData();
      doc.financialAccounts = [
        {
          id: "bank",
          name: "Bank",
          kind: "bank",
          currency: "TRY",
          openingBalance: 1000,
          openingDate: "2026-01-01",
          archived: false,
        },
        {
          id: "cash",
          name: "Cash",
          kind: "cash",
          currency: "TRY",
          openingBalance: 1000,
          openingDate: "2026-01-01",
          archived: false,
        },
        {
          id: "usd",
          name: "USD",
          kind: "bank",
          currency: "USD",
          openingBalance: 50,
          openingDate: "2026-01-01",
          archived: false,
        },
      ];
      doc.transactions = [
        {
          id: "history",
          accountId: "bank",
          date: "2026-10-01",
          amount: 100,
          type: "expense",
          categoryId: "market",
          description: "Past expense",
        },
      ];
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: initial.revision,
              data: doc,
            },
            user.cookie,
          )
        ).status,
      ).toBe(200);
      let current = await (await call("data", undefined, user.cookie)).json();
      doc = saveFinancialAccount(doc, {
        ...doc.financialAccounts![0],
        kind: "investment",
      });
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: current.revision,
              data: doc,
            },
            user.cookie,
          )
        ).status,
      ).toBe(200);
      current = await (await call("data", undefined, user.cookie)).json();
      expect((await repository.read(user.accountId)).data).toEqual(doc);
      expect(current.data.transactions).toHaveLength(1);
      expect(summarize(current.data, "2026-10").expense).toBe(0);
      const expense = structuredClone(doc);
      expense.transactions.push({ ...expense.transactions[0], id: "new" });
      const planned = structuredClone(doc);
      planned.paymentPlans = [
        {
          id: "new-plan",
          title: "Investment plan",
          kind: "once",
          type: "expense",
          amount: 10,
          currency: "TRY",
          categoryId: "market",
          accountId: "bank",
          startDate: "2026-10-24",
          archived: false,
        },
      ];
      const fx = structuredClone(doc);
      fx.accountTransfers = [
        {
          id: "new-fx",
          fromId: "usd",
          toId: "bank",
          currency: "USD",
          amount: 10,
          date: "2026-10-23",
          note: "FX",
          exchange: buildManualExchange(10, "USD", "TRY", "2026-10-23", 40),
        },
      ];
      for (const invalid of [expense, planned, fx])
        expect(
          (
            await call(
              "data",
              {
                accountId: user.accountId,
                revision: current.revision,
                data: invalid,
              },
              user.cookie,
            )
          ).status,
        ).toBe(400);
      expect((await repository.read(user.accountId)).data).toEqual(doc);
      doc = saveTransfer(doc, {
        id: "fund",
        fromId: "cash",
        toId: "bank",
        amount: 200,
        currency: "TRY",
        date: "2026-10-23",
        note: "Investment funding",
      });
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: current.revision,
              data: doc,
            },
            user.cookie,
          )
        ).status,
      ).toBe(200);
      current = await (await call("data", undefined, user.cookie)).json();
      expect(
        accountBalance(
          current.data,
          current.data.financialAccounts[0],
          "2026-10-23",
        ),
      ).toBe(1100);
      expect(
        nextMonthForecast(current.data, "2026-10-23").rows.find(
          (r) => r.currency === "TRY",
        )?.current,
      ).toBe(800);
      expect(
        (await (await call("data", undefined, other.cookie)).json()).data,
      ).toEqual(emptyData());
      doc = saveFinancialAccount(doc, {
        ...doc.financialAccounts![0],
        kind: "bank",
      });
      expect(
        (
          await call(
            "data",
            {
              accountId: user.accountId,
              revision: current.revision,
              data: doc,
            },
            user.cookie,
          )
        ).status,
      ).toBe(200);
      const restored = await (
        await call("data", undefined, user.cookie)
      ).json();
      expect(restored.data.transactions).toEqual(doc.transactions);
      expect(summarize(restored.data, "2026-10").expense).toBe(100);
    });
    it("çıkış yalnızca ilgili oturumu kapatır", async () => {
      expect((await call("logout", {}, bob.cookie)).status).toBe(200);
      expect((await call("data", undefined, bob.cookie)).status).toBe(401);
      expect((await call("data", undefined, alice.cookie)).status).toBe(200);
    });
  });
});
