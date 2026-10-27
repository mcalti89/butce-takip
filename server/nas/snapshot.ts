import { createHash } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

// Fixed identifiers only. A snapshot cannot choose tables, columns or SQL.
export const TABLES = [
  ["budget_cloud_accounts", "id,email,password_hash,created_at_ms", "id"],
  [
    "budget_cloud_sessions",
    "token_hash,account_id,expires_at_ms",
    "token_hash",
  ],
  [
    "budget_cloud_documents",
    "account_id,revision,document,updated_at_ms",
    "account_id",
  ],
  [
    "budget_cloud_login_limits",
    "bucket_key,attempts,window_start_ms",
    "bucket_key",
  ],
  [
    "budget_cloud_google_identities",
    "google_subject,account_id,display_name,legacy_import_allowed",
    "google_subject",
  ],
  [
    "budget_cloud_google_sessions",
    "token_hash,account_id,expires_at_ms",
    "token_hash",
  ],
  [
    "budget_cloud_google_challenges",
    "token_hash,nonce_hash,expires_at_ms",
    "token_hash",
  ],
  [
    "fx_bulletins",
    "rate_date,bulletin_no,source_url,xml_sha256,raw_xml,fetched_at_ms",
    "rate_date",
  ],
  [
    "fx_daily_rates",
    "rate_date,currency_code,currency_name,unit,forex_buying,forex_selling,banknote_buying,banknote_selling",
    "rate_date,currency_code",
  ],
  ["fx_unpublished_days", "rate_date,checked_at_ms", "rate_date"],
  [
    "fx_sync_state",
    "name,archive_from_date,lease_token,lease_until_ms,next_attempt_ms,last_attempt_ms,last_success_ms,last_error_code",
    "name",
  ],
  [
    "budget_cloud_receipts",
    "id,account_id,entry_kind,entry_id,filename,byte_size,sha256,content,created_at_ms",
    "id",
  ],
  [
    "budget_cloud_receipt_nas",
    "receipt_id,account_id,verified_at_ms",
    "receipt_id",
  ],
  [
    "budget_cloud_receipt_nas_deletions",
    "account_id,receipt_id,sha256,byte_size,delete_after_ms",
    "account_id,receipt_id",
  ],
] as const;
export const SNAPSHOT_SCHEMA = createHash("sha256")
  .update(JSON.stringify(TABLES))
  .digest("hex");
export type Cell = string | null | { blob: string };
export type SnapshotRow = { table: string; values: Cell[] };
export type Summary = { table: string; rows: number; sha256: string }[];
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(object)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonical(object[key]))
      .join(",") +
    "}"
  );
}
function cell(value: unknown, column: string): Cell {
  if (value === null) return null;
  if (column === "document")
    return canonical(typeof value === "string" ? JSON.parse(value) : value);
  if (Buffer.isBuffer(value)) return { blob: value.toString("base64") };
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  throw new Error("SNAPSHOT_CELL");
}
export function snapshotRow(
  table: (typeof TABLES)[number],
  row: RowDataPacket,
): SnapshotRow {
  return {
    table: table[0],
    values: table[1].split(",").map((column) => cell(row[column], column)),
  };
}
export async function* tableRows(
  connection: PoolConnection,
  table: (typeof TABLES)[number],
) {
  for (let offset = 0; ; offset += 100) {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT ${table[1]} FROM ${table[0]} ORDER BY ${table[2]} LIMIT 100 OFFSET ?`,
      [offset],
    );
    for (const row of rows) yield snapshotRow(table, row);
    if (rows.length < 100) return;
  }
}
export async function fingerprint(
  connection: PoolConnection,
): Promise<Summary> {
  const summary: Summary = [];
  for (const table of TABLES) {
    const hash = createHash("sha256");
    let rows = 0;
    for await (const row of tableRows(connection, table)) {
      hash.update(JSON.stringify(row) + "\n");
      rows++;
    }
    summary.push({ table: table[0], rows, sha256: hash.digest("hex") });
  }
  return summary;
}
// Caller holds one REPEATABLE READ consistent snapshot until iteration ends.
export async function* exportSnapshot(
  connection: PoolConnection,
  createdAt = Date.now(),
) {
  yield Buffer.from(
    JSON.stringify({
      format: "butce-mysql-snapshot",
      version: 1,
      schema: SNAPSHOT_SCHEMA,
      createdAt,
    }) + "\n",
  );
  const summary: Summary = [];
  for (const table of TABLES) {
    const hash = createHash("sha256");
    let rows = 0;
    for await (const row of tableRows(connection, table)) {
      const line = JSON.stringify(row) + "\n";
      hash.update(line);
      rows++;
      yield Buffer.from(line);
    }
    summary.push({ table: table[0], rows, sha256: hash.digest("hex") });
  }
  yield Buffer.from(JSON.stringify({ end: true, tables: summary }) + "\n");
}
export function sameSummary(a: Summary, b: Summary) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function validSummary(input: unknown): input is Summary {
  return (
    Array.isArray(input) &&
    input.length === TABLES.length &&
    input.every(
      (entry, i) =>
        entry?.table === TABLES[i][0] &&
        Number.isSafeInteger(entry.rows) &&
        entry.rows >= 0 &&
        /^[a-f0-9]{64}$/.test(entry.sha256),
    )
  );
}
export function sqlValues(row: SnapshotRow) {
  const table = TABLES.find((t) => t[0] === row.table);
  if (
    !table ||
    !Array.isArray(row.values) ||
    row.values.length !== table[1].split(",").length
  )
    throw new Error("SNAPSHOT_ROW");
  return row.values.map((value, index) => {
    if (value === null || typeof value === "string") return value;
    if (
      table[1].split(",")[index] !== "content" ||
      !value ||
      typeof value.blob !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value.blob)
    )
      throw new Error("SNAPSHOT_BINARY");
    const bytes = Buffer.from(value.blob, "base64");
    if (
      bytes.toString("base64") !== value.blob ||
      bytes.length > 3 * 1024 * 1024
    )
      throw new Error("SNAPSHOT_BINARY");
    return bytes;
  });
}
