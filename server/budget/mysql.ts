import {
  createPool,
  type Pool,
  type PoolOptions,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { GoogleAccountConflict, type GoogleIdentity } from "./google";
import { emptyData } from "../../lib/budget/model";
import {
  MysqlReceiptRepository,
  lockReceiptOwner,
  receiptTarget,
} from "./receipts";
import type { BudgetData } from "../../lib/budget/model";

export type Account = {
  id: string;
  email: string;
  passwordHash: string;
  legacyImportAllowed?: boolean;
};
export type SessionKind = "password" | "google";
export type CloudDocument = { revision: number; data: BudgetData | null };
export interface BudgetRepository {
  receipts?: MysqlReceiptRepository;
  addGoogleChallenge(
    hash: string,
    nonceHash: string,
    expires: number,
  ): Promise<void>;
  consumeGoogleChallenge(
    hash: string,
    nonceHash: string,
    now: number,
  ): Promise<boolean>;
  googleAccount(
    identity: GoogleIdentity,
    legacyOwnerEmail: string,
    now: number,
  ): Promise<Account>;
  account(email: string): Promise<Account | null>;
  createAccount(account: Account, now: number): Promise<void>;
  allowLogin(bucket: string, now: number): Promise<boolean>;
  createSession(
    hash: string,
    accountId: string,
    expires: number,
    kind?: SessionKind,
  ): Promise<void>;
  session(
    hash: string,
    now: number,
    kind?: SessionKind,
  ): Promise<Account | null>;
  deleteSession(hash: string, kind?: SessionKind): Promise<void>;
  read(accountId: string): Promise<CloudDocument>;
  write(
    accountId: string,
    revision: number,
    data: BudgetData,
    now: number,
  ): Promise<number | null>;
}

export function databaseOptions(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): PoolOptions | null {
  if (!env.BUDGET_DATABASE_URL) return null;
  const url = new URL(env.BUDGET_DATABASE_URL);
  if (url.protocol !== "mysql:" || !url.hostname || !url.pathname.slice(1))
    throw new Error("Invalid MySQL configuration");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const insecureLocal =
    env.NODE_ENV !== "production" &&
    local &&
    env.BUDGET_DATABASE_TLS === "local-only";
  if (env.BUDGET_DATABASE_TLS === "local-only" && !insecureLocal)
    throw new Error("Unencrypted MySQL is restricted to local development");
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: insecureLocal
      ? undefined
      : {
          rejectUnauthorized: true,
          verifyIdentity: true,
          ...(env.BUDGET_DATABASE_CA
            ? { ca: env.BUDGET_DATABASE_CA.replace(/\\n/g, "\n") }
            : {}),
        },
    connectionLimit: 2,
    waitForConnections: true,
    queueLimit: 10,
    connectTimeout: 10000,
    timezone: "Z",
    multipleStatements: false,
    // Never accept TLS-disabling URL query flags or execute arbitrary URL options.
  };
}

