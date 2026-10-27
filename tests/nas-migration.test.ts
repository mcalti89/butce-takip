import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import { createServer } from "node:http";
import { createBudgetApp } from "../server/budget/app";
import { databaseOptions, MysqlBudgetRepository } from "../server/budget/mysql";
import { emptyData } from "../lib/budget/model";
import { NasMigration } from "../server/nas/migration";
import {
  exportSnapshot,
  fingerprint,
  TABLES,
  sameSummary,
} from "../server/nas/snapshot";
const sourceUrl = process.env.MIGRATION_TEST_DATABASE_URL;
describe.skipIf(!sourceUrl)("Encrypted NAS migration with real MySQL", () => {
  let source: Pool, target: Pool, root: string, manager: NasMigration;
  const id = "11111111-1111-4111-8111-111111111111";
  const receipt = "22222222-2222-4222-8222-222222222222";
  beforeAll(async () => {
    const url = new URL(sourceUrl!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.pathname !== "/butce_migration_source"
    )
      throw new Error("Disposable localhost database required");
    const options = databaseOptions({
      NODE_ENV: "test",
      BUDGET_DATABASE_TLS: "local-only",
      BUDGET_DATABASE_URL: sourceUrl,
    })!;
    source = createPool(options);
    target = createPool({ ...options, database: "butce_migration_target" });
    const directory = new URL("../database/budget/", import.meta.url);
    for (const name of (await readdir(directory))
      .filter((s) => /^\d+-.*\.sql$/.test(s))
      .sort())
      for (const sql of (await readFile(new URL(name, directory), "utf8"))
        .split(";")
        .filter((s) => s.trim())) {
        await source.query(sql);
        await target.query(sql);
      }
  });
  beforeEach(async () => {
    for (const table of [...TABLES].reverse()) {
      await source.query(`DELETE FROM ${table[0]}`);
      await target.query(`DELETE FROM ${table[0]}`);
    }
    root = await mkdtemp(join(tmpdir(), "butce-encrypted-migration-"));
    manager = new NasMigration(
      target,
      join(root, "backups"),
      join(root, "config"),
    );
    await manager.initialize();
    const data = {
      ...emptyData(),
      demo: false,
      note: 'Umman OMR 0.001 • Türkçe "dekont"',
    };
    const pdf = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      Buffer.alloc(256 * 1024, 65),
      Buffer.from("\n%%EOF"),
    ]);
    await source.execute("INSERT INTO budget_cloud_accounts VALUES (?,?,?,?)", [
      id,
      "fixture@example.invalid",
      "disabled",
      123,
    ]);
    await source.execute(
      "INSERT INTO budget_cloud_documents VALUES (?,?,?,?)",
      [id, 7, JSON.stringify(data), 456],
    );
    await source.execute(
      "INSERT INTO budget_cloud_google_identities VALUES (?,?,?,?)",
      ["fixture-subject", id, "Çağrı 🇴🇲", true],
    );
    for (const table of [
      "budget_cloud_sessions",
      "budget_cloud_google_sessions",
    ])
      await source.execute(`INSERT INTO ${table} VALUES (?,?,?)`, [
        "a".repeat(64),
        id,
        Date.now() + 60000,
      ]);
    await source.execute(
      "INSERT INTO budget_cloud_google_challenges VALUES (?,?,?)",
      ["b".repeat(64), "c".repeat(64), Date.now() + 60000],
    );
    await source.execute(
      "INSERT INTO budget_cloud_login_limits VALUES (?,?,?)",
      ["d".repeat(64), 3, 123],
    );
    await source.execute("INSERT INTO fx_bulletins VALUES (?,?,?,?,?,?)", [
      "2026-10-26",
      "fixture",
      "https://example.invalid/fixture",
      "e".repeat(64),
      "<fixture>Kur</fixture>",
      123,
    ]);
    await source.execute(
      "INSERT INTO fx_daily_rates VALUES (?,?,?,?,?,?,?,?)",
      [
        "2026-10-26",
        "USD",
        "ABD DOLARI",
        1,
        "34.12345678",
        "35.87654321",
        null,
        "35.87654321",
      ],
    );
    await source.execute("INSERT INTO fx_unpublished_days VALUES (?,?)", [
      "2026-10-25",
      123,
    ]);
    await source.execute(
      "INSERT INTO fx_sync_state (name,archive_from_date) VALUES (?,?)",
      ["tcmb", "2026-10-01"],
    );
    await source.execute(
      "INSERT INTO budget_cloud_receipts VALUES (?,?,?,?,?,?,?,?,?)",
      [
        receipt,
        id,
        "transaction",
        "fixture-entry",
        "İşlem • Umman.pdf",
        pdf.length,
        createHash("sha256").update(pdf).digest("hex"),
        pdf,
        123,
      ],
    );
    await source.execute(
      "INSERT INTO budget_cloud_receipt_nas VALUES (?,?,?)",
      [receipt, id, 123],
    );
    await source.execute(
      "INSERT INTO budget_cloud_receipt_nas_deletions VALUES (?,?,?,?,?)",
      [id, randomUUID(), "f".repeat(64), 123, 456],
    );
  });
  afterAll(async () => {
    await source?.end();
    await target?.end();
  });
  async function snapshot() {
    const c = await source.getConnection();
    try {
      await c.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
      const chunks: Buffer[] = [];
      for await (const part of exportSnapshot(c, 123)) chunks.push(part);
      await c.commit();
      return Buffer.concat(chunks);
    } finally {
      c.release();
    }
  }
  async function upload(bytes: Buffer, replay = false) {
    const begin = (await manager.execute({ action: "begin" })) as {
      id: string;
    };
    for (let offset = 0; offset < bytes.length; offset += 25001) {
      const part = bytes.subarray(offset, offset + 25001);
      const input = {
        action: "chunk",
        id: begin.id,
        offset,
        data: part.toString("base64"),
      };
      expect(await manager.execute(input)).toEqual({
        offset: offset + part.length,
      });
      if (replay)
        expect(await manager.execute(input)).toEqual({
          offset: offset + part.length,
        });
    }
    const finish = {
      action: "finish",
      id: begin.id,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const result = await manager.execute(finish);
    expect(await manager.execute(finish)).toEqual(result);
    return begin.id;
  }
  async function wait(id: string) {
    await manager.execute({ action: "restore", id });
    for (let n = 0; n < 300; n++) {
      const status = (await manager.execute({ action: "status" })) as {
        job: { state: string; code?: string };
      };
      if (status.job.state !== "running") return status.job;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("Restore did not finish");
  }
  async function signature(pool: Pool) {
    const c = await pool.getConnection();
    try {
      return await fingerprint(c);
    } finally {
      c.release();
    }
  }
  it("does not apply the migration body limit to normal 3 MiB PDF uploads", async () => {
    const app = express();
    app.use(manager.app());
    app.use(
      createBudgetApp({
        repository: new MysqlBudgetRepository(target),
        production: true,
        origin: "https://butce.muratcalti.com",
        googleClientId: "fixture.apps.googleusercontent.com",
      }),
    );
    const server = createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error();
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/cloud?action=receipt-upload`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://butce.muratcalti.com",
          },
          body: JSON.stringify({
            content: Buffer.alloc(3 * 1024 * 1024, 65).toString("base64"),
          }),
        },
      );
      expect(response.status).toBe(401);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
  it("refuses to generate a replacement key when encrypted backups already exist", async () => {
    await upload(await snapshot());
    await rm(join(root, "config", "backup-key.txt"));
    const fresh = new NasMigration(
      target,
      join(root, "backups"),
      join(root, "config"),
    );
    await expect(fresh.initialize()).rejects.toThrow("BACKUP_KEY_MISSING");
    await expect(
      stat(join(root, "config", "backup-key.txt")),
    ).rejects.toThrow();
    await rm(root, { recursive: true, force: true });
  });
  it("encrypts privately, preserves all 14 tables and verifies byte-exact restoration", async () => {
    const bytes = await snapshot();
    const backup = await upload(bytes, true);
    const encrypted = await readFile(
      join(root, "backups", backup + ".snapshot.enc"),
    );
    expect(encrypted.includes(Buffer.from("fixture@example.invalid"))).toBe(
      false,
    );
    expect(encrypted.includes(Buffer.from("%PDF-1.4"))).toBe(false);
    expect(
      (await stat(join(root, "backups", backup + ".snapshot.enc"))).mode &
        0o777,
    ).toBe(0o600);
    expect(
      (await stat(join(root, "config", "backup-key.txt"))).mode & 0o777,
    ).toBe(0o600);
    expect(await wait(backup)).toMatchObject({ state: "verified" });
    expect(await signature(target)).toEqual(await signature(source));
    expect(
      await manager.execute({ action: "verify", id: backup }),
    ).toMatchObject({ verified: true });
    await rm(root, { recursive: true, force: true });
  });
  it("does not overwrite target records that changed after an earlier restore", async () => {
    const first = await upload(await snapshot());
    expect((await wait(first)).state).toBe("verified");
    await source.query("UPDATE budget_cloud_documents SET revision=8");
    const second = await upload(await snapshot());
    await target.query("UPDATE budget_cloud_documents SET revision=99");
    const before = await signature(target);
    expect(await wait(second)).toMatchObject({
      state: "failed",
      code: "TARGET_HAS_UNRECOGNIZED_DATA",
    });
    expect(await signature(target)).toEqual(before);
    await rm(root, { recursive: true, force: true });
  });
  it("allows replacing an unchanged standby with a final snapshot", async () => {
    const first = await upload(await snapshot());
    expect((await wait(first)).state).toBe("verified");
    await source.query("UPDATE budget_cloud_documents SET revision=8");
    const second = await upload(await snapshot());
    expect((await wait(second)).state).toBe("verified");
    expect(await signature(target)).toEqual(await signature(source));
    const again = new NasMigration(
      target,
      join(root, "backups"),
      join(root, "config"),
    );
    await again.initialize();
    manager = again;
    expect((await wait(second)).state).toBe("verified");
    await rm(root, { recursive: true, force: true });
  });
  it("rejects corrupted encrypted backups before changing target data", async () => {
    const backup = await upload(await snapshot());
    const path = join(root, "backups", backup + ".snapshot.enc");
    const bytes = await readFile(path);
    bytes[25] ^= 1;
    await writeFile(path, bytes);
    const before = await signature(target);
    await expect(
      manager.execute({ action: "verify", id: backup }),
    ).rejects.toThrow();
    expect((await wait(backup)).state).toBe("failed");
    expect(await signature(target)).toEqual(before);
    await rm(root, { recursive: true, force: true });
  });
  it("rolls back the whole restore when any row violates a foreign key", async () => {
    const first = await upload(await snapshot());
    expect((await wait(first)).state).toBe("verified");
    const before = await signature(target);
    const lines = (await snapshot())
      .toString()
      .trimEnd()
      .split("\n")
      .map((s) => JSON.parse(s));
    const row = lines.find((r) => r.table === "budget_cloud_receipts");
    row.values[1] = randomUUID();
    const footer = lines[lines.length - 1];
    for (const entry of footer.tables) {
      const rows = lines.filter((r) => r.table === entry.table);
      entry.rows = rows.length;
      entry.sha256 = createHash("sha256")
        .update(rows.map((r) => JSON.stringify(r) + "\n").join(""))
        .digest("hex");
    }
    const invalid = await upload(
      Buffer.from(lines.map((s) => JSON.stringify(s) + "\n").join("")),
    );
    expect((await wait(invalid)).state).toBe("failed");
    expect(await signature(target)).toEqual(before);
    await rm(root, { recursive: true, force: true });
  });
  it("exports one repeatable-read snapshot while source data changes", async () => {
    const c = await source.getConnection();
    await c.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    await source.query("UPDATE budget_cloud_documents SET revision=88");
    const chunks: Buffer[] = [];
    for await (const part of exportSnapshot(c)) chunks.push(part);
    await c.commit();
    c.release();
    const backup = await upload(Buffer.concat(chunks));
    expect((await wait(backup)).state).toBe("verified");
    expect(sameSummary(await signature(source), await signature(target))).toBe(
      false,
    );
    const [rows] = await target.query<any[]>(
      "SELECT revision FROM budget_cloud_documents",
    );
    expect(Number(rows[0].revision)).toBe(7);
    await rm(root, { recursive: true, force: true });
  });
  it("rejects wrong offsets, checksum errors and arbitrary operations; abort removes only a partial file", async () => {
    const begin = (await manager.execute({ action: "begin" })) as {
      id: string;
    };
    await expect(
      manager.execute({
        action: "chunk",
        id: begin.id,
        offset: 1,
        data: "YQ==",
      }),
    ).rejects.toThrow();
    await manager.execute({
      action: "chunk",
      id: begin.id,
      offset: 0,
      data: "YQ==",
    });
    await expect(
      manager.execute({
        action: "finish",
        id: begin.id,
        bytes: 1,
        sha256: "0".repeat(64),
      }),
    ).rejects.toThrow();
    await manager.execute({ action: "abort", id: begin.id });
    expect(await readdir(join(root, "backups"))).toEqual([]);
    await expect(
      manager.execute({ action: "verify", id: "../../private" }),
    ).rejects.toThrow();
    await expect(
      manager.execute({
        action: "query",
        sql: "DELETE FROM budget_cloud_accounts",
      }),
    ).rejects.toThrow();
    await rm(root, { recursive: true, force: true });
  });
});
