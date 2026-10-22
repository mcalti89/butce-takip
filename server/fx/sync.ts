import { FxRepository } from "./repository";
import { fetchBulletin } from "./tcmb";
export async function syncFx(
  repository: FxRepository,
  options: {
    force?: boolean;
    historyLimit?: number;
    maxMs?: number;
    fetcher?: typeof fetchBulletin;
  } = {},
) {
  const token = await repository.acquire(options.force ?? false);
  if (!token)
    return { skipped: true, archived: 0, checked: 0, latestDate: null };
  const fetcher = options.fetcher ?? fetchBulletin;
  const deadline = Date.now() + (options.maxMs ?? 40000);
  let success = false;
  let error = "";
  let archived = 0;
  let checked = 0;
  let latestDate: string | null = null;
  try {
    const current = await fetcher();
    if (!current) throw new Error("TCMB_CURRENT_MISSING");
    latestDate = current.date;
    archived += Number(await repository.archive(current));
    checked++;
    success = true;
    const dates = await repository.missingDays(options.historyLimit ?? 0);
    // Two bounded requests at a time. A failed date remains eligible for retry;
    // weekends/holidays are not synthesized as exchange-rate bulletins.
    for (let i = 0; i < dates.length && Date.now() + 8500 < deadline; i += 2) {
      const results = await Promise.allSettled(
        dates.slice(i, i + 2).map(async (date) => {
          const b = await fetcher(date);
          if (b) return Number(await repository.archive(b));
          await repository.noPublication(date, Date.now());
          return 0;
        }),
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          archived += result.value;
          checked++;
        } else error = "TCMB_HISTORY_RETRY";
      }
      if (error) break;
    }
    return {
      skipped: false,
      archived,
      checked,
      latestDate,
      historyPending: (await repository.missingDays(1)).length > 0,
      warning: error || null,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    error =
      /^(?:INVALID_TCMB_[A-Z_]+|INCOMPLETE_TCMB_BULLETIN|DUPLICATE_TCMB_FIELD|TCMB_[A-Z_]+)$/.test(
        message,
      )
        ? message
        : "TCMB_SYNC_FAILED";
    throw new Error(error);
  } finally {
    await repository.finish(token, success, error);
  }
}