export class MysqlBudgetRepository implements BudgetRepository {
  readonly receipts: MysqlReceiptRepository;
  constructor(readonly pool: Pool) {
    this.receipts = new MysqlReceiptRepository(pool);
  }
  async account(email: string): Promise<Account | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, email, password_hash FROM budget_cloud_accounts WHERE email = ?",
      [email],
    );
    return rows[0]
      ? {
          id: rows[0].id,
          email: rows[0].email,
          passwordHash: rows[0].password_hash,
        }
      : null;
  }
  async createAccount(account: Account, now: number) {
    // A race cannot replace the password of the account created first.
    await this.pool.execute(
      "INSERT IGNORE INTO budget_cloud_accounts (id,email,password_hash,created_at_ms) VALUES (?,?,?,?)",
      [account.id, account.email, account.passwordHash, now],
    );
  }
  async allowLogin(bucket: string, now: number) {
    const cutoff = now - 15 * 60 * 1000;
    await this.pool.execute(
      `INSERT INTO budget_cloud_login_limits (bucket_key,attempts,window_start_ms) VALUES (?,1,?)
       ON DUPLICATE KEY UPDATE
       attempts=IF(window_start_ms <= ?,1,attempts+1),
       window_start_ms=IF(window_start_ms <= ?,?,window_start_ms)`,
      [bucket, now, cutoff, cutoff, now],
    );
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT attempts FROM budget_cloud_login_limits WHERE bucket_key=?",
      [bucket],
    );
    return Number(rows[0].attempts) <= 20;
  }
  async createSession(
    hash: string,
    accountId: string,
    expires: number,
    kind: SessionKind = "password",
  ) {
    const table =
      kind === "google"
        ? "budget_cloud_google_sessions"
        : "budget_cloud_sessions";
    await this.pool.execute(`DELETE FROM ${table} WHERE expires_at_ms <= ?`, [
      Date.now(),
    ]);
    await this.pool.execute(
      `INSERT INTO ${table} (token_hash,account_id,expires_at_ms) VALUES (?,?,?)`,
      [hash, accountId, expires],
    );
  }
  async session(
    hash: string,
    now: number,
    kind: SessionKind = "password",
  ): Promise<Account | null> {
    const table =
      kind === "google"
        ? "budget_cloud_google_sessions"
        : "budget_cloud_sessions";
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT a.id,a.email,a.password_hash${kind === "google" ? ",g.legacy_import_allowed" : ""} FROM ${table} s
       JOIN budget_cloud_accounts a ON a.id=s.account_id
       ${kind === "google" ? "JOIN budget_cloud_google_identities g ON g.account_id=a.id" : ""}
       WHERE s.token_hash=? AND s.expires_at_ms>?`,
      [hash, now],
    );
    return rows[0]
      ? {
          id: rows[0].id,
          email: rows[0].email,
          passwordHash: rows[0].password_hash,
          ...(kind === "google"
            ? { legacyImportAllowed: Boolean(rows[0].legacy_import_allowed) }
            : {}),
        }
      : null;
  }
  async deleteSession(hash: string, kind: SessionKind = "password") {
    const table =
      kind === "google"
        ? "budget_cloud_google_sessions"
        : "budget_cloud_sessions";
    await this.pool.execute(`DELETE FROM ${table} WHERE token_hash=?`, [hash]);
  }
  async addGoogleChallenge(hash: string, nonceHash: string, expires: number) {
    await this.pool.execute(
      "DELETE FROM budget_cloud_google_challenges WHERE expires_at_ms <= ?",
      [Date.now()],
    );
    await this.pool.execute(
      "INSERT INTO budget_cloud_google_challenges (token_hash,nonce_hash,expires_at_ms) VALUES (?,?,?)",
      [hash, nonceHash, expires],
    );
  }
  async consumeGoogleChallenge(hash: string, nonceHash: string, now: number) {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM budget_cloud_google_challenges WHERE token_hash=? AND nonce_hash=? AND expires_at_ms>?",
      [hash, nonceHash, now],
    );
    return result.affectedRows === 1;
  }
  async googleAccount(
    identity: GoogleIdentity,
    legacyOwnerEmail: string,
    now: number,
  ): Promise<Account> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();
        const [linked] = await connection.execute<RowDataPacket[]>(
          "SELECT a.id,a.email,a.password_hash,g.legacy_import_allowed FROM budget_cloud_google_identities g JOIN budget_cloud_accounts a ON a.id=g.account_id WHERE g.google_subject=?",
          [identity.subject],
        );
        let account: Account;
        if (linked[0]) {
          account = {
            id: linked[0].id,
            email: linked[0].email,
            passwordHash: linked[0].password_hash,
            legacyImportAllowed: Boolean(linked[0].legacy_import_allowed),
          };
        } else {
          const [existing] = await connection.execute<RowDataPacket[]>(
            "SELECT a.id,a.email,a.password_hash,g.google_subject,g.legacy_import_allowed FROM budget_cloud_accounts a LEFT JOIN budget_cloud_google_identities g ON g.account_id=a.id WHERE a.email=? FOR UPDATE",
            [identity.email],
          );
          const row = existing[0];
          if (row?.google_subject === identity.subject) {
            // A concurrent first login may have committed after our initial
            // snapshot read. The locking read above sees its matching identity.
            account = {
              id: row.id,
              email: row.email,
              passwordHash: row.password_hash,
              legacyImportAllowed: Boolean(row.legacy_import_allowed),
            };
          } else {
            if (
              row &&
              (row.google_subject ||
                identity.email !== legacyOwnerEmail ||
                !identity.authoritativeEmail ||
                !String(row.password_hash).startsWith("scrypt-v1:"))
            )
              throw new GoogleAccountConflict();
            account = row
              ? {
                  id: row.id,
                  email: row.email,
                  passwordHash: row.password_hash,
                }
              : { id: randomUUID(), email: identity.email, passwordHash: "" };
            account.legacyImportAllowed =
              identity.email === legacyOwnerEmail &&
              identity.authoritativeEmail;
            if (!row)
              await connection.execute(
                "INSERT INTO budget_cloud_accounts (id,email,password_hash,created_at_ms) VALUES (?,?,?,?)",
                [account.id, account.email, account.passwordHash, now],
              );
            await connection.execute(
              "INSERT INTO budget_cloud_google_identities (google_subject,account_id,display_name,legacy_import_allowed) VALUES (?,?,?,?)",
              [
                identity.subject,
                account.id,
                identity.name,
                account.legacyImportAllowed,
              ],
            );
          }
        }
        await connection.execute(
          "INSERT IGNORE INTO budget_cloud_documents (account_id,revision,document,updated_at_ms) VALUES (?,1,?,?)",
          [account.id, JSON.stringify(emptyData()), now],
        );
        await connection.commit();
        return account;
      } catch (error) {
        await connection.rollback();
        if (
          attempt < 2 &&
          ["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
            (error as { code?: string }).code || "",
          )
        )
          continue;
        throw error;
      } finally {
        connection.release();
      }
    }
    throw new Error("Account could not be created");
  }
  async read(accountId: string): Promise<CloudDocument> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT revision,document FROM budget_cloud_documents WHERE account_id=?",
      [accountId],
    );
    if (!rows[0]) return { revision: 0, data: null };
    return {
      revision: Number(rows[0].revision),
      data:
        typeof rows[0].document === "string"
          ? JSON.parse(rows[0].document)
          : rows[0].document,
    };
  }
  async write(
    accountId: string,
    revision: number,
    data: BudgetData,
    now: number,
  ) {
    // The same owner lock serializes uploads, quota checks and document deletion.
    // Receipt cleanup commits only with the successful document revision.
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await lockReceiptOwner(connection, accountId);
      if (revision === 0) {
        try {
          await connection.execute(
            "INSERT INTO budget_cloud_documents (account_id,revision,document,updated_at_ms) VALUES (?,1,?,?)",
            [accountId, JSON.stringify(data), now],
          );
          await connection.commit();
          return 1;
        } catch (error) {
          if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
            await connection.rollback();
            return null;
          }
          throw error;
        }
      }
      const [result] = await connection.execute<ResultSetHeader>(
        "UPDATE budget_cloud_documents SET document=?,revision=revision+1,updated_at_ms=? WHERE account_id=? AND revision=?",
        [JSON.stringify(data), now, accountId, revision],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return null;
      }
      const [files] = await connection.execute<RowDataPacket[]>(
        "SELECT id,entry_kind,entry_id FROM budget_cloud_receipts WHERE account_id=?",
        [accountId],
      );
      const removed = files.filter(
        (f) => !receiptTarget(data, f.entry_kind, f.entry_id),
      );
      for (const f of removed)
        await connection.execute(
          "DELETE FROM budget_cloud_receipts WHERE account_id=? AND id=?",
          [accountId, f.id],
        );
      await connection.commit();
      return revision + 1;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

let repository: MysqlBudgetRepository | undefined;
export function getBudgetRepository() {
  if (repository) return repository;
  const options = databaseOptions();
  if (!options) return null;
  repository = new MysqlBudgetRepository(createPool(options));
  return repository;
}
