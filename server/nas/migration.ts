import express from "express";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  type CipherGCM,
  type Hash,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  stat,
  statfs,
  readdir,
  chmod,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip, type Gzip } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
import type { Pool } from "mysql2/promise";
import { decodeBody, keyBytes } from "./protocol";
import {
  TABLES,
  SNAPSHOT_SCHEMA,
  fingerprint,
  sameSummary,
  sqlValues,
  validSummary,
  type Summary,
  type SnapshotRow,
} from "./snapshot";
const MAGIC = Buffer.from("BTDB1\n");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_BYTES = 512 * 1024 * 1024;
type Backup = {
  id: string;
  bytes: number;
  sha256: string;
  tables: Summary;
  createdAt: number;
};
type Upload = {
  id: string;
  offset: number;
  hash: Hash;
  zip: Gzip;
  cipher: CipherGCM;
  done: Promise<void>;
  previous?: { offset: number; hash: string; bytes: number };
  failed: boolean;
};
type Job = {
  id: string;
  state: "running" | "verified" | "failed";
  tables?: Summary;
  code?: string;
};
async function atomicJson(path: string, data: unknown) {
  const file = await open(path + ".new", "w", 0o600);
  try {
    await file.writeFile(JSON.stringify(data));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(path + ".new", path);
}
export class NasMigration {
  private upload?: Upload;
  private job?: Job;
  private queue: Promise<unknown> = Promise.resolve();
  private key!: Buffer;
  constructor(
    private pool: Pool,
    private backups: string,
    private config: string,
  ) {}
  async initialize() {
    await mkdir(this.backups, { recursive: true, mode: 0o700 });
    await mkdir(this.config, { recursive: true, mode: 0o700 });
    const keyPath = join(this.config, "backup-key.txt");
    try {
      await readFile(keyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (
        (await readdir(this.backups)).some((name) =>
          name.endsWith(".snapshot.enc"),
        )
      )
        throw new Error("BACKUP_KEY_MISSING");
    }
    try {
      await writeFile(keyPath, randomBytes(32).toString("hex") + "\n", {
        mode: 0o600,
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await chmod(keyPath, 0o600);
    this.key = keyBytes(await readFile(keyPath, "utf8"));
  }
  private path(id: string, extension: string) {
    if (!UUID.test(id)) throw new Error("INVALID_BACKUP_ID");
    return join(this.backups, id + extension);
  }
  private async space() {
    const free = await statfs(this.backups);
    if (Number(free.bavail) * Number(free.bsize) < 256 * 1024 * 1024)
      throw new Error("BACKUP_DISK_RESERVE");
  }
  private async metadata(id: string): Promise<Backup> {
    const data = JSON.parse(await readFile(this.path(id, ".json"), "utf8"));
    if (
      data.id !== id ||
      !validSummary(data.tables) ||
      !Number.isSafeInteger(data.bytes) ||
      data.bytes < 1 ||
      data.bytes > MAX_BYTES ||
      !/^[a-f0-9]{64}$/.test(data.sha256)
    )
      throw new Error("BACKUP_METADATA");
    return data;
  }
  // Verify AEAD authentication, complete format, all table counts/hashes and
  // plaintext checksum. No plaintext snapshot is written to the NAS filesystem.
  private async scan(id: string, insert?: (row: SnapshotRow) => Promise<void>) {
    const path = this.path(id, ".snapshot.enc");
    const size = (await stat(path)).size;
    if (size < MAGIC.length + 12 + 16) throw new Error("BACKUP_INCOMPLETE");
    const handle = await open(path, "r");
    const prefix = Buffer.alloc(MAGIC.length + 12);
    const tag = Buffer.alloc(16);
    try {
      await handle.read(prefix, 0, prefix.length, 0);
      await handle.read(tag, 0, 16, size - 16);
    } finally {
      await handle.close();
    }
    if (!prefix.subarray(0, MAGIC.length).equals(MAGIC))
      throw new Error("BACKUP_HEADER");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      prefix.subarray(MAGIC.length),
    );
    decipher.setAuthTag(tag);
    const source = createReadStream(path, {
      start: prefix.length,
      end: size - 17,
    });
    const unzip = createGunzip();
    const complete = pipeline(source, decipher, unzip);
    complete.catch(() => {});
    const summary = TABLES.map((table) => ({
      table: table[0],
      rows: 0,
      hash: createHash("sha256"),
    }));
    const digest = createHash("sha256");
    let bytes = 0,
      pending = "",
      lineNumber = 0,
      tableIndex = 0;
    let footer: Summary | undefined;
    const decoder = new StringDecoder("utf8");
    try {
      for await (const raw of unzip) {
        const chunk = Buffer.from(raw);
        bytes += chunk.length;
        digest.update(chunk);
        if (bytes > MAX_BYTES) throw new Error("BACKUP_TOO_LARGE");
        pending += decoder.write(chunk);
        if (Buffer.byteLength(pending) > 16 * 1024 * 1024)
          throw new Error("BACKUP_ROW_TOO_LARGE");
        for (
          let end = pending.indexOf("\n");
          end >= 0;
          end = pending.indexOf("\n")
        ) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          const item = JSON.parse(line);
          lineNumber++;
          if (lineNumber === 1) {
            if (
              item.format !== "butce-mysql-snapshot" ||
              item.version !== 1 ||
              item.schema !== SNAPSHOT_SCHEMA ||
              !Number.isSafeInteger(item.createdAt)
            )
              throw new Error("BACKUP_SCHEMA");
          } else if (item.end === true) {
            if (footer || !validSummary(item.tables))
              throw new Error("BACKUP_FOOTER");
            footer = item.tables;
          } else {
            if (footer) throw new Error("BACKUP_TRAILING_DATA");
            const index = TABLES.findIndex((table) => table[0] === item.table);
            if (index < tableIndex) throw new Error("BACKUP_TABLE_ORDER");
            tableIndex = index;
            if (index < 0) throw new Error("BACKUP_TABLE");
            sqlValues(item);
            summary[index].hash.update(line + "\n");
            summary[index].rows++;
            if (insert) await insert(item);
          }
        }
      }
      pending += decoder.end();
      await complete;
      const actual = summary.map(({ table, rows, hash }) => ({
        table,
        rows,
        sha256: hash.digest("hex"),
      }));
      if (pending || !footer || !sameSummary(actual, footer))
        throw new Error("BACKUP_MANIFEST_MISMATCH");
      return { tables: actual, bytes, sha256: digest.digest("hex") };
    } finally {
      source.destroy();
      decipher.destroy();
      unzip.destroy();
    }
  }
  private async restore(id: string) {
    try {
      const backup = await this.metadata(id);
      const checked = await this.scan(id);
      if (
        backup.sha256 !== checked.sha256 ||
        backup.bytes !== checked.bytes ||
        !sameSummary(backup.tables, checked.tables)
      )
        throw new Error("BACKUP_CHANGED");
      let previous: Summary | undefined;
      try {
        const state = JSON.parse(
          await readFile(join(this.config, "restored.json"), "utf8"),
        );
        if (validSummary(state.tables)) previous = state.tables;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const connection = await this.pool.getConnection();
      try {
        await connection.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
        );
        await connection.beginTransaction();
        const before = await fingerprint(connection);
        if (!sameSummary(before, backup.tables)) {
          if (
            before.some((t) => t.rows > 0) &&
            (!previous || !sameSummary(previous, before))
          )
            throw new Error("TARGET_HAS_UNRECOGNIZED_DATA");
          for (const table of [...TABLES].reverse())
            await connection.query(`DELETE FROM ${table[0]}`);
          await this.scan(id, async (row) => {
            const table = TABLES.find((t) => t[0] === row.table)!;
            await connection.execute(
              `INSERT INTO ${table[0]} (${table[1]}) VALUES (${row.values.map(() => "?").join(",")})`,
              sqlValues(row),
            );
          });
          const after = await fingerprint(connection);
          if (!sameSummary(after, backup.tables))
            throw new Error("RESTORE_MISMATCH");
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      await atomicJson(join(this.config, "restored.json"), {
        id,
        tables: backup.tables,
        verifiedAt: Date.now(),
      });
      this.job = { id, state: "verified", tables: backup.tables };
    } catch (error) {
      const code =
        (error as { code?: string }).code ?? (error as Error).message;
      this.job = {
        id,
        state: "failed",
        code: /^[A-Z_]{1,80}$/.test(code) ? code : "RESTORE_FAILED",
      };
    }
  }
  private async handle(input: Record<string, unknown>) {
    const action = input.action;
    if (action === "status")
      return {
        version: 1,
        capabilities: ["encrypted-backup", "verified-restore"],
        upload: this.upload
          ? {
              id: this.upload.id,
              offset: this.upload.offset,
              failed: this.upload.failed,
            }
          : null,
        job: this.job ?? null,
      };
    if (this.job?.state === "running") throw new Error("RESTORE_RUNNING");
    if (action === "begin") {
      if (this.upload) throw new Error("UPLOAD_ALREADY_ACTIVE");
      await this.space();
      const id = randomUUID();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.key, iv);
      const output = createWriteStream(this.path(id, ".part"), {
        flags: "wx",
        mode: 0o600,
      });
      output.write(Buffer.concat([MAGIC, iv]));
      const zip = createGzip();
      const done = pipeline(zip, cipher, output);
      const upload: Upload = {
        id,
        offset: 0,
        hash: createHash("sha256"),
        zip,
        cipher,
        done,
        failed: false,
      };
      done.catch(() => {
        upload.failed = true;
      });
      this.upload = upload;
      return { id, offset: 0 };
    }
    if (action === "abort") {
      const upload = this.upload;
      if (!upload) return { aborted: true };
      if (input.id !== upload.id) throw new Error("UPLOAD_STATE");
      upload.zip.destroy(new Error("UPLOAD_ABORTED"));
      await upload.done.catch(() => {});
      await unlink(this.path(upload.id, ".part")).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      this.upload = undefined;
      return { aborted: true };
    }
    if (action === "chunk") {
      const upload = this.upload;
      if (
        !upload ||
        upload.failed ||
        input.id !== upload.id ||
        !Number.isSafeInteger(input.offset)
      )
        throw new Error("UPLOAD_STATE");
      const bytes = decodeBody(input.data, 256 * 1024);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (
        upload.previous &&
        upload.previous.offset === input.offset &&
        upload.previous.hash === hash &&
        upload.previous.bytes === bytes.length
      )
        return { offset: upload.offset };
      if (
        input.offset !== upload.offset ||
        !bytes.length ||
        upload.offset + bytes.length > MAX_BYTES
      )
        throw new Error("UPLOAD_OFFSET");
      await this.space();
      await new Promise<void>((resolve, reject) =>
        upload.zip.write(bytes, (error) => (error ? reject(error) : resolve())),
      );
      upload.previous = { offset: upload.offset, hash, bytes: bytes.length };
      upload.hash.update(bytes);
      upload.offset += bytes.length;
      return { offset: upload.offset };
    }
    if (action === "finish") {
      if (typeof input.id !== "string" || typeof input.sha256 !== "string")
        throw new Error("UPLOAD_STATE");
      const upload = this.upload;
      if (!upload || upload.id !== input.id) {
        const saved = await this.metadata(input.id);
        if (saved.sha256 !== input.sha256) throw new Error("BACKUP_CHANGED");
        return saved;
      }
      if (
        upload.failed ||
        input.bytes !== upload.offset ||
        upload.hash.copy().digest("hex") !== input.sha256
      )
        throw new Error("UPLOAD_DIGEST");
      upload.zip.end();
      await upload.done;
      const file = await open(this.path(upload.id, ".part"), "a");
      try {
        await file.write(upload.cipher.getAuthTag());
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(
        this.path(upload.id, ".part"),
        this.path(upload.id, ".snapshot.enc"),
      );
      this.upload = undefined;
      const verified = await this.scan(upload.id);
      if (verified.bytes !== input.bytes || verified.sha256 !== input.sha256)
        throw new Error("BACKUP_CHANGED");
      const saved: Backup = {
        id: upload.id,
        ...verified,
        createdAt: Date.now(),
      };
      await atomicJson(this.path(upload.id, ".json"), saved);
      return saved;
    }
    if (action === "verify") {
      if (typeof input.id !== "string") throw new Error("BACKUP_ID");
      const metadata = await this.metadata(input.id);
      const checked = await this.scan(input.id);
      if (
        metadata.sha256 !== checked.sha256 ||
        !sameSummary(metadata.tables, checked.tables) ||
        metadata.bytes !== checked.bytes
      )
        throw new Error("BACKUP_CHANGED");
      return { verified: true, ...metadata };
    }
    if (action === "restore") {
      if (this.upload || typeof input.id !== "string")
        throw new Error("RESTORE_STATE");
      await this.metadata(input.id);
      this.job = { id: input.id, state: "running" };
      void this.restore(input.id);
      return this.job;
    }
    if (action === "fingerprint") {
      const connection = await this.pool.getConnection();
      try {
        await connection.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
        );
        await connection.query(
          "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
        );
        const tables = await fingerprint(connection);
        await connection.commit();
        return { tables };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
    throw new Error("UNKNOWN_MIGRATION_ACTION");
  }
  execute(input: Record<string, unknown>) {
    const next = this.queue.then(() => this.handle(input));
    this.queue = next.catch(() => {});
    return next;
  }
  app() {
    const app = express();
    app.use(
      "/internal/migration",
      express.json({ limit: "1mb", strict: true }),
    );
    app.post("/internal/migration", async (req, res) => {
      try {
        res.json(await this.execute(req.body));
      } catch (error) {
        const code = (error as Error).message;
        res.status(409).json({
          error: /^[A-Z_]{1,80}$/.test(code)
            ? code
            : "MIGRATION_OPERATION_FAILED",
        });
      }
    });
    return app;
  }
}
