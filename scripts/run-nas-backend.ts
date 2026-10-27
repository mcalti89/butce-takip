import express from "express";
import { NasMigration } from "../server/nas/migration";
import { createServer } from "node:http";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createPool } from "mysql2/promise";
import { databaseOptions, MysqlBudgetRepository } from "../server/budget/mysql";
import { createBudgetApp } from "../server/budget/app";
import { createFxApp } from "../server/fx/app";
import { FxRepository } from "../server/fx/repository";
import { createReceiptMaintenanceApp } from "../server/budget/receipt-maintenance";
import { createNasGateway } from "../server/nas/gateway";

declare const NAS_SCHEMA: string[];
async function main() {
  process.env.NODE_ENV = "production";
  if (
    !process.env.BUDGET_GOOGLE_CLIENT_ID?.endsWith(
      ".apps.googleusercontent.com",
    )
  )
    throw new Error("GOOGLE_CONFIG");
  const password = (
    await readFile("/run/mysql/mysql-app-password.txt", "utf8")
  ).trim();
  process.env.BUDGET_DATABASE_URL = `mysql://butce_app:${encodeURIComponent(password)}@mysql:3306/butce`;
  process.env.BUDGET_DATABASE_CA = await readFile("/run/mysql/ca.pem", "utf8");
  process.env.BUDGET_NAS_SECRET = (
    await readFile("/run/private/receipt-key.txt", "utf8")
  ).trim();
  process.env.BUDGET_NAS_URL = "https://dekont.muratcalti.com";
  process.env.BUDGET_RECEIPT_STORAGE = "nas";
  const keyFile = "/config/api-key.txt";
  try {
    await writeFile(keyFile, randomBytes(32).toString("hex") + "\n", {
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await chmod(keyFile, 0o600);
  const secret = (await readFile(keyFile, "utf8")).trim();
  const options = databaseOptions();
  if (!options) throw new Error("MYSQL_CONFIG");
  const pool = createPool(options);
  // Only the app account and CA are mounted; the root password/CA signing key
  // remain outside this container. Every migration is additive/idempotent.
  for (const sql of NAS_SCHEMA)
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await pool.query(statement);
  const repository = new MysqlBudgetRepository(pool);
  const inner = express();
  const migration = new NasMigration(pool, "/backups", "/config");
  await migration.initialize();
  inner.use(migration.app());
  inner.use(createBudgetApp({ repository }));
  inner.use(
    createFxApp({ repository: new FxRepository(pool), cronSecret: secret }),
  );
  inner.use(
    createReceiptMaintenanceApp({ repository, secret, cronSecret: secret }),
  );
  const privateServer = createServer(inner);
  await new Promise<void>((resolve, reject) => {
    privateServer.once("error", reject);
    privateServer.listen(0, "127.0.0.1", resolve);
  });
  const address = privateServer.address();
  if (!address || typeof address === "string")
    throw new Error("LISTENER_CONFIG");
  const gateway = createNasGateway({ secret, innerPort: address.port });
  const publicServer = gateway.listen(8790, "0.0.0.0");
  publicServer.headersTimeout = 15000;
  publicServer.requestTimeout = 65000;
  publicServer.on("error", () => {
    console.error("NAS backend listener failed.");
    process.exit(1);
  });
  console.log("Butce NAS database API ready; private container port 8790.");
  console.log(
    "Connection key saved to /config/api-key.txt; do not share it in chat.",
  );
  const stop = () => {
    publicServer.close(() =>
      privateServer.close(() => {
        pool.end().then(() => process.exit(0));
      }),
    );
    setTimeout(() => process.exit(1), 20000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch(() => {
  console.error(
    "NAS database API startup failed; check private settings, database health and network.",
  );
  process.exit(1);
});
