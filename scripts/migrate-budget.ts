import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createConnection } from "mysql2/promise";
import { databaseOptions } from "../server/budget/mysql";

async function main() {
  const options = databaseOptions();
  if (!options)
    throw new Error("BUDGET_DATABASE_URL sunucu ortamında gerekli.");
  const connection = await createConnection(options);
  try {
    const sql = await readFile(
      new URL("../database/budget/001-initial.sql", import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await connection.query(statement);
    console.log("Bütçe SQL şeması hazır; mevcut kayıtlar değiştirilmedi.");
  } finally {
    await connection.end();
  }
}
main().catch(() => {
  console.error(
    "SQL şeması hazırlanamadı. Bağlantı, TLS ve veritabanı yetkilerini kontrol et.",
  );
  process.exitCode = 1;
});
