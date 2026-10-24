import { validInvestmentChanges } from "./investments";
import express, { type Request, type Response } from "express";
import { parse as parseCookies } from "cookie";
import { randomBytes, randomUUID } from "node:crypto";
import {
  getBudgetRepository,
  type Account,
  type BudgetRepository,
} from "./mysql";
import {
  GoogleAccountConflict,
  makeGoogleVerifier,
  type GoogleVerifier,
} from "./google";
import {
  hashPassword,
  sameSecret,
  tokenHash,
  validCloudData,
  verifyPassword,
} from "./security";

type Options = {
  repository?: BudgetRepository;
  ownerEmail?: string;
  ownerPassword?: string;
  origin?: string;
  production?: boolean;
  googleClientId?: string;
  googleVerifier?: GoogleVerifier;
};
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export function createBudgetApp(options: Options = {}) {
  const app = express();
  app.disable("x-powered-by");
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const ownerEmail = (
    options.ownerEmail ??
    process.env.BUDGET_OWNER_EMAIL ??
    ""
  )
    .trim()
    .toLowerCase();
  const ownerPassword =
    options.ownerPassword ?? process.env.BUDGET_OWNER_PASSWORD ?? "";
  const origin =
    options.origin ??
    process.env.BUDGET_APP_ORIGIN ??
    "https://butcetakip-vercel-drop.vercel.app";
  const clientId =
    options.googleClientId ?? process.env.BUDGET_GOOGLE_CLIENT_ID ?? "";
  const googleEnabled = Boolean(clientId);
  const verifyGoogle = options.googleVerifier ?? makeGoogleVerifier(clientId);
  const kind = googleEnabled ? "google" : "password";
  const cookieName = production
    ? `__Host-budget_${googleEnabled ? "google_" : ""}session`
    : `budget_${googleEnabled ? "google_" : ""}session_dev`;
  const challengeCookie = (nonce: string) =>
    production
      ? `__Host-budget_google_challenge_${nonce}`
      : `budget_google_challenge_dev_${nonce}`;
  const cookies = {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
  };
  const statusFor = (account: Account | null) => ({
    enabled: true,
    googleEnabled,
    authenticated: Boolean(account),
    ...(account
      ? {
          accountId: account.id,
          email: account.email,
          legacyImportAllowed: Boolean(account.legacyImportAllowed),
        }
      : {}),
  });
  async function issueSession(
    db: BudgetRepository,
    account: Account,
    res: Response,
  ) {
    const token = randomBytes(32).toString("base64url");
    await db.createSession(
      tokenHash(token),
      account.id,
      Date.now() + SESSION_MS,
      kind,
    );
    res.cookie(cookieName, token, { ...cookies, maxAge: SESSION_MS });
    return res.json(statusFor(account));
  }
  app.use("/api/cloud", (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  app.use("/api/cloud", express.json({ limit: "5mb", strict: true }));
  app.all("/api/cloud", async (req: Request, res: Response) => {
    try {
      const action =
        typeof req.query.action === "string" ? req.query.action : "status";
      if (!["GET", "POST"].includes(req.method))
        return res
          .status(405)
          .set("Allow", "GET, POST")
          .json({ error: "Bu yöntem desteklenmiyor." });
      if (req.method === "POST") {
        const allowed = [
          origin,
          ...(!production
            ? ["http://localhost:8081", "http://127.0.0.1:8081"]
            : []),
        ];
        if (
          !allowed.includes(req.headers.origin || "") ||
          !req.is("application/json")
        )
          return res
            .status(403)
            .json({ error: "İstek kaynağı doğrulanamadı." });
      }
      const repository = options.repository ?? getBudgetRepository();
      if (!repository || (!googleEnabled && !ownerEmail))
        return res.status(action === "status" ? 200 : 503).json({
          enabled: false,
          googleEnabled,
          authenticated: false,
          error: "Hesap hizmeti henüz yapılandırılmadı.",
        });
      const db = repository;
      let parsed: ReturnType<typeof parseCookies> = {};
      try {
        parsed = parseCookies(req.headers.cookie || "");
      } catch {
        /* Invalid cookies cannot authenticate. */
      }
      const sessionToken = parsed[cookieName] || "";
      const account =
        sessionToken && sessionToken.length <= 128
          ? await db.session(tokenHash(sessionToken), Date.now(), kind)
          : null;
      if (action === "status" && req.method === "GET") {
        if (!account) await db.account(ownerEmail);
        return res.json(statusFor(account));
      }
      if (action === "google-config" && req.method === "GET") {
        if (!googleEnabled)
          return res
            .status(503)
            .json({ error: "Google ile giriş henüz yapılandırılmadı." });
        if (req.get("Sec-Fetch-Site") === "cross-site")
          return res
            .status(403)
            .json({ error: "İstek kaynağı doğrulanamadı." });
        const secret = randomBytes(32).toString("base64url");
        const nonce = randomBytes(32).toString("base64url");
        await db.addGoogleChallenge(
          tokenHash(secret),
          tokenHash(nonce),
          Date.now() + 10 * 60 * 1000,
        );
        res.cookie(challengeCookie(nonce), secret, {
          ...cookies,
          maxAge: 10 * 60 * 1000,
        });
        return res.json({ clientId, nonce });
      }
      if (action === "google-login" && req.method === "POST") {
        if (!googleEnabled)
          return res
            .status(503)
            .json({ error: "Google ile giriş henüz yapılandırılmadı." });
        const credential = req.body?.credential;
        // Decode only to select a per-attempt cookie; signature and nonce are
        // verified below before any identity is trusted. Parallel tabs keep
        // independent challenges instead of replacing each other's cookie.
        let claimedNonce = "";
        if (typeof credential === "string" && credential.length <= 8192) {
          try {
            const { decodeJwt } = await import("jose");
            const value = decodeJwt(credential).nonce;
            if (typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value))
              claimedNonce = value;
          } catch {
            /* Invalid JWT cannot choose a challenge. */
          }
        }
        const secret = claimedNonce
          ? parsed[challengeCookie(claimedNonce)] || ""
          : "";
        if (!claimedNonce || !/^[A-Za-z0-9_-]{43}$/.test(secret))
          return res.status(401).json({
            error: "Google oturumu doğrulanamadı. Yeniden giriş yap.",
          });
        if (!(await db.allowLogin(tokenHash(`google:${secret}`), Date.now())))
          return res.status(429).json({
            error: "Çok fazla giriş denemesi. Yeniden denemeden önce bekle.",
          });
        let identity;
        try {
          identity = await verifyGoogle(credential);
        } catch {
          return res.status(401).json({
            error: "Google oturumu doğrulanamadı. Yeniden giriş yap.",
          });
        }
        if (
          !(await db.consumeGoogleChallenge(
            tokenHash(secret),
            tokenHash(identity.nonce),
            Date.now(),
          ))
        )
          return res.status(401).json({
            error:
              "Google giriş isteğinin süresi dolmuş veya kullanılmış. Yeniden giriş yap.",
          });
        res.clearCookie(challengeCookie(claimedNonce), cookies);
        let user;
        try {
          user = await db.googleAccount(identity, ownerEmail, Date.now());
        } catch (error) {
          if (error instanceof GoogleAccountConflict)
            return res.status(409).json({
              error:
                "Bu e-postanın mevcut hesabıyla güvenli bağlantı kurulamadı. Mevcut kayıtlar korundu; hesap desteği gerekiyor.",
            });
          throw error;
        }
        if (account) await db.deleteSession(tokenHash(sessionToken), kind);
        return await issueSession(db, user, res);
      }
      if (action === "login" && req.method === "POST") {
        if (googleEnabled)
          return res
            .status(410)
            .json({ error: "Lütfen Google ile giriş yap." });
        const email =
          typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";
        const password =
          typeof req.body?.password === "string" ? req.body.password : "";
        if (
          !email ||
          email.length > 254 ||
          password.length < 12 ||
          password.length > 256
        )
          return res.status(401).json({ error: "E-posta veya parola hatalı." });
        if (!(await db.allowLogin(tokenHash(ownerEmail), Date.now())))
          return res.status(429).json({
            error: "Çok fazla giriş denemesi. 15 dakika sonra tekrar dene.",
          });
        let user = await db.account(email);
        if (
          !user &&
          email === ownerEmail &&
          ownerPassword.length >= 12 &&
          sameSecret(password, ownerPassword)
        ) {
          await db.createAccount(
            {
              id: randomUUID(),
              email,
              passwordHash: await hashPassword(password),
            },
            Date.now(),
          );
          user = await db.account(email);
        }
        if (
          !user ||
          email !== ownerEmail ||
          !(await verifyPassword(password, user.passwordHash))
        )
          return res.status(401).json({ error: "E-posta veya parola hatalı." });
        return await issueSession(db, user, res);
      }
      if (!account || (!googleEnabled && account.email !== ownerEmail))
        return res
          .status(401)
          .json({ error: "Oturumun kapalı. Yeniden giriş yap." });
      if (action === "logout" && req.method === "POST") {
        await db.deleteSession(tokenHash(sessionToken), kind);
        res.clearCookie(cookieName, cookies);
        return res.json({ ok: true });
      }
      if (action === "data" && req.method === "GET")
        return res.json({
          accountId: account.id,
          ...(await db.read(account.id)),
        });
      if (action === "data" && req.method === "POST") {
        const { revision, data, accountId } = req.body ?? {};
        if (
          (googleEnabled || accountId !== undefined) &&
          accountId !== account.id
        )
          return res.status(409).json({
            code: "ACCOUNT_CHANGED",
            error:
              "Açık hesap değişti. Eski ekrandaki kayıt gönderilmedi; sayfayı yenile.",
          });
        if (
          !Number.isSafeInteger(revision) ||
          revision < 0 ||
          revision >= Number.MAX_SAFE_INTEGER ||
          !validCloudData(data)
        )
          return res
            .status(400)
            .json({ error: "Bütçe verisi doğrulanamadı. Kayıt yapılmadı." });
        const financeKeys = [
          "financialAccounts",
          "accountTransfers",
          "paymentPlans",
          "investmentPositions",
          "investmentEntries",
        ] as const;
        if (
          revision > 0 &&
          financeKeys.some((key) => data[key] === undefined)
        ) {
          const previous = await db.read(account.id);
          if (
            financeKeys.some(
              (key) =>
                data[key] === undefined &&
                (previous.data?.[key]?.length ?? 0) > 0,
            )
          )
            return res.status(409).json({
              code: "APP_UPDATE_REQUIRED",
              error:
                "Bu ekran eski sürümde kaldı. Hesap ve planların korunması için sayfayı yenileyip tekrar dene.",
            });
        }
        if (data.financialAccounts?.some((a) => a.kind === "investment")) {
          const previous = await db.read(account.id);
          if (previous.revision !== revision)
            return res.status(409).json({
              error:
                "Başka bir cihaz veya sekme verileri güncelledi. Son verileri yükleyip değişikliğini tekrar uygula.",
            });
          if (!validInvestmentChanges(previous.data, data))
            return res.status(400).json({
              error:
                "Yatırım hesabına yalnızca transfer eklenebilir. Geçmiş kayıtlar korunur; yeni gelir/gider, ödeme planı veya döviz dönüşümü için Nakit, Banka ya da Kredi kartı seç.",
            });
        }
        const next = await db.write(account.id, revision, data, Date.now());
        if (next === null)
          return res.status(409).json({
            error:
              "Başka bir cihaz veya sekme verileri güncelledi. Son verileri yükleyip değişikliğini tekrar uygula.",
          });
        return res.json({ accountId: account.id, revision: next });
      }
      return res.status(404).json({ error: "İşlem bulunamadı." });
    } catch {
      return res.status(503).json({
        error:
          "Hesap hizmetine ulaşılamadı. Kayıt başarılı olarak gösterilmedi; bağlantını kontrol et.",
      });
    }
  });
  app.use(
    (
      error: { type?: string },
      _req: Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      res.status(error.type === "entity.too.large" ? 413 : 400).json({
        error:
          error.type === "entity.too.large"
            ? "Bütçe belgesi en fazla 5 MB olabilir."
            : "İstek okunamadı.",
      });
    },
  );
  return app;
}
export default createBudgetApp();
