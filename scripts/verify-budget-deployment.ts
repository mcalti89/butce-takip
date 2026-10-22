import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { isDeepStrictEqual } from "node:util";
import { createPool } from "mysql2/promise";
import { createBudgetApp } from "../server/budget/app";
import { databaseOptions, MysqlBudgetRepository } from "../server/budget/mysql";
import { tokenHash } from "../server/budget/security";
import { demoData } from "../lib/budget/model";

// Use a unique synthetic account. Never read or update a real owner's document.
async function main() {
  const options = databaseOptions();
  if (!options) throw new Error("SQL configuration missing");
  if (
    !process.env.BUDGET_OWNER_EMAIL ||
    (process.env.BUDGET_OWNER_PASSWORD?.length ?? 0) < 12 ||
    (process.env.BUDGET_OWNER_PASSWORD?.length ?? 0) > 256
  ) {
    console.error(
      "SQL giriş ayarları eksik: sahip e-postası ve 12–256 karakterli parola gerekli.",
    );
    process.exitCode = 1;
    return;
  }
  const pool = createPool(options);
  const repository = new MysqlBudgetRepository(pool);
  const email = `deployment-smoke-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString("hex");
  const origin = "https://butcetakip-vercel-drop.vercel.app";
  const app = createBudgetApp({
    repository,
    ownerEmail: email,
    ownerPassword: password,
    origin,
    production: true,
  });
  const server = app.listen(0, "127.0.0.1");
  let cookie = "";
  let stage = "başlatma";
  function check(ok: boolean) {
    if (!ok) throw new Error("Verification failed");
  }
  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Server unavailable");
    const base = `http://127.0.0.1:${address.port}/api/cloud?action=`;
    async function request(
      action: string,
      body?: unknown,
      requestOrigin = origin,
    ) {
      return fetch(base + action, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body === undefined
            ? {}
            : { Origin: requestOrigin, "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
    }
    stage = "SQL erişimi ve anonim erişim engeli";
    const status = await request("status");
    check(status.status === 200 && (await status.json()).enabled === true);
    check((await request("data")).status === 401);
    check(
      (
        await request(
          "login",
          { email, password },
          "https://foreign.example.invalid",
        )
      ).status === 403,
    );
    stage = "güvenli oturum";
    const login = await request("login", { email, password });
    check(login.status === 200);
    const header = login.headers.get("set-cookie") ?? "";
    check(
      header.includes("HttpOnly") &&
        header.includes("Secure") &&
        header.includes("SameSite=Lax") &&
        header.startsWith("__Host-budget_session="),
    );
    cookie = header.split(";")[0];
    stage = "belgenin kayıpsız yazılması ve okunması";
    const data = demoData();
    data.savingsGoals = { "2026-10": 30000 };
    data.trackedCurrencies = ["USD", "EUR"];
    const saved = await request("data", { revision: 0, data });
    check(saved.status === 200 && (await saved.json()).revision === 1);
    const read = await (await request("data")).json();
    check(read.revision === 1 && isDeepStrictEqual(read.data, data));
    stage = "eşzamanlı yazma koruması";
    const writes = await Promise.all([
      request("data", { revision: 1, data }),
      request("data", { revision: 1, data }),
    ]);
    check(isDeepStrictEqual(writes.map((r) => r.status).sort(), [200, 409]));
    check(
      (await request("data", { revision: 2, data: { version: 1 } })).status ===
        400,
    );
    check((await (await request("data")).json()).revision === 2);
    stage = "oturum iptali";
    check((await request("logout", {})).status === 200);
    check((await request("data")).status === 401);
    console.log(
      "SQL yayın kontrolü başarılı: veritabanı bağlantısı, giriş, kayıt/okuma, sürüm çatışması, doğrulama ve çıkış.",
    );
  } catch {
    console.error(
      `SQL yayın kontrolü başarısız: ${stage}. Yayın durduruldu; kişisel bütçeler değiştirilmedi.`,
    );
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await pool.execute("DELETE FROM budget_cloud_accounts WHERE email = ?", [
        email,
      ]);
      await pool.execute(
        "DELETE FROM budget_cloud_login_limits WHERE bucket_key = ?",
        [tokenHash(email)],
      );
    } finally {
      await pool.end();
    }
  }
}
main().catch(() => {
  console.error(
    "SQL yayın kontrolü tamamlanamadı. Bağlantı/TLS ayarlarını kontrol et; gizli değerler günlüğe yazılmadı.",
  );
  process.exitCode = 1;
});
