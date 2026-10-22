import express from "express";
import { timingSafeEqual } from "node:crypto";
import { getBudgetRepository } from "../budget/mysql";
import { TCMB_CURRENCY_CODES } from "../../lib/budget/fx";
import { FxRepository } from "./repository";
import { syncFx } from "./sync";
import { istanbulDate, validDate } from "./tcmb";

export function createFxApp(
  options: {
    repository?: FxRepository;
    cronSecret?: string;
    sync?: typeof syncFx;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.all(["/api/fx", "/api/fx-sync"], async (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method !== "GET")
      return res
        .status(405)
        .set("Allow", "GET")
        .json({ error: "method_not_allowed" });
    const cron = req.path === "/api/fx-sync";
    if (cron) {
      const secret = options.cronSecret ?? process.env.CRON_SECRET ?? "";
      const actual = Buffer.from(req.headers.authorization || "");
      const expected = Buffer.from("Bearer " + secret);
      if (
        secret.length < 32 ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        return res.status(403).json({ error: "cron_not_authorized" });
    }
    const action = req.query.action ?? "latest";
    const codesInput = req.query.codes ?? "";
    const currency = req.query.currency;
    if (
      !cron &&
      (!["latest", "history", "rate", "status"].includes(String(action)) ||
        typeof action !== "string")
    )
      return res.status(400).json({ error: "invalid_action" });
    if (typeof codesInput !== "string" || codesInput.length > 90)
      return res.status(400).json({ error: "invalid_currency_codes" });
    const codes = codesInput ? [...new Set(codesInput.split(","))] : [];
    const allowed = (s: unknown) =>
      typeof s === "string" &&
      (TCMB_CURRENCY_CODES as readonly string[]).includes(s);
    if (codes.length > 22 || codes.some((c) => !allowed(c)))
      return res.status(400).json({ error: "invalid_currency_codes" });
    const today = istanbulDate();
    if (
      !cron &&
      ["history", "rate"].includes(String(action)) &&
      !allowed(currency)
    )
      return res.status(400).json({ error: "invalid_currency_code" });
    const start = req.query.from;
    const end = req.query.to ?? today;
    const date = req.query.date;
    if (
      !cron &&
      action === "history" &&
      (!validDate(start) ||
        !validDate(end) ||
        start > end ||
        end > today ||
        Date.parse(end) - Date.parse(start) > 400 * 86400000)
    )
      return res.status(400).json({ error: "invalid_range" });
    if (!cron && action === "rate" && (!validDate(date) || date > today))
      return res.status(400).json({ error: "invalid_date" });
    try {
      const repo =
        options.repository ??
        (() => {
          const b = getBudgetRepository();
          return b ? new FxRepository(b.pool) : null;
        })();
      if (!repo)
        return res.status(503).json({ error: "fx_service_not_configured" });
      if (cron)
        return res.json({
          source: "TCMB",
          ...(await (options.sync ?? syncFx)(repo, {
            force: true,
            historyLimit: 8,
            maxMs: 40000,
          })),
        });
      if (action === "status")
        return res.json({ source: "TCMB", ...(await repo.status()) });
      if (action === "latest") {
        // Opportunistic recovery between scheduled runs; the shared SQL lease
        // and cooldown prevent every user/page load from contacting TCMB.
        await (options.sync ?? syncFx)(repo, {
          historyLimit: 0,
          maxMs: 12000,
        }).catch(() => undefined);
        const latest = await repo.latest(codes);
        if (!latest.date)
          return res.status(503).json({ error: "no_rates_yet" });
        return res.json({
          source: "TCMB",
          ...latest,
          archive: await repo.status(),
        });
      }
      if (action === "history")
        return res.json({
          source: "TCMB",
          currency,
          rates: await repo.history(
            String(currency),
            String(start),
            String(end),
          ),
        });
      const rate = await repo.rate(String(currency), String(date));
      return rate
        ? res.json({ source: "TCMB", rate })
        : res.status(404).json({ error: "no_rate_on_or_before_date" });
    } catch {
      return res.status(503).json({ error: "fx_service_unavailable" });
    }
  });
  return app;
}
export default createFxApp();
