import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReceiptServer } from "../deploy/qnap/server.mjs";

const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
describe("QNAP private PDF service over real HTTP", () => {
  let root, server, base, secret, owner, id, clock;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "butce-nas-test-"));
    secret = randomBytes(32).toString("hex");
    owner = randomUUID();
    id = randomUUID();
    clock = Date.now();
    server = createReceiptServer({ root, secret, now: () => clock });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  function signed(method, path, body = Buffer.alloc(0), timestamp = clock) {
    const sha = digest(body),
      time = String(timestamp);
    return {
      "X-Budget-Timestamp": time,
      "X-Budget-Content-Sha256": sha,
      "X-Budget-Signature": createHmac("sha256", Buffer.from(secret, "hex"))
        .update(`${method}\n${path}\n${time}\n${sha}`)
        .digest("hex"),
      ...(method === "PUT" ? { "Content-Type": "application/pdf" } : {}),
    };
  }
  function call(method = "GET", body, options = {}) {
    const path = options.path ?? `/v1/receipts/${owner}/${id}`;
    return fetch(base + path, {
      method,
      headers: options.headers ?? signed(method, path, body, options.timestamp),
      ...(body === undefined ? {} : { body }),
    });
  }
  it("health exposes no file path or connection key, file routes require authentication", async () => {
    const health = await fetch(base + "/health");
    expect(health.status).toBe(200);
    const text = await health.text();
    expect(text).not.toContain(secret);
    expect(text).not.toContain(root);
    for (const method of ["GET", "HEAD", "PUT", "DELETE"])
      expect((await call(method, undefined, { headers: {} })).status).toBe(401);
  });
  it("persists and downloads PDF bytes with no-store, digest and attachment headers", async () => {
    expect((await call("PUT", pdf)).status).toBe(200);
    expect(await readFile(join(root, owner, id + ".pdf"))).toEqual(pdf);
    const result = await call();
    expect(result.status).toBe(200);
    expect(Buffer.from(await result.arrayBuffer())).toEqual(pdf);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("content-disposition")).toContain("attachment");
    expect(result.headers.get("x-budget-content-sha256")).toBe(digest(pdf));
    expect(result.headers.get("content-security-policy")).toContain("sandbox");
    const head = await call("HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });
  it("binds signatures to the account, file, method and content", async () => {
    const path = `/v1/receipts/${owner}/${id}`,
      headers = signed("PUT", path, pdf);
    for (const target of [
      `/v1/receipts/${randomUUID()}/${id}`,
      `/v1/receipts/${owner}/${randomUUID()}`,
    ])
      expect((await call("PUT", pdf, { path: target, headers })).status).toBe(
        401,
      );
    expect((await call("DELETE", undefined, { headers })).status).toBe(401);
    expect(
      (await call("PUT", Buffer.from("tampered"), { headers })).status,
    ).toBe(400);
    expect(await readdir(join(root, owner))).toEqual([]);
  });
  it("rejects expired/future signatures and wrong keys", async () => {
    for (const timestamp of [clock - 60001, clock + 60001])
      expect((await call("PUT", pdf, { timestamp })).status).toBe(401);
    const path = `/v1/receipts/${owner}/${id}`,
      headers = signed("PUT", path, pdf);
    headers["X-Budget-Signature"] = "0".repeat(64);
    expect((await call("PUT", pdf, { headers })).status).toBe(401);
  });
  it("rejects disguised PDFs, empty files, wrong MIME types and oversize requests", async () => {
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.from("<html>fake pdf</html>"),
      Buffer.from("%PDF-1.4 truncated"),
    ])
      expect((await call("PUT", bytes)).status).toBe(400);
    const path = `/v1/receipts/${owner}/${id}`,
      headers = signed("PUT", path, pdf);
    headers["Content-Type"] = "text/plain";
    expect((await call("PUT", pdf, { headers })).status).toBe(415);
    expect(
      (await call("PUT", Buffer.alloc(3 * 1024 * 1024 + 1, 32))).status,
    ).toBe(413);
    expect(await readdir(join(root, owner))).toEqual([]);
  });
  it("accepts the maximum 3 MiB PDF", async () => {
    const bytes = Buffer.alloc(3 * 1024 * 1024, 32);
    pdf.copy(bytes);
    Buffer.from("%%EOF").copy(bytes, bytes.length - 5);
    expect((await call("PUT", bytes)).status).toBe(200);
    expect(Buffer.from(await (await call()).arrayBuffer())).toEqual(bytes);
  });
  it("retries and parallel uploads are immutable and leave no staging files", async () => {
    const results = await Promise.all([call("PUT", pdf), call("PUT", pdf)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await call("PUT", pdf)).status).toBe(200);
    const changed = Buffer.from("%PDF-1.4\nchanged\n%%EOF");
    expect((await call("PUT", changed)).status).toBe(409);
    expect(await readdir(join(root, owner))).toEqual([id + ".pdf"]);
    expect(await readFile(join(root, owner, id + ".pdf"))).toEqual(pdf);
  });
  it("deletion is idempotent and does not affect another file", async () => {
    await call("PUT", pdf);
    const another = randomUUID(),
      path = `/v1/receipts/${owner}/${another}`;
    await call("PUT", pdf, { path });
    expect((await call("DELETE")).status).toBe(200);
    expect((await call("DELETE")).status).toBe(200);
    expect((await call()).status).toBe(404);
    expect((await call("GET", undefined, { path })).status).toBe(200);
  });
  it("fails closed on traversal and symlinks", async () => {
    expect(
      (await call("GET", undefined, { path: "/v1/receipts/%2e%2e/x" })).status,
    ).toBe(404);
    await mkdir(join(root, owner));
    const outside = join(root, "other.pdf");
    await writeFile(outside, pdf);
    await symlink(outside, join(root, owner, id + ".pdf"));
    expect((await call()).status).toBe(503);
    const other = randomUUID();
    await symlink(join(root, owner), join(root, other));
    expect(
      (
        await call("PUT", pdf, {
          path: `/v1/receipts/${other}/${randomUUID()}`,
        })
      ).status,
    ).toBe(409);
  });
  it("reports disk exhaustion without writing a receipt", async () => {
    const low = createReceiptServer({
      root,
      secret,
      now: () => clock,
      reserveBytes: Number.MAX_SAFE_INTEGER,
    });
    await new Promise((resolve) => low.listen(0, "127.0.0.1", resolve));
    try {
      const path = `/v1/receipts/${owner}/${id}`;
      expect(
        (
          await fetch(`http://127.0.0.1:${low.address().port}${path}`, {
            method: "PUT",
            headers: signed("PUT", path, pdf),
            body: pdf,
          })
        ).status,
      ).toBe(507);
      expect(await readdir(join(root, owner))).toEqual([]);
    } finally {
      low.closeAllConnections();
      await new Promise((resolve) => low.close(resolve));
    }
  });
});
