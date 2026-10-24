import { buildManualExchange } from "../lib/budget/exchange";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { isDeepStrictEqual } from "node:util";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { createPool } from "mysql2/promise";
import { createBudgetApp } from "../server/budget/app";
import { databaseOptions, MysqlBudgetRepository } from "../server/budget/mysql";
import { makeGoogleVerifier } from "../server/budget/google";
import { tokenHash } from "../server/budget/security";
import { emptyData } from "../lib/budget/model";

// A local, ephemeral identity provider tests the protocol against the real DB.
// Production always verifies with Google's real JWKS; no test key is deployed.
export async function verifyGoogleDeployment() {
  const clientId = process.env.BUDGET_GOOGLE_CLIENT_ID;
  if (
    !clientId ||
    !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)
  )
    throw new Error("Google client ID missing");
  const options = databaseOptions();
  if (!options) throw new Error("SQL configuration missing");
  const pool = createPool(options);
  const repository = new MysqlBudgetRepository(pool);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "ephemeral-build-check",
    alg: "RS256",
  };
  const prefix = randomUUID();
  const users = [0, 1].map((n) => ({
    subject: `smoke:${prefix}:${n}`,
    email: `google-smoke-${prefix}-${n}@example.invalid`,
  }));
  const origin = "https://butcetakip-vercel-drop.vercel.app";
  const app = createBudgetApp({
    repository,
    ownerEmail: "",
    googleClientId: clientId,
    googleVerifier: makeGoogleVerifier(
      clientId,
      createLocalJWKSet({ keys: [jwk] }),
    ),
    origin,
    production: true,
  });
  const server = app.listen(0, "127.0.0.1");
  const challenges: string[] = [];
  let stage = "başlatma";
  const check = (ok: boolean) => {
    if (!ok) throw new Error("Google SQL verification failed");
  };
  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Server unavailable");
    const base = `http://127.0.0.1:${address.port}/api/cloud?action=`;
    async function request(action: string, body?: unknown, cookie = "") {
      return fetch(base + action, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body === undefined
            ? {}
            : { Origin: origin, "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
    }
    async function login(user: (typeof users)[number]) {
      const configResponse = await request("google-config");
      check(configResponse.status === 200);
      const config = await configResponse.json();
      const challenge = (
        configResponse.headers
          .getSetCookie()
          .find((h) => h.startsWith("__Host-budget_google_challenge_")) || ""
      ).split(";")[0];
      challenges.push(challenge.split("=")[1]);
      const credential = await new SignJWT({
        email: user.email,
        email_verified: true,
        nonce: config.nonce,
        name: "Synthetic test",
      })
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setIssuer("https://accounts.google.com")
        .setAudience(clientId!)
        .setSubject(user.subject)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      const response = await request("google-login", { credential }, challenge);
      check(response.status === 200);
      const header =
        response.headers
          .getSetCookie()
          .find((h) => h.startsWith("__Host-budget_google_session=")) || "";
      check(
        header.includes("HttpOnly") &&
          header.includes("Secure") &&
          header.includes("SameSite=Lax"),
      );
      const account = await response.json();
      return {
        accountId: account.accountId as string,
        cookie: header.split(";")[0],
        credential,
        challenge,
      };
    }
    if (options.ssl) {
      stage = "Google genel imza anahtarlarına erişim";
      const response = await fetch(
        "https://www.googleapis.com/oauth2/v3/certs",
        { signal: AbortSignal.timeout(10000) },
      );
      const jwks = await response.json();
      check(
        response.ok &&
          Array.isArray(jwks.keys) &&
          jwks.keys.some(
            (key: { kty?: string; kid?: string }) =>
              key.kty === "RSA" && typeof key.kid === "string",
          ),
      );
      console.log("Google genel imza anahtarlarına HTTPS erişimi doğrulandı.");
    }
    stage = "anonim erişim ve Google zorunluluğu";
    check((await request("data")).status === 401);
    check(
      (
        await request("login", {
          email: users[0].email,
          password: randomBytes(32).toString("hex"),
        })
      ).status === 410,
    );
    stage = "iki bağımsız Google hesabı";
    const a = await login(users[0]);
    const b = await login(users[1]);
    check(Boolean(a.accountId) && a.accountId !== b.accountId);
    const first = await (await request("data", undefined, a.cookie)).json();
    check(
      first.revision === 1 &&
        isDeepStrictEqual(first.data, emptyData()) &&
        first.data.demo === false,
    );
    stage = "hesaplar arası veri ayrımı";
    const data = emptyData();
    const financeDate = new Date().toISOString().slice(0, 10);
    data.financialAccounts = [
      {
        id: "smoke-bank",
        name: "Synthetic bank",
        kind: "bank",
        currency: "TRY",
        openingBalance: 1000,
        openingDate: financeDate,
        archived: false,
      },
      {
        id: "smoke-card",
        name: "Synthetic card",
        kind: "card",
        currency: "TRY",
        openingBalance: 0,
        openingDate: financeDate,
        archived: false,
        creditLimit: 10000,
        statementDay: 15,
        paymentDay: 25,
      },
    ];
    data.paymentPlans = [
      {
        id: "smoke-plan",
        title: "Synthetic installments",
        kind: "installment",
        type: "expense",
        amount: 58.5,
        currency: "TRY",
        categoryId: "market",
        accountId: "smoke-card",
        startDate: financeDate,
        count: 3,
        archived: false,
      },
    ];
    data.accountTransfers = [
      {
        id: "smoke-transfer",
        fromId: "smoke-bank",
        toId: "smoke-card",
        amount: 19.5,
        currency: "TRY",
        date: financeDate,
        note: "Synthetic payment",
      },
    ];
    data.financialAccounts.push({
      id: "smoke-usd",
      name: "Synthetic USD",
      kind: "bank",
      currency: "USD",
      openingBalance: 100,
      openingDate: financeDate,
      archived: false,
    });
    data.accountTransfers.push({
      id: "smoke-exchange",
      fromId: "smoke-usd",
      toId: "smoke-bank",
      amount: 10,
      currency: "USD",
      date: financeDate,
      note: "Synthetic exchange",
      exchange: buildManualExchange(10, "USD", "TRY", financeDate, 40.25),
    });
    data.financialAccounts.push({
      id: "smoke-investment",
      name: "Synthetic investment",
      kind: "investment",
      currency: "TRY",
      openingBalance: 500000,
      openingDate: financeDate,
      archived: false,
    });
    data.accountTransfers.push({
      id: "smoke-investment-funding",
      fromId: "smoke-bank",
      toId: "smoke-investment",
      amount: 25,
      currency: "TRY",
      date: financeDate,
      note: "Synthetic investment funding",
    });
    data.investmentPositions = [
      {
        id: "smoke-deposit",
        accountId: "smoke-investment",
        currency: "TRY",
        name: "Synthetic deposit",
        kind: "deposit",
        startDate: financeDate,
        annualRate: 36.5,
        archived: false,
      },
    ];
    data.investmentEntries = [
      {
        id: "smoke-placement",
        positionId: "smoke-deposit",
        type: "allocate",
        amount: 1000,
        date: financeDate,
        time: "09:00",
        note: "Synthetic placement",
      },
      {
        id: "smoke-interest",
        positionId: "smoke-deposit",
        type: "income",
        amount: 10,
        date: financeDate,
        time: "12:00",
        note: "Synthetic interest",
      },
    ];
    data.transactions.push({
      accountId: "smoke-card",
      planId: "smoke-plan",
      planIndex: 0,
      id: randomUUID(),
      type: "expense",
      categoryId: "market",
      date: new Date().toISOString().slice(0, 10),
      amount: 19.5,
      description: "Synthetic deployment check",
    });
    check(
      (
        await request(
          "data",
          { accountId: a.accountId, revision: 1, data },
          a.cookie,
        )
      ).status === 200,
    );
    check(
      isDeepStrictEqual(
        (await (await request("data", undefined, a.cookie)).json()).data,
        data,
      ),
    );
    console.log(
      "Hesap, transfer ve taksit SQL kontrolü başarılı; iki kullanıcının finansal verileri ayrı.",
    );
    console.log(
      "Döviz al / sat SQL yayın kontrolü başarılı; manuel kur ve iki para birimi kayıpsız saklandı.",
    );
    console.log(
      "Yatırım SQL yayın kontrolü başarılı; hesap türü ve fon transferi kayıpsız saklandı.",
    );
    const oldPortfolioClient = { ...data };
    delete oldPortfolioClient.investmentPositions;
    delete oldPortfolioClient.investmentEntries;
    check(
      (
        await request(
          "data",
          { accountId: a.accountId, revision: 2, data: oldPortfolioClient },
          a.cookie,
        )
      ).status === 409,
    );
    console.log(
      "Yatırım portföyü SQL yayın kontrolü başarılı; anapara, mevduat ve getiri kayıtları kullanıcıya özel saklandı.",
    );
    const other = await (await request("data", undefined, b.cookie)).json();
    check(other.revision === 1 && isDeepStrictEqual(other.data, emptyData()));
    check(
      (
        await request(
          "data",
          { accountId: b.accountId, revision: 1, data },
          a.cookie,
        )
      ).status === 409,
    );
    const writes = await Promise.all([
      request("data", { accountId: a.accountId, revision: 2, data }, a.cookie),
      request("data", { accountId: a.accountId, revision: 2, data }, a.cookie),
    ]);
    check(isDeepStrictEqual(writes.map((r) => r.status).sort(), [200, 409]));
    stage = "tek kullanımlık nonce ve çıkış";
    check(
      (await request("google-login", { credential: a.credential }, a.challenge))
        .status === 401,
    );
    check((await request("logout", {}, a.cookie)).status === 200);
    check((await request("data", undefined, a.cookie)).status === 401);
    check((await request("data", undefined, b.cookie)).status === 200);
    console.log(
      "Google SQL yayın kontrolü başarılı: boş hesap, güvenli oturum, iki kullanıcı arasında veri ayrımı, nonce tekrar engeli, sürüm kontrolü ve çıkış. Kimlik sağlayıcısı bu testte yerel imzalı test sağlayıcısıdır.",
    );
  } catch {
    console.error(
      `Google SQL yayın kontrolü başarısız: ${stage}. Kişisel hesaplar değiştirilmedi.`,
    );
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      for (const user of users)
        await pool.execute("DELETE FROM budget_cloud_accounts WHERE email=?", [
          user.email,
        ]);
      for (const secret of challenges) {
        await pool.execute(
          "DELETE FROM budget_cloud_google_challenges WHERE token_hash=?",
          [tokenHash(secret)],
        );
        await pool.execute(
          "DELETE FROM budget_cloud_login_limits WHERE bucket_key=?",
          [tokenHash(`google:${secret}`)],
        );
      }
    } finally {
      await pool.end();
    }
  }
}
