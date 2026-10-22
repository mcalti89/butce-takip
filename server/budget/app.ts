import express, { type Request, type Response } from "express";
import { parse as parseCookies } from "cookie";
import { randomBytes, randomUUID } from "node:crypto";
import { getBudgetRepository, type BudgetRepository } from "./mysql";
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
  const cookieName = production
    ? "__Host-budget_session"
    : "budget_session_dev";
  const cookies = {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
  };
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
        ) {
          return res
            .status(403)
            .json({ error: "İstek kaynağı doğrulanamadı." });
        }
      }
      const repository = options.repository ?? getBudgetRepository();
      const enabled = Boolean(repository && ownerEmail);
      if (!enabled)
        return res
          .status(action === "status" ? 200 : 503)
          .json({
            enabled: false,
            authenticated: false,
            error:
              "SQL bağlantısı henüz yapılandırılmadı. Yerel kayıtlarını kullanabilirsin.",
          });
      const db = repository!;
      let sessionToken = "";
      try {
        sessionToken = parseCookies(req.headers.cookie || "")[cookieName] || "";
      } catch {
        /* Invalid cookies cannot authenticate. */
      }
      const account =
        sessionToken && sessionToken.length <= 128
          ? await db.session(tokenHash(sessionToken), Date.now())
          : null;
      if (action === "status" && req.method === "GET")
        return res.json({
          enabled: true,
          authenticated: Boolean(account),
          ...(account ? { email: account.email } : {}),
        });
      if (action === "login" && req.method === "POST") {
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
        // Account-wide persistent throttling works across serverless instances and IP changes.
        if (!(await db.allowLogin(tokenHash(ownerEmail), Date.now())))
          return res
            .status(429)
            .json({
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
        const token = randomBytes(32).toString("base64url");
        await db.createSession(
          tokenHash(token),
          user.id,
          Date.now() + SESSION_MS,
        );
        res.cookie(cookieName, token, { ...cookies, maxAge: SESSION_MS });
        return res.json({
          enabled: true,
          authenticated: true,
          email: user.email,
        });
      }
      if (!account || account.email !== ownerEmail)
        return res
          .status(401)
          .json({ error: "SQL oturumun kapalı. Yeniden giriş yap." });
      if (action === "logout" && req.method === "POST") {
        await db.deleteSession(tokenHash(sessionToken));
        res.clearCookie(cookieName, cookies);
        return res.json({ ok: true });
      }
      if (action === "data" && req.method === "GET")
        return res.json(await db.read(account.id));
      if (action === "data" && req.method === "POST") {
        const { revision, data } = req.body ?? {};
        if (
          !Number.isSafeInteger(revision) ||
          revision < 0 ||
          revision >= Number.MAX_SAFE_INTEGER ||
          !validCloudData(data)
        )
          return res
            .status(400)
            .json({ error: "Bütçe verisi doğrulanamadı. Kayıt yapılmadı." });
        const next = await db.write(account.id, revision, data, Date.now());
        if (next === null)
          return res
            .status(409)
            .json({
              error:
                "Başka bir cihaz veya sekme verileri güncelledi. Son verileri yükleyip değişikliğini tekrar uygula.",
            });
        return res.json({ revision: next });
      }
      return res.status(404).json({ error: "İşlem bulunamadı." });
    } catch {
      // Driver errors can contain credentials or queries; never return or log them.
      return res
        .status(503)
        .json({
          error:
            "SQL hizmetine ulaşılamadı. Kayıt başarılı olarak gösterilmedi; bağlantıyı kontrol et.",
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
      res
        .status(error.type === "entity.too.large" ? 413 : 400)
        .json({
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
