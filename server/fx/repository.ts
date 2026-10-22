import { randomBytes } from "node:crypto";
import {
  type Pool,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
import type { Bulletin } from "./tcmb";
import { initialArchiveDate, istanbulDate, shiftDay } from "./tcmb";
import type { FxQuote } from "../../lib/budget/fx";

const fields = `r.rate_date,r.currency_code,r.currency_name,r.unit,r.forex_buying,r.forex_selling,
  r.banknote_buying,r.banknote_selling,b.bulletin_no,b.fetched_at_ms`;
const from =
  " FROM fx_daily_rates r JOIN fx_bulletins b ON b.rate_date=r.rate_date ";
function quote(r: RowDataPacket): FxQuote {
  const number = (v: unknown) => (v == null ? null : Number(v));
  return {
    date: r.rate_date,
    currency: r.currency_code,
    currencyName: r.currency_name,
    unit: Number(r.unit),
    forexBuying: number(r.forex_buying),
    forexSelling: number(r.forex_selling),
    banknoteBuying: number(r.banknote_buying),
    banknoteSelling: number(r.banknote_selling),
    bulletinNo: r.bulletin_no,
    fetchedAtUtc: new Date(Number(r.fetched_at_ms)).toISOString(),
  };
}
export class FxRepository {
  constructor(readonly pool: Pool) {}
  async archive(b: Bulletin) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const [insert] = await c.execute<ResultSetHeader>(
        "INSERT IGNORE INTO fx_bulletins (rate_date,bulletin_no,source_url,xml_sha256,raw_xml,fetched_at_ms) VALUES (?,?,?,?,?,?)",
        [b.date, b.number, b.sourceUrl, b.sha256, b.xml, b.fetchedAt],
      );
      if (insert.affectedRows) {
        const rows = b.rates.map((q) => [
          q.date,
          q.currency,
          q.currencyName,
          q.unit,
          q.forexBuying,
          q.forexSelling,
          q.banknoteBuying,
          q.banknoteSelling,
        ]);
        await c.query(
          "INSERT INTO fx_daily_rates (rate_date,currency_code,currency_name,unit,forex_buying,forex_selling,banknote_buying,banknote_selling) VALUES ?",
          [rows],
        );
      }
      await c.execute("DELETE FROM fx_unpublished_days WHERE rate_date=?", [
        b.date,
      ]);
      await c.commit();
      return insert.affectedRows > 0;
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
  async noPublication(date: string, now: number) {
    await this.pool.execute(
      "INSERT INTO fx_unpublished_days (rate_date,checked_at_ms) VALUES (?,?) ON DUPLICATE KEY UPDATE checked_at_ms=VALUES(checked_at_ms)",
      [date, now],
    );
  }
  async acquire(force: boolean, now = Date.now()) {
    await this.pool.execute(
      "INSERT IGNORE INTO fx_sync_state (name,archive_from_date) VALUES ('tcmb',?)",
      [initialArchiveDate(istanbulDate(now))],
    );
    const token = randomBytes(32).toString("hex");
    const [r] = await this.pool.execute<ResultSetHeader>(
      `UPDATE fx_sync_state SET lease_token=?,lease_until_ms=?,last_attempt_ms=? WHERE name='tcmb' AND lease_until_ms<=? ${force ? "" : "AND next_attempt_ms<=?"}`,
      [token, now + 120000, now, now, ...(!force ? [now] : [])],
    );
    return r.affectedRows ? token : null;
  }
  async finish(
    token: string,
    success: boolean,
    code: string,
    now = Date.now(),
  ) {
    await this.pool.execute(
      `UPDATE fx_sync_state SET lease_token='',lease_until_ms=0,next_attempt_ms=?,last_error_code=?,last_success_ms=IF(?, ?, last_success_ms) WHERE name='tcmb' AND lease_token=?`,
      [
        now + (success && !code ? 4 * 3600000 : 15 * 60000),
        code,
        success,
        now,
        token,
      ],
    );
  }
  async missingDays(limit: number, now = Date.now()) {
    const [state] = await this.pool.query<RowDataPacket[]>(
      "SELECT archive_from_date FROM fx_sync_state WHERE name='tcmb'",
    );
    const floor =
      state[0]?.archive_from_date ?? initialArchiveDate(istanbulDate(now));
    const [known] = await this.pool.execute<RowDataPacket[]>(
      `SELECT rate_date FROM fx_bulletins WHERE rate_date>=? UNION SELECT rate_date FROM fx_unpublished_days WHERE rate_date>=? AND checked_at_ms>?`,
      [floor, floor, now - 30 * 86400000],
    );
    const set = new Set(known.map((r) => r.rate_date));
    const missing: string[] = [];
    for (
      let d = shiftDay(istanbulDate(now), -1);
      d >= floor && missing.length < limit;
      d = shiftDay(d, -1)
    )
      if (!set.has(d)) missing.push(d);
    return missing;
  }
  async latest(codes: string[]) {
    const [dates] = await this.pool.query<RowDataPacket[]>(
      "SELECT MAX(rate_date) AS date FROM fx_bulletins",
    );
    const date: string | null = dates[0].date;
    if (!date) return { date: null, rates: [] as FxQuote[] };
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ${fields}${from}WHERE r.rate_date=? ${codes.length ? `AND r.currency_code IN (${codes.map(() => "?").join(",")})` : ""} ORDER BY r.currency_code`,
      [date, ...codes],
    );
    return { date, rates: rows.map(quote) };
  }
  async history(currency: string, start: string, end: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ${fields}${from}WHERE r.currency_code=? AND r.rate_date BETWEEN ? AND ? ORDER BY r.rate_date DESC LIMIT 400`,
      [currency, start, end],
    );
    return rows.map(quote);
  }
  async rate(currency: string, date: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ${fields}${from}WHERE r.currency_code=? AND r.rate_date<=? AND r.forex_buying>0 AND r.forex_selling>0 ORDER BY r.rate_date DESC LIMIT 1`,
      [currency, date],
    );
    return rows[0] ? quote(rows[0]) : null;
  }
  async status() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT MIN(rate_date) AS firstDate,MAX(rate_date) AS latestDate,COUNT(*) AS bulletinCount FROM fx_bulletins",
    );
    const [states] = await this.pool.query<RowDataPacket[]>(
      "SELECT archive_from_date,last_attempt_ms,last_success_ms,last_error_code FROM fx_sync_state WHERE name='tcmb'",
    );
    const state = states[0];
    return {
      firstDate: rows[0].firstDate as string | null,
      latestDate: rows[0].latestDate as string | null,
      bulletinCount: Number(rows[0].bulletinCount),
      archiveFrom: state?.archive_from_date ?? initialArchiveDate(),
      lastAttemptAt: state?.last_attempt_ms
        ? new Date(Number(state.last_attempt_ms)).toISOString()
        : null,
      lastSuccessAt: state?.last_success_ms
        ? new Date(Number(state.last_success_ms)).toISOString()
        : null,
      lastError: state?.last_error_code || null,
      automatic: true,
      schedule: "0 13 * * *",
      timeZone: "UTC",
    };
  }
}
