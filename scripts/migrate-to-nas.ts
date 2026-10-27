import { createHash } from "node:crypto";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { databaseOptions } from "../server/budget/mysql";
import { nasFromEnvironment } from "../server/budget/nas";
import { NasBackendClient } from "../server/nas/remote";
import { decodeBody, MAX_REQUEST } from "../server/nas/protocol";
import {
  TABLES,
  exportSnapshot,
  sameSummary,
  validSummary,
  type Summary,
} from "../server/nas/snapshot";

// Administrative build job only. Never called by a browser route or normal cron.
async function main() {
  const mode = process.env.BUDGET_MIGRATION_OPERATION;
  if (!["snapshot", "standby-copy", "final-copy"].includes(mode ?? ""))
    throw new Error("INVALID_MIGRATION_OPERATION");
  if (process.env.BUDGET_BACKEND_URL)
    throw new Error("SOURCE_MUST_STILL_BE_AIVEN");
  if (mode === "final-copy") {
    const since = Number(process.env.BUDGET_MIGRATION_FROZEN_SINCE);
    if (
      process.env.BUDGET_WRITES_PAUSED !== "1" ||
      !Number.isSafeInteger(since) ||
      since < 1 ||
      since > Date.now()
    )
      throw new Error("FINAL_COPY_REQUIRES_CONFIRMED_WRITE_FREEZE");
    // The controller supplies the READY time of the preceding frozen deployment.
    while (Date.now() - since < 65000)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const client = new NasBackendClient(
    process.env.BUDGET_NAS_STANDBY_URL ?? "",
    process.env.BUDGET_BACKEND_SECRET ?? "",
  );
  async function request(
    action: string,
    args: Record<string, unknown> = {},
  ): Promise<any> {
    const reply = await client.request({
      method: "POST",
      path: "/internal/migration",
      headers: { "content-type": "application/json" },
      body: Buffer.from(JSON.stringify({ action, ...args })).toString("base64"),
    });
    const result = JSON.parse(decodeBody(reply.body, MAX_REQUEST).toString());
    if (reply.status !== 200)
      throw new Error(
        typeof result.error === "string" && /^[A-Z_]{1,80}$/.test(result.error)
          ? result.error
          : "NAS_MIGRATION_UNAVAILABLE",
      );
    return result;
  }
  const state = await request("status");
  if (
    !state.capabilities?.includes("verified-restore") ||
    state.upload ||
    state.job?.state === "running"
  )
    throw new Error("NAS_MIGRATION_NOT_READY");
  const options = databaseOptions();
  if (!options) throw new Error("SOURCE_DATABASE_NOT_CONFIGURED");
  const pool = createPool(options);
  const connection = await pool.getConnection();
  let backupId: string | undefined;
  let backupFinished = false;
  try {
    const [tables] = await connection.query<RowDataPacket[]>("SHOW TABLES");
    const names = tables.map((row) => String(Object.values(row)[0])).sort();
    if (
      JSON.stringify(names) !==
      JSON.stringify(TABLES.map((table) => table[0]).sort())
    )
      throw new Error("SOURCE_TABLES_REQUIRE_REVIEW");
    const [tls] = await connection.query<RowDataPacket[]>(
      "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
    );
    if (!tls[0]?.Value) throw new Error("SOURCE_TLS_REQUIRED");
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query(
      "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
    );
    const started = await request("begin");
    backupId = started.id;
    console.log("NAS migration: private encrypted snapshot started.");
    let offset = 0,
      pending = Buffer.alloc(0),
      last = Buffer.alloc(0);
    const hash = createHash("sha256");
    async function send(bytes: Buffer) {
      const data = { id: backupId, offset, data: bytes.toString("base64") };
      let reply;
      // A chunk has an explicit offset and hash, so one lost-response retry is safe.
      try {
        reply = await request("chunk", data);
      } catch {
        reply = await request("chunk", data);
      }
      if (reply.offset !== offset + bytes.length)
        throw new Error("BACKUP_OFFSET_MISMATCH");
      offset += bytes.length;
    }
    for await (const part of exportSnapshot(connection)) {
      hash.update(part);
      last = part;
      pending = Buffer.concat([pending, part]);
      while (pending.length >= 256 * 1024) {
        await send(pending.subarray(0, 256 * 1024));
        pending = pending.subarray(256 * 1024);
      }
    }
    if (pending.length) await send(pending);
    const expected: Summary = JSON.parse(last.toString()).tables;
    if (!validSummary(expected)) throw new Error("SOURCE_MANIFEST_INVALID");
    const checksum = hash.digest("hex");
    const completed = await request("finish", {
      id: backupId,
      bytes: offset,
      sha256: checksum,
    });
    backupFinished = true;
    if (
      !sameSummary(completed.tables, expected) ||
      completed.sha256 !== checksum
    )
      throw new Error("BACKUP_MANIFEST_MISMATCH");
    // Verify every NAS-only PDF referenced by this same SQL snapshot, without
    // logging names, owner IDs or file contents or changing any receipt.
    const [files] = await connection.query<RowDataPacket[]>(
      "SELECT r.id,r.account_id,r.sha256,r.byte_size FROM budget_cloud_receipts r JOIN budget_cloud_receipt_nas n ON n.receipt_id=r.id AND n.account_id=r.account_id",
    );
    const store = nasFromEnvironment();
    if (files.length && !store) throw new Error("NAS_RECEIPTS_NOT_CONFIGURED");
    for (const file of files)
      await store!.get({
        accountId: file.account_id,
        id: file.id,
        hash: file.sha256,
        size: Number(file.byte_size),
      });
    await connection.commit();
    const verified = await request("verify", { id: backupId });
    if (
      !verified.verified ||
      verified.sha256 !== checksum ||
      !sameSummary(verified.tables, expected)
    )
      throw new Error("BACKUP_VERIFICATION_FAILED");
    if (mode !== "snapshot") {
      await request("restore", { id: backupId });
      const deadline = Date.now() + 10 * 60 * 1000;
      for (;;) {
        const status = await request("status");
        if (status.job?.id === backupId && status.job.state === "verified")
          break;
        if (status.job?.state === "failed")
          throw new Error(status.job.code ?? "RESTORE_FAILED");
        if (Date.now() > deadline) throw new Error("RESTORE_STILL_RUNNING");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      const target = await request("fingerprint");
      if (!sameSummary(target.tables, expected))
        throw new Error("TARGET_MANIFEST_MISMATCH");
    }
    console.log(
      "BUDGET_MIGRATION_RESULT " +
        JSON.stringify({
          mode,
          backupId,
          encrypted: true,
          verified: true,
          bytes: offset,
          sha256: checksum,
          restored: mode !== "snapshot",
          tables: expected,
          nasReceiptsVerified: files.length,
          productionSwitched: false,
        }),
    );
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (backupId && !backupFinished)
      await request("abort", { id: backupId }).catch(() => {});
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}
main().catch((error: unknown) => {
  const code = (error as { code?: string }).code ?? (error as Error).message;
  console.error(
    "NAS migration stopped safely:",
    /^[A-Z_]{1,80}$/.test(code) ? code : "MIGRATION_FAILED",
  );
  process.exitCode = 1;
});
