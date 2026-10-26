import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { getBudgetRepository, type BudgetRepository } from "./mysql";
function equalToken(candidate: string, expected: string) {
  return (
    expected.length >= 32 &&
    timingSafeEqual(
      createHash("sha256").update(candidate).digest(),
      createHash("sha256").update(expected).digest(),
    )
  );
}
export function createReceiptMaintenanceApp(
  options: {
    repository?: BudgetRepository;
    secret?: string;
    cronSecret?: string;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  app.use(express.json({ limit: "1kb", strict: true }));
  app.all("/api/receipts-sync", async (req, res) => {
    if (!["GET", "POST"].includes(req.method))
      return res
        .status(405)
        .set("Allow", "GET, POST")
        .json({ error: "Bu yöntem desteklenmiyor." });
    const bearer =
      req.get("Authorization")?.match(/^Bearer ([\x21-\x7e]{32,256})$/)?.[1] ??
      "";
    if (
      !equalToken(
        bearer,
        options.secret ?? process.env.BUDGET_RECEIPT_SYNC_SECRET ?? "",
      ) &&
      !equalToken(bearer, options.cronSecret ?? process.env.CRON_SECRET ?? "")
    )
      return res.status(401).json({ error: "Yetkisiz istek." });
    try {
      const repository = options.repository ?? getBudgetRepository();
      if (!repository?.receipts)
        return res
          .status(503)
          .json({ error: "Dekont bakımı şu anda kullanılamıyor." });
      const result = await repository.receipts.synchronize({
        max: 5,
        prune: req.method === "GET" || req.body?.prune === true,
        budgetMs: 40000,
      });
      return res.json(result);
    } catch {
      return res.status(503).json({
        error:
          "NAS aktarımı tamamlanamadı. Mevcut SQL kopyaları ve silme kuyruğu korundu; yeniden denenebilir.",
      });
    }
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(400).json({ error: "İstek okunamadı." });
    },
  );
  return app;
}
export default createReceiptMaintenanceApp();
