import "dotenv/config";
import { createPool } from "mysql2/promise";
import { databaseOptions } from "../server/budget/mysql";
import { FxRepository } from "../server/fx/repository";
import { syncFx } from "../server/fx/sync";
import { fetchBulletin } from "../server/fx/tcmb";

async function main() {
  const options = databaseOptions();
  if (!options) throw new Error("SQL_NOT_CONFIGURED");
  const pool = createPool(options);
  const repo = new FxRepository(pool);
  try {
    // Bootstrap the dashboard's three-calendar-month window in bounded batches.
    // Progress is persisted; a later cron can resume after a source outage.
    const deadline = Date.now() + 150000;
    const current = await fetchBulletin();
    if (!current) throw new Error("TCMB_CURRENT_MISSING");
    let archived = 0;
    for (let batch = 0; batch < 16 && Date.now() + 45000 < deadline; batch++) {
      const result = await syncFx(repo, {
        force: true,
        historyLimit: 12,
        maxMs: 40000,
        fetcher: (date) =>
          date ? fetchBulletin(date) : Promise.resolve(current),
      });
      archived += result.archived;
      if (result.skipped || !result.historyPending || result.warning) break;
    }
    const status = await repo.status();
    if (!status.bulletinCount) throw new Error("FX_ARCHIVE_EMPTY");
    console.log(
      `TCMB SQL arşivi hazır: ${status.bulletinCount} bülten, son tarih ${status.latestDate}, yeni ${archived}.`,
    );
    if ((await repo.missingDays(1)).length)
      console.log("TCMB geçmiş arşivi sonraki otomatik görevde tamamlanacak.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    console.log(
      "TCMB kaynak hata kodu:",
      /^[A-Z_]{1,60}$/.test(code) ? code : "TCMB_SYNC_FAILED",
    );
    const status = await repo.status();
    if (!status.bulletinCount) throw new Error("FX_INITIAL_SYNC_FAILED");
    console.log(
      "TCMB kaynağına şu an ulaşılamıyor; mevcut SQL arşivi korundu, otomatik yeniden denenecek.",
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "TCMB arşivi hazırlanamadı. SQL ve resmî kaynak erişimini kontrol et.",
  );
  process.exitCode = 1;
});
