import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { createConnection } from "mysql2/promise";
import { databaseOptions } from "../server/budget/mysql";

async function main() {
  const options = databaseOptions();
  if (!options)
    throw new Error("BUDGET_DATABASE_URL sunucu ortamında gerekli.");
  const connection = await createConnection(options);
  try {
    const directory = new URL("../database/budget/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((name) => /^\d+-.*\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(new URL(file, directory), "utf8");
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await connection.query(statement);
    }
    console.log("Bütçe SQL şeması hazır; mevcut kayıtlar değiştirilmedi.");
  } finally {
    await connection.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    "SQL şeması hazırlanamadı. Bağlantı, TLS ve veritabanı yetkilerini kontrol et.",
  );
  const code = (error as { code?: unknown })?.code;
  console.error(
    "SQL hata kodu:",
    typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code)
      ? code
      : "SQL_CONFIGURATION_ERROR",
  );
  process.exitCode = 1;
});
