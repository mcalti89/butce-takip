import {
  createPool,
  type Pool,
  type PoolOptions,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import type { BudgetData } from "../../lib/budget/model";

export type Account = { id: string; email: string; passwordHash: string };
export type CloudDocument = { revision: number; data: BudgetData | null };
export interface BudgetRepository {
  account(email: string): Promise<Account | null>;
  createAccount(account: Account, now: number): Promise<void>;
  allowLogin(bucket: string, now: number): Promise<boolean>;
  createSession(
    hash: string,
    accountId: string,
    expires: number,
  ): Promise<void>;
  session(hash: string, now: number): Promise<Account | null>;
  deleteSession(hash: string): Promise<void>;
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
  constructor(readonly pool: Pool) {}
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
  async createSession(hash: string, accountId: string, expires: number) {
    await this.pool.execute(
      "DELETE FROM budget_cloud_sessions WHERE expires_at_ms <= ?",
      [Date.now()],
    );
    await this.pool.execute(
      "INSERT INTO budget_cloud_sessions (token_hash,account_id,expires_at_ms) VALUES (?,?,?)",
      [hash, accountId, expires],
    );
  }
  async session(hash: string, now: number): Promise<Account | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT a.id,a.email,a.password_hash FROM budget_cloud_sessions s
       JOIN budget_cloud_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at_ms>?`,
      [hash, now],
    );
    return rows[0]
      ? {
          id: rows[0].id,
          email: rows[0].email,
          passwordHash: rows[0].password_hash,
        }
      : null;
  }
  async deleteSession(hash: string) {
    await this.pool.execute(
      "DELETE FROM budget_cloud_sessions WHERE token_hash=?",
      [hash],
    );
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
    if (revision === 0) {
      try {
        await this.pool.execute(
          "INSERT INTO budget_cloud_documents (account_id,revision,document,updated_at_ms) VALUES (?,1,?,?)",
          [accountId, JSON.stringify(data), now],
        );
        return 1;
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY") return null;
        throw error;
      }
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE budget_cloud_documents SET document=?,revision=revision+1,updated_at_ms=? WHERE account_id=? AND revision=?",
      [JSON.stringify(data), now, accountId, revision],
    );
    return result.affectedRows === 1 ? revision + 1 : null;
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
