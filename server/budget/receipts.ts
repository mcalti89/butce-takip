import { createHash } from "node:crypto";
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
const columns = "id,entry_kind,entry_id,filename,byte_size,created_at_ms";
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
  constructor(readonly pool: Pool) {}
  async list(accountId: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ${columns} FROM budget_cloud_receipts WHERE account_id=? ORDER BY created_at_ms,id`,
      [accountId],
    );
    return rows.map(metadata);
  }
  async get(accountId: string, id: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ${columns},content FROM budget_cloud_receipts WHERE account_id=? AND id=?`,
      [accountId, id],
    );
    return rows[0]
      ? { receipt: metadata(rows[0]), content: rows[0].content as Buffer }
      : null;
  }
  async remove(accountId: string, id: string) {
    await this.pool.execute(
      "DELETE FROM budget_cloud_receipts WHERE account_id=? AND id=?",
      [accountId, id],
    );
  }
  async upload(accountId: string, file: ReturnType<typeof parseReceipt>) {
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
        `SELECT ${columns},account_id,sha256 FROM budget_cloud_receipts WHERE id=?`,
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
          "Hesabındaki 100 MB dekont alanı doldu. Kullanmadığın dekontları kaldır.",
          409,
        );
      if (Number(usage[0].total) >= MAX_STORED_RECEIPTS)
        throw new ReceiptError(
          "Hesap başına en fazla 1000 dekont saklanabilir. Kullanmadığın dekontları kaldır.",
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
}
