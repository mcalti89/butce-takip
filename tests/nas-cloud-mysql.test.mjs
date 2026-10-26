import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "mysql2/promise";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
  readdir as listFiles,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReceiptServer } from "../deploy/qnap/server.mjs";
import {
  NasReceiptStore,
  NasStorageError,
  verifyNasStorage,
} from "../server/budget/nas";
import { MysqlBudgetRepository, databaseOptions } from "../server/budget/mysql";
import { createBudgetApp } from "../server/budget/app";
import { createReceiptMaintenanceApp } from "../server/budget/receipt-maintenance";
import { parseReceipt } from "../server/budget/receipts";
import { tokenHash } from "../server/budget/security";
import { emptyData } from "../lib/budget/model";

const databaseUrl = process.env.NAS_TEST_DATABASE_URL;
const pdf = Buffer.from("%PDF-1.4\nPrivate NAS integration fixture\n%%EOF\n");
describe.skipIf(!databaseUrl)(
  "Real MySQL and real HTTP NAS receipt integration",
  () => {
    let pool,
      root,
      nasServer,
      nasUrl,
      client,
      repository,
      apiServer,
      base,
      user,
      cookie,
      document,
      body,
      secret;
    beforeAll(async () => {
      const url = new URL(databaseUrl);
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.pathname != "/butce_nas_test"
      )
        throw new Error("Only disposable localhost/butce_nas_test allowed");
      pool = createPool(
        databaseOptions({
          BUDGET_DATABASE_URL: databaseUrl,
          BUDGET_DATABASE_TLS: "local-only",
          NODE_ENV: "test",
        }),
      );
      const directory = new URL("../database/budget/", import.meta.url);
      for (const name of (await readdir(directory))
        .filter((n) => /^\d+-.*\.sql$/.test(n))
        .sort())
        for (const statement of (
          await readFile(new URL(name, directory), "utf8")
        )
          .split(";")
          .filter((s) => s.trim()))
          await pool.query(statement);
      root = await mkdtemp(join(tmpdir(), "butce-nas-sql-test-"));
      secret = randomBytes(32).toString("hex");
      nasServer = createReceiptServer({ root, secret });
      await new Promise((resolve) => nasServer.listen(0, "127.0.0.1", resolve));
      nasUrl = `http://127.0.0.1:${nasServer.address().port}`;
    });
    beforeEach(async () => {
      if (apiServer) {
        apiServer.closeAllConnections();
        await new Promise((resolve) => apiServer.close(resolve));
        apiServer = undefined;
      }
      await pool.query("DELETE FROM budget_cloud_receipt_nas_deletions");
      await pool.query("DELETE FROM budget_cloud_accounts");
      await rm(root, { recursive: true, force: true });
      await mkdir(root);
      client = new NasReceiptStore(nasUrl, secret, { localTest: true });
      repository = new MysqlBudgetRepository(pool, {
        nas: client,
        enableNas: true,
      });
      const id = randomUUID();
      user = await repository.googleAccount(
        {
          subject: "nas-test-" + id,
          email: id + "@example.test",
          name: "Synthetic",
          nonce: "unused-nonce",
          authoritativeEmail: false,
        },
        "",
        Date.now(),
      );
      const token = randomBytes(32).toString("hex");
      await repository.createSession(
        tokenHash(token),
        user.id,
        Date.now() + 60000,
        "google",
      );
      cookie = "budget_google_session_dev=" + token;
      document = emptyData();
      document.transactions = [
        {
          id: "expense",
          type: "expense",
          amount: 25,
          currency: "TRY",
          date: "2026-10-26",
          categoryId: document.categories.find((c) => c.type === "expense").id,
          description: "Synthetic",
        },
      ];
      expect(await repository.write(user.id, 1, document, Date.now())).toBe(2);
      body = {
        accountId: user.id,
        id: randomUUID(),
        kind: "transaction",
        entryId: "expense",
        name: "NAS dekont.pdf",
        base64: pdf.toString("base64"),
      };
      apiServer = createBudgetApp({
        repository,
        googleClientId: "nas-test.apps.googleusercontent.com",
        origin: "https://budget.example.test",
        production: false,
      }).listen(0, "127.0.0.1");
      await new Promise((resolve) => apiServer.once("listening", resolve));
      base = `http://127.0.0.1:${apiServer.address().port}`;
    });
    afterAll(async () => {
      for (const server of [apiServer, nasServer])
        if (server) {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
      if (pool) await pool.end();
      if (root) await rm(root, { recursive: true, force: true });
    });
    function call(action, data, auth = cookie) {
      return fetch(base + "/api/cloud?action=" + action, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          ...(auth ? { Cookie: auth } : {}),
          ...(data === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                Origin: "https://budget.example.test",
              }),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    }
    async function row(id = body.id) {
      const [rows] = await pool.execute(
        "SELECT r.*,n.receipt_id AS nas_id FROM budget_cloud_receipts r LEFT JOIN budget_cloud_receipt_nas n ON n.receipt_id=r.id WHERE r.id=?",
        [id],
      );
      return rows[0];
    }
    const file = () => ({
      accountId: user.id,
      id: body.id,
      size: pdf.length,
      hash: createHash("sha256").update(pdf).digest("hex"),
    });
    const diskFile = () => join(root, user.id, body.id + ".pdf");
    async function upload() {
      const response = await call("receipt-upload", body);
      expect(response.status).toBe(200);
      return (await response.json()).receipt;
    }
    it("new uploads are verified on NAS and SQL stores metadata without PDF bytes", async () => {
      expect((await upload()).storage).toBe("nas");
      const record = await row();
      expect(record.content.length).toBe(0);
      expect(record.nas_id).toBe(body.id);
      expect(record.byte_size).toBe(pdf.length);
      expect(await readFile(diskFile())).toEqual(pdf);
      const result = await call(
        `receipt-download&accountId=${user.id}&id=${body.id}`,
      );
      expect(result.status).toBe(200);
      expect(Buffer.from(await result.arrayBuffer())).toEqual(pdf);
      expect(
        (await call(`receipts&accountId=${user.id}`, undefined, "")).status,
      ).toBe(401);
      expect(
        (await (await call(`receipts&accountId=${user.id}`)).json()).receipts[0]
          .storage,
      ).toBe("nas");
    });
    it("a lost upload response preserves SQL staging and retries use the same IDs", async () => {
      const put = client.put.bind(client);
      client.put = async (...args) => {
        await put(...args);
        throw new NasStorageError();
      };
      expect((await upload()).storage).toBe("pending");
      expect((await row()).content).toEqual(pdf);
      expect((await row()).nas_id).toBeNull();
      expect((await repository.receipts.get(user.id, body.id)).content).toEqual(
        pdf,
      );
      client.put = put;
      expect((await upload()).storage).toBe("nas");
      expect((await row()).content.length).toBe(0);
      expect(await listFiles(join(root, user.id))).toEqual([body.id + ".pdf"]);
    });
    it("wrong keys or failed read-back never discard staged SQL bytes", async () => {
      const originalGet = client.get.bind(client);
      client.get = async () => {
        throw new NasStorageError();
      };
      expect((await upload()).storage).toBe("pending");
      expect((await row()).content).toEqual(pdf);
      client.get = originalGet;
      expect(
        (await repository.receipts.synchronize({ prune: true })).pending,
      ).toBe(0);
      expect((await row()).content.length).toBe(0);
    });
    it("legacy SQL files copy, keep verified backups and prune only after another read-back", async () => {
      const sql = new MysqlBudgetRepository(pool, {
        nas: null,
        enableNas: false,
      });
      await sql.receipts.upload(user.id, parseReceipt(body));
      expect((await row()).nas_id).toBeNull();
      expect((await repository.receipts.synchronize()).copied).toBe(1);
      expect((await row()).nas_id).toBe(body.id);
      expect((await row()).content).toEqual(pdf);
      const get = client.get.bind(client);
      client.get = async () => {
        throw new NasStorageError();
      };
      expect((await repository.receipts.get(user.id, body.id)).content).toEqual(
        pdf,
      );
      client.get = get;
      expect(
        (await repository.receipts.synchronize({ prune: true })).backups,
      ).toBe(0);
      expect((await row()).content.length).toBe(0);
      client.get = async () => {
        throw new NasStorageError();
      };
      expect(
        (await call(`receipt-download&accountId=${user.id}&id=${body.id}`))
          .status,
      ).toBe(503);
    });
    it("corrupt NAS bytes fail integrity checking and leave the SQL backup intact", async () => {
      const sql = new MysqlBudgetRepository(pool, {
        nas: null,
        enableNas: false,
      });
      await sql.receipts.upload(user.id, parseReceipt(body));
      await repository.receipts.synchronize();
      await writeFile(diskFile(), Buffer.from("%PDF-1.4\nCorrupt\n%%EOF"));
      await expect(
        repository.receipts.synchronize({ prune: true }),
      ).rejects.toThrow();
      expect((await row()).content).toEqual(pdf);
      expect((await repository.receipts.get(user.id, body.id)).content).toEqual(
        pdf,
      );
      await writeFile(diskFile(), pdf);
      await repository.receipts.synchronize({ prune: true });
      expect((await row()).content.length).toBe(0);
    });
    it("receipt deletion removes the NAS file, metadata and durable deletion queue", async () => {
      await upload();
      const result = await call("receipt-delete", {
        accountId: user.id,
        id: body.id,
      });
      expect(result.status).toBe(200);
      expect(await row()).toBeUndefined();
      await expect(readFile(diskFile())).rejects.toThrow();
      const [rows] = await pool.query(
        "SELECT * FROM budget_cloud_receipt_nas_deletions",
      );
      expect(rows).toHaveLength(0);
    });
    it("parent deletion queues NAS cleanup atomically and failed document writes preserve the file", async () => {
      await upload();
      expect(
        await repository.write(
          user.id,
          1,
          { ...document, transactions: [] },
          Date.now(),
        ),
      ).toBeNull();
      expect(await readFile(diskFile())).toEqual(pdf);
      expect(
        await repository.write(
          user.id,
          2,
          { ...document, transactions: [] },
          Date.now(),
        ),
      ).toBe(3);
      expect(await row()).toBeUndefined();
      const [queue] = await pool.query(
        "SELECT * FROM budget_cloud_receipt_nas_deletions",
      );
      expect(queue).toHaveLength(1);
      expect(await repository.receipts.flushDeletions()).toBe(1);
      await expect(readFile(diskFile())).rejects.toThrow();
    });
    it("failed physical deletion is durable and retryable after NAS recovers", async () => {
      await upload();
      const remove = client.remove.bind(client);
      client.remove = async () => {
        throw new NasStorageError();
      };
      await repository.receipts.remove(user.id, body.id);
      expect(await row()).toBeUndefined();
      expect(await readFile(diskFile())).toEqual(pdf);
      const [pending] = await pool.query(
        "SELECT * FROM budget_cloud_receipt_nas_deletions",
      );
      expect(pending).toHaveLength(1);
      client.remove = remove;
      await repository.receipts.flushDeletions();
      await expect(readFile(diskFile())).rejects.toThrow();
    });
    it("uncertain remote writes are queued on deletion and cannot resurrect via a stale retry", async () => {
      const put = client.put.bind(client);
      client.put = async (...args) => {
        await put(...args);
        throw new NasStorageError();
      };
      await upload();
      await repository.receipts.remove(user.id, body.id);
      expect(await row()).toBeUndefined();
      expect(await readFile(diskFile())).toEqual(pdf);
      expect((await call("receipt-upload", body)).status).toBe(409);
      await pool.execute(
        "UPDATE budget_cloud_receipt_nas_deletions SET delete_after_ms=?",
        [Date.now() - 1],
      );
      client.put = put;
      await repository.receipts.flushDeletions();
      await expect(readFile(diskFile())).rejects.toThrow();
      expect((await upload()).storage).toBe("nas");
    });
    it("another Google user cannot list or download a known NAS receipt ID", async () => {
      await upload();
      const other = await repository.googleAccount(
        {
          subject: randomUUID(),
          email: randomUUID() + "@example.test",
          name: "Other",
          nonce: "unused",
          authoritativeEmail: false,
        },
        "",
        Date.now(),
      );
      const token = randomBytes(32).toString("hex");
      await repository.createSession(
        tokenHash(token),
        other.id,
        Date.now() + 60000,
        "google",
      );
      const auth = "budget_google_session_dev=" + token;
      expect(
        (
          await call(
            `receipt-download&accountId=${other.id}&id=${body.id}`,
            undefined,
            auth,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await (
            await call(`receipts&accountId=${other.id}`, undefined, auth)
          ).json()
        ).receipts,
      ).toEqual([]);
      await expect(
        client.get({ ...file(), accountId: other.id }),
      ).rejects.toThrow();
    });
    it("migration and document deletion serialize and leave no orphan receipt after cleanup", async () => {
      const put = client.put.bind(client);
      let release;
      let entered;
      const started = new Promise((resolve) => (entered = resolve));
      const barrier = new Promise((resolve) => (release = resolve));
      client.put = async (...args) => {
        entered();
        await barrier;
        return put(...args);
      };
      const uploading = call("receipt-upload", body);
      await started;
      const deleting = repository.write(
        user.id,
        2,
        { ...document, transactions: [] },
        Date.now(),
      );
      release();
      expect([200, 409]).toContain((await uploading).status);
      expect(await deleting).toBe(3);
      await repository.receipts.flushDeletions();
      expect(await row()).toBeUndefined();
      await expect(readFile(diskFile())).rejects.toThrow();
    });
    it("NAS deployment probe validates signed upload, read-back and delete without user data", async () => {
      await verifyNasStorage(client);
      const accounts = await readdir(root);
      for (const account of accounts)
        expect(await readdir(join(root, account))).toEqual([]);
    });
    it("maintenance endpoint authenticates before migration and exposes only counters", async () => {
      const sql = new MysqlBudgetRepository(pool, {
        nas: null,
        enableNas: false,
      });
      await sql.receipts.upload(user.id, parseReceipt(body));
      const maintenanceSecret = randomBytes(32).toString("hex");
      const cronSecret = "existing+cron/secret=with-sufficient-length";
      const service = createReceiptMaintenanceApp({
        repository,
        secret: maintenanceSecret,
        cronSecret,
      }).listen(0, "127.0.0.1");
      await new Promise((resolve) => service.once("listening", resolve));
      const endpoint = `http://127.0.0.1:${service.address().port}/api/receipts-sync`;
      try {
        expect((await fetch(endpoint)).status).toBe(401);
        expect((await row()).nas_id).toBeNull();
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + maintenanceSecret,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prune: true }),
        });
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result).toMatchObject({
          enabled: true,
          copied: 1,
          pending: 0,
          backups: 0,
        });
        expect(JSON.stringify(result)).not.toContain(user.id);
        expect((await row()).content.length).toBe(0);
        expect(
          (
            await fetch(endpoint, {
              headers: { Authorization: "Bearer " + cronSecret },
            })
          ).status,
        ).toBe(200);
      } finally {
        service.closeAllConnections();
        await new Promise((resolve) => service.close(resolve));
      }
    });
  },
);
