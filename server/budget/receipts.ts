import { createHash } from "node:crypto";
import {
  nasFromEnvironment,
  NasStorageError,
  type NasReceiptStore,
  type NasFile,
} from "./nas";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { BudgetData } from "../../lib/budget/model";
import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS_PER_ENTRY,
  MAX_RECEIPT_STORAGE,
  MAX_STORED_RECEIPTS,
  type Receipt,
  type ReceiptKind,
} from "../../lib/budget/receipt-model";

export class ReceiptError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function receiptTarget(
  data: BudgetData | null,
  kind: ReceiptKind,
  entryId: string,
) {
  return kind === "transaction"
    ? !!data?.transactions.some((t) => t.id === entryId)
    : !!data?.accountTransfers?.some((t) => t.id === entryId);
}
export function parseReceipt(value: unknown) {
  const v = value as Record<string, unknown> | null;
  if (
    !v ||
    typeof v.id !== "string" ||
    !/^[a-f0-9-]{36}$/.test(v.id) ||
    typeof v.kind !== "string" ||
    !["transaction", "transfer"].includes(v.kind) ||
    typeof v.entryId !== "string" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(v.entryId) ||
    typeof v.name !== "string" ||
    v.name.length > 180 ||
    !v.name.trim() ||
    !/\.pdf$/i.test(v.name) ||
    /[\x00-\x1f\x7f/\\]/.test(v.name) ||
    typeof v.base64 !== "string"
  )
    throw new ReceiptError("Geçerli bir PDF dekont seç.");
  if (v.base64.length > Math.ceil(MAX_RECEIPT_BYTES / 3) * 4)
    throw new ReceiptError("Her PDF en fazla 3 MB olabilir.", 413);
  if (v.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(v.base64))
    throw new ReceiptError("PDF dosyası okunamadı.");
  const content = Buffer.from(v.base64, "base64");
  if (content.toString("base64") !== v.base64)
    throw new ReceiptError("PDF dosyası okunamadı.");
  if (!content.length || content.length > MAX_RECEIPT_BYTES)
    throw new ReceiptError("Her PDF en fazla 3 MB olabilir.", 413);
  if (
    content.subarray(0, 5).toString("ascii") !== "%PDF-" ||
    !content.subarray(-1024).includes(Buffer.from("%%EOF"))
  )
    throw new ReceiptError(
      "Dosya PDF biçiminde değil veya eksik. Bankadan indirdiğin PDF’yi seç.",
    );
  return {
    id: v.id,
    kind: v.kind as ReceiptKind,
    entryId: v.entryId,
    name: v.name.trim(),
    content,
    hash: createHash("sha256").update(content).digest("hex"),
  };
}
const metadata = (r: RowDataPacket): Receipt => ({
  id: r.id,
  kind: r.entry_kind,
  entryId: r.entry_id,
  name: r.filename,
  size: Number(r.byte_size),
  createdAt: Number(r.created_at_ms),
});
const columns =
  "r.id,r.entry_kind,r.entry_id,r.filename,r.byte_size,r.created_at_ms,(n.receipt_id IS NOT NULL) AS on_nas";
const nasJoin =
  " LEFT JOIN budget_cloud_receipt_nas n ON n.receipt_id=r.id AND n.account_id=r.account_id ";
