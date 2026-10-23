import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { databaseOptions } from "../server/budget/mysql";
import { FxRepository } from "../server/fx/repository";
import {
  parseBulletin,
  tcmbUrl,
  shiftDay,
  istanbulDate,
} from "../server/fx/tcmb";
import { syncFx } from "../server/fx/sync";
import { createFxApp } from "../server/fx/app";
import { tcmbFixture } from "./fixtures/tcmb";
const databaseUrl = process.env.FX_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("Gerçek MySQL TCMB arşivi ve API", () => {
  let pool: Pool, repo: FxRepository, server: Server, base: string;
  const secret = "test-only-cron-secret-32-characters-long";
  const b = (d = "2026-10-21") =>
    parseBulletin(tcmbFixture(d), tcmbUrl(d), Date.now(), d);
  const noop = vi.fn().mockResolvedValue({
    skipped: true,
    archived: 0,
    checked: 0,
    latestDate: null,
  });
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/butce_fx_test"
    )
      throw new Error("Disposable localhost/butce_fx_test required");
    pool = createPool(
      databaseOptions({
        BUDGET_DATABASE_URL: databaseUrl,
        BUDGET_DATABASE_TLS: "local-only",
        NODE_ENV: "test",
      })!,
    );
    for (const s of (
      await readFile(
        new URL("../database/budget/003-fx-archive.sql", import.meta.url),
        "utf8",
      )
    )
      .split(";")
      .filter((s) => s.trim()))
      await pool.query(s);
    for (const t of [
      "fx_daily_rates",
      "fx_bulletins",
      "fx_unpublished_days",
      "fx_sync_state",
    ])
      await pool.query("DELETE FROM " + t);
    repo = new FxRepository(pool);
    const app = createFxApp({
      repository: repo,
      cronSecret: secret,
      sync: noop,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.on("listening", r));
    const a = server.address();
    if (!a || typeof a === "string") throw new Error("No address");
    base = `http://127.0.0.1:${a.port}`;
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    if (pool) await pool.end();
  });
  it("aynı bülteni eşzamanlı arşivleme mükerrer veya yarım veri oluşturmaz", async () => {
    const result = await Promise.all([repo.archive(b()), repo.archive(b())]);
    expect(result.sort()).toEqual([false, true]);
    const latest = await repo.latest(["USD", "JPY"]);
    expect(latest.date).toBe("2026-10-21");
    expect(latest.rates).toHaveLength(2);
    expect(latest.rates.find((r) => r.currency === "JPY")?.unit).toBe(100);
  });
  it("eski bülteni tekrar çekmek daha yeni bülteni geri almaz; gün bazlı tarihçe korunur", async () => {
    await repo.archive(b("2026-10-20"));
    await repo.archive(b());
    const latest = await repo.latest(["USD"]);
    expect(latest.date).toBe("2026-10-21");
    expect(
      (await repo.history("USD", "2026-10-01", "2026-10-22")).map(
        (r) => r.date,
      ),
    ).toEqual(["2026-10-21", "2026-10-20"]);
  });
  it("tatil tarihindeki işlem için önceki bülteni kullanır, gelecekteki kuru seçmez", async () => {
    expect((await repo.rate("USD", "2026-10-22"))?.date).toBe("2026-10-21");
    expect((await repo.rate("USD", "2026-10-20"))?.date).toBe("2026-10-20");
    expect(await repo.rate("USD", "2026-10-19")).toBeNull();
  });
  it("OMR latest, historical and holiday quotes derive from archived USD without changing official XML", async () => {
    const before = await repo.status();
    const usd = await repo.rate("USD", "2026-10-22");
    const result = await repo.latest(["OMR"]);
    expect(result.rates).toHaveLength(1);
    expect(result.rates[0].currency).toBe("OMR");
    expect(result.rates[0].rateSource).toBe("TCMB_USD_OMR_PEG");
    expect(result.rates[0].forexSelling).toBeCloseTo(
      usd!.forexSelling! / 0.3845,
      7,
    );
    expect((await repo.rate("OMR", "2026-10-22"))?.date).toBe("2026-10-21");
    expect(await repo.rate("OMR", "2026-10-19")).toBeNull();
    expect(
      (await repo.history("OMR", "2026-10-01", "2026-10-22")).map(
        (q) => q.currency,
      ),
    ).toEqual(["OMR", "OMR"]);
    const response = await fetch(base + "/api/fx?action=latest&codes=OMR");
    expect(response.status).toBe(200);
    expect((await response.json()).rates[0].currency).toBe("OMR");
    const history = await fetch(
      base +
        "/api/fx?action=history&currency=OMR&from=2026-10-01&to=2026-10-22",
    );
    expect(history.status).toBe(200);
    expect((await history.json()).rates).toHaveLength(2);
    const rate = await fetch(
      base + "/api/fx?action=rate&currency=OMR&date=2026-10-22",
    );
    expect(rate.status).toBe(200);
    expect((await rate.json()).rate.rateSource).toBe("TCMB_USD_OMR_PEG");
    expect((await repo.status()).bulletinCount).toBe(before.bulletinCount);
  });
  it("ham XML, kaynak ve SHA-256 SQL arşivinde bulunur", async () => {
    const [rows] = await pool.query<any[]>(
      "SELECT raw_xml,source_url,xml_sha256 FROM fx_bulletins WHERE rate_date=?",
      ["2026-10-21"],
    );
    expect(rows[0].raw_xml).toBe(tcmbFixture());
    expect(rows[0].source_url).toBe(tcmbUrl("2026-10-21"));
    expect(rows[0].xml_sha256).toBe(b().sha256);
  });
  it("birden fazla süreç aynı anda kaynağı çağırmaz; başarısızlıkta tekrar deneme vardır", async () => {
    const locks = await Promise.all([repo.acquire(true), repo.acquire(true)]);
    expect(locks.filter(Boolean)).toHaveLength(1);
    await repo.finish(locks.find(Boolean)!, false, "TCMB_SYNC_FAILED");
    expect(await repo.acquire(false)).toBeNull();
    expect((await repo.status()).lastError).toBe("TCMB_SYNC_FAILED");
  });
  it("başarılı senkronizasyon güncel arşivi ve durumu doldurur, aynı kaynak tekrar mükerrer olmaz", async () => {
    const fetcher = vi.fn().mockResolvedValue(b());
    const r = await syncFx(repo, { force: true, fetcher });
    expect(r.latestDate).toBe("2026-10-21");
    expect(r.archived).toBe(0);
    expect((await repo.status()).lastError).toBeNull();
    expect((await repo.status()).lastSuccessAt).not.toBeNull();
  });
  it("TCMB erişimi kesilirse geçmiş arşiv korunur ve hata durumu saklanır", async () => {
    await expect(
      syncFx(repo, {
        force: true,
        fetcher: vi.fn().mockRejectedValue(new Error("network")),
      }),
    ).rejects.toThrow();
    expect((await repo.latest(["USD"])).date).toBe("2026-10-21");
    expect((await repo.status()).lastError).toBe("TCMB_SYNC_FAILED");
  });
  it("404 iş günü olmayan tarih için sahte kur üretmez ve tekrar taramayı sınırlar", async () => {
    const date = shiftDay(istanbulDate(), -1);
    await repo.noPublication(date, Date.now());
    expect(await repo.missingDays(130)).not.toContain(date);
  });
  it("cron anahtarsız/yabancı anahtarla çalışmaz, query string anahtar kabul etmez", async () => {
    expect((await fetch(base + "/api/fx-sync")).status).toBe(403);
    expect((await fetch(base + "/api/fx-sync?secret=" + secret)).status).toBe(
      403,
    );
    expect(
      (
        await fetch(base + "/api/fx-sync", {
          headers: { Authorization: "Bearer bad" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + "/api/fx-sync", {
          headers: { Authorization: "Bearer " + secret },
        })
      ).status,
    ).toBe(200);
  });
  it("latest/history/rate API SQL değerlerini doğru tarih ve birimle sunar", async () => {
    const r = await fetch(base + "/api/fx?action=latest&codes=USD,JPY");
    const data = await r.json();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(data.source).toBe("TCMB");
    expect(data.archive.bulletinCount).toBe(2);
    expect(data.rates.find((q: any) => q.currency === "JPY").unit).toBe(100);
    const h = await (
      await fetch(
        base +
          "/api/fx?action=history&currency=USD&from=2026-10-01&to=2026-10-22",
      )
    ).json();
    expect(h.rates).toHaveLength(2);
    const q = await (
      await fetch(base + "/api/fx?action=rate&currency=USD&date=2026-10-20")
    ).json();
    expect(q.rate.date).toBe("2026-10-20");
  });
  it.each([
    "action=unknown",
    "action=latest&codes=USD%27",
    "action=rate&currency=USD&date=2026-02-30",
    "action=rate&currency=USD&date=2099-01-01",
    "action=history&currency=USD&from=2026-10-21&to=2026-10-20",
    "action=history&currency=USD&from=2020-01-01&to=2026-10-22",
  ])("geçersiz sorguyu reddeder: %s", async (q) =>
    expect((await fetch(base + "/api/fx?" + q)).status).toBe(400),
  );
  it("arşivden önceki tarihe 404 verir, POST yazımı açmaz", async () => {
    expect(
      (await fetch(base + "/api/fx?action=rate&currency=USD&date=2026-10-19"))
        .status,
    ).toBe(404);
    expect((await fetch(base + "/api/fx", { method: "POST" })).status).toBe(
      405,
    );
  });
});