export type ReceiptStorageOptions = {
  nas?: NasReceiptStore | null;
  enableNas?: boolean;
};
export async function enqueueNasDeletions(
  c: PoolConnection,
  accountId: string,
  ids: string[],
) {
  if (!ids.length) return;
  const time = Date.now();
  await c.execute(
    `INSERT INTO budget_cloud_receipt_nas_deletions (account_id,receipt_id,sha256,byte_size,delete_after_ms)
    SELECT r.account_id,r.id,r.sha256,r.byte_size,IF(n.receipt_id IS NULL,?,?)
    FROM budget_cloud_receipts r ${nasJoin} WHERE r.account_id=? AND r.id IN (${ids.map(() => "?").join(",")})
    ON DUPLICATE KEY UPDATE delete_after_ms=GREATEST(delete_after_ms,VALUES(delete_after_ms))`,
    [time + 60000, time, accountId, ...ids],
  );
}
function nasFile(r: RowDataPacket): NasFile {
  return {
    accountId: r.account_id,
    id: r.id,
    hash: r.sha256,
    size: Number(r.byte_size),
  };
}
function validBackup(r: RowDataPacket) {
  return (
    Buffer.isBuffer(r.content) &&
    r.content.length === Number(r.byte_size) &&
    createHash("sha256").update(r.content).digest("hex") === r.sha256
  );
}
export async function lockReceiptOwner(
  connection: PoolConnection,
  accountId: string,
) {
  await connection.execute(
    "SELECT id FROM budget_cloud_accounts WHERE id=? FOR UPDATE",
    [accountId],
  );
}
export class MysqlReceiptRepository {
  constructor(
    readonly pool: Pool,
    readonly storageOptions: ReceiptStorageOptions = {},
  ) {}
  get nasEnabled() {
    return (
      this.storageOptions.enableNas ??
      process.env.BUDGET_RECEIPT_STORAGE === "nas"
    );
  }
  private store() {
    return this.storageOptions.nas !== undefined
      ? this.storageOptions.nas
      : nasFromEnvironment();
  }
  private describe(r: RowDataPacket): Receipt {
    return {
      ...metadata(r),
      storage: r.on_nas ? "nas" : this.nasEnabled ? "pending" : "sql",
    };
  }
  async list(accountId: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ${columns} FROM budget_cloud_receipts r ${nasJoin} WHERE r.account_id=? ORDER BY r.created_at_ms,r.id`,
      [accountId],
    );
    return rows.map((r) => this.describe(r));
  }
  async get(accountId: string, id: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ${columns},r.account_id,r.sha256,r.content FROM budget_cloud_receipts r ${nasJoin} WHERE r.account_id=? AND r.id=?`,
      [accountId, id],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.on_nas) {
      try {
        const store = this.store();
        if (!store) throw new NasStorageError();
        return {
          receipt: this.describe(row),
          content: await store.get(nasFile(row)),
        };
      } catch (error) {
        if (!validBackup(row)) throw error;
      }
    }
    if (!validBackup(row)) throw new NasStorageError();
    return { receipt: this.describe(row), content: row.content as Buffer };
  }
  async remove(accountId: string, id: string) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await lockReceiptOwner(c, accountId);
      await enqueueNasDeletions(c, accountId, [id]);
      await c.execute(
        "DELETE FROM budget_cloud_receipts WHERE account_id=? AND id=?",
        [accountId, id],
      );
      await c.commit();
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
    await this.flushDeletions({ accountId, max: 1, timeoutMs: 1500 }).catch(
      () => {},
    );
  }
  async upload(accountId: string, file: ReturnType<typeof parseReceipt>) {
    await this.storeSqlFile(accountId, file);
    if (this.nasEnabled) {
      // SQL staging is durable before any remote write. Failed NAS transfers remain readable and retryable.
      await this.moveToNas(accountId, file.id, true).catch(() => {});
    }
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ${columns} FROM budget_cloud_receipts r ${nasJoin} WHERE r.account_id=? AND r.id=?`,
      [accountId, file.id],
    );
    if (!rows[0])
      throw new ReceiptError(
        "Dekont başka bir cihazdan silindi. Son verileri yükle.",
        409,
      );
    return this.describe(rows[0]);
  }
  private async storeSqlFile(
    accountId: string,
    file: ReturnType<typeof parseReceipt>,
  ) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await lockReceiptOwner(c, accountId);
      const [documents] = await c.execute<RowDataPacket[]>(
        "SELECT document FROM budget_cloud_documents WHERE account_id=?",
        [accountId],
      );
      const document = documents[0]?.document;
      const data =
        typeof document === "string" ? JSON.parse(document) : document;
      if (!receiptTarget(data, file.kind, file.entryId))
        throw new ReceiptError(
          "İşlem artık bulunamıyor. Son verileri yükleyip tekrar dene.",
          409,
        );
      const [same] = await c.execute<RowDataPacket[]>(
        `SELECT ${columns},r.account_id,r.sha256 FROM budget_cloud_receipts r ${nasJoin} WHERE r.id=?`,
        [file.id],
      );
      if (same[0]) {
        if (
          same[0].account_id !== accountId ||
          same[0].sha256 !== file.hash ||
          same[0].entry_kind !== file.kind ||
          same[0].entry_id !== file.entryId ||
          same[0].filename !== file.name
        )
          throw new ReceiptError(
            "Dosya yükleme kimliği çakıştı. PDF’yi yeniden seç.",
            409,
          );
        await c.commit();
        return metadata(same[0]);
      }
      const [deleting] = await c.execute<RowDataPacket[]>(
        "SELECT receipt_id FROM budget_cloud_receipt_nas_deletions WHERE account_id=? AND receipt_id=?",
        [accountId, file.id],
      );
      if (deleting.length)
        throw new ReceiptError(
          "Bu dosya silinmek üzere. PDF’yi yeniden seçerek yeni bir yükleme başlat.",
          409,
        );
      const [usage] = await c.execute<RowDataPacket[]>(
        "SELECT COALESCE(SUM(byte_size),0) AS used,COUNT(*) AS total,COUNT(CASE WHEN entry_kind=? AND entry_id=? THEN 1 END) AS files FROM budget_cloud_receipts WHERE account_id=?",
        [file.kind, file.entryId, accountId],
      );
      if (Number(usage[0].files) >= MAX_RECEIPTS_PER_ENTRY)
        throw new ReceiptError(
          "Bir işleme en fazla 10 dekont eklenebilir.",
          409,
        );
      if (Number(usage[0].used) + file.content.length > MAX_RECEIPT_STORAGE)
        throw new ReceiptError(
          "Hesabındaki 3 GB dekont alanı doldu. Kullanmadığın dekontları kaldır.",
          409,
        );
      if (Number(usage[0].total) >= MAX_STORED_RECEIPTS)
        throw new ReceiptError(
          `Hesap başına en fazla ${MAX_STORED_RECEIPTS} dekont saklanabilir. Kullanmadığın dekontları kaldır.`,
          409,
        );
      const createdAt = Date.now();
      await c.execute(
        "INSERT INTO budget_cloud_receipts (id,account_id,entry_kind,entry_id,filename,byte_size,sha256,content,created_at_ms) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          file.id,
          accountId,
          file.kind,
          file.entryId,
          file.name,
          file.content.length,
          file.hash,
          file.content,
          createdAt,
        ],
      );
      await c.commit();
      return {
        id: file.id,
        kind: file.kind,
        entryId: file.entryId,
        name: file.name,
        size: file.content.length,
        createdAt,
      };
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async moveToNas(accountId: string, id: string, prune = false) {
    const store = this.store();
    if (!store) throw new NasStorageError();
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await lockReceiptOwner(c, accountId);
      const [rows] = await c.execute<RowDataPacket[]>(
        `SELECT ${columns},r.account_id,r.sha256,r.content FROM budget_cloud_receipts r ${nasJoin} WHERE r.account_id=? AND r.id=?`,
        [accountId, id],
      );
      const row = rows[0];
      if (!row || (row.on_nas && (!prune || !row.content.length))) {
        await c.commit();
        return false;
      }
      if (!validBackup(row)) throw new NasStorageError();
      const file = nasFile(row);
      if (!row.on_nas) await store.put(file, row.content);
      // Read back actual bytes before switching storage or releasing the SQL backup.
      await store.get(file);
      await c.execute(
        "INSERT INTO budget_cloud_receipt_nas (receipt_id,account_id,verified_at_ms) VALUES (?,?,?) ON DUPLICATE KEY UPDATE verified_at_ms=VALUES(verified_at_ms)",
        [id, accountId, Date.now()],
      );
      if (prune)
        await c.execute(
          "UPDATE budget_cloud_receipts SET content=? WHERE account_id=? AND id=?",
          [Buffer.alloc(0), accountId, id],
        );
      await c.commit();
      return true;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async flushDeletions(
    options: {
      accountId?: string;
      max?: number;
      timeoutMs?: number;
      deadline?: number;
    } = {},
  ) {
    let store: NasReceiptStore | null;
    try {
      store = this.store();
    } catch {
      return 0;
    }
    if (!store) return 0;
    const max = Math.max(1, Math.min(20, Math.floor(options.max ?? 5)));
    const [pending] = await this.pool.execute<RowDataPacket[]>(
      `SELECT account_id,receipt_id FROM budget_cloud_receipt_nas_deletions WHERE delete_after_ms<=? ${options.accountId ? "AND account_id=?" : ""} ORDER BY delete_after_ms LIMIT ${max}`,
      [Date.now(), ...(options.accountId ? [options.accountId] : [])],
    );
    let count = 0;
    for (const item of pending) {
      if (options.deadline && Date.now() > options.deadline) break;
      const c = await this.pool.getConnection();
      try {
        await c.beginTransaction();
        await lockReceiptOwner(c, item.account_id);
        const [rows] = await c.execute<RowDataPacket[]>(
          "SELECT account_id,receipt_id AS id,sha256,byte_size FROM budget_cloud_receipt_nas_deletions WHERE account_id=? AND receipt_id=? AND delete_after_ms<=? FOR UPDATE",
          [item.account_id, item.receipt_id, Date.now()],
        );
        if (!rows[0]) {
          await c.commit();
          continue;
        }
        const [active] = await c.execute<RowDataPacket[]>(
          "SELECT id FROM budget_cloud_receipts WHERE account_id=? AND id=?",
          [item.account_id, item.receipt_id],
        );
        if (!active.length)
          await store.remove(nasFile(rows[0]), options.timeoutMs ?? 8000);
        await c.execute(
          "DELETE FROM budget_cloud_receipt_nas_deletions WHERE account_id=? AND receipt_id=?",
          [item.account_id, item.receipt_id],
        );
        await c.commit();
        count++;
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    }
    return count;
  }
  async synchronize(
    options: { max?: number; prune?: boolean; budgetMs?: number } = {},
  ) {
    if (!this.nasEnabled)
      return {
        enabled: false,
        copied: 0,
        pruned: 0,
        deleted: 0,
        pending: 0,
        backups: 0,
      };
    if (!this.store()) throw new NasStorageError();
    const deadline = Date.now() + Math.min(options.budgetMs ?? 40000, 45000);
    const max = Math.max(1, Math.min(20, Math.floor(options.max ?? 5)));
    const deleted = await this.flushDeletions({ max, deadline });
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT r.account_id,r.id FROM budget_cloud_receipts r ${nasJoin} WHERE n.receipt_id IS NULL ${options.prune ? "OR OCTET_LENGTH(r.content)>0" : ""} ORDER BY r.created_at_ms,r.id LIMIT ${max}`,
    );
    let copied = 0,
      pruned = 0;
    for (const row of rows) {
      if (Date.now() > deadline) break;
      if (
        await this.moveToNas(row.account_id, row.id, options.prune ?? false)
      ) {
        copied++;
        if (options.prune) pruned++;
      }
    }
    const [counts] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(CASE WHEN n.receipt_id IS NULL THEN 1 END) AS pending,COUNT(CASE WHEN n.receipt_id IS NOT NULL AND OCTET_LENGTH(r.content)>0 THEN 1 END) AS backups FROM budget_cloud_receipts r ${nasJoin}`,
    );
    return {
      enabled: true,
      copied,
      pruned,
      deleted,
      pending: Number(counts[0].pending),
      backups: Number(counts[0].backups),
    };
  }
}
