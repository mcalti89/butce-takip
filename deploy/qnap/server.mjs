import { createServer } from "node:http";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { constants } from "node:fs";
import {
  mkdir,
  readFile,
  open,
  link,
  unlink,
  lstat,
  statfs,
  chmod,
} from "node:fs/promises";
import { join, resolve } from "node:path";

const MAX_FILE = 3 * 1024 * 1024;
const MAX_AGE = 60_000;
const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const ROUTE = new RegExp(`^/v1/receipts/(${UUID})/(${UUID})$`);
const EMPTY_HASH = createHash("sha256").update("").digest("hex");
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function reply(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
async function regularFile(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_FILE)
      throw new HttpError(409, "File unavailable");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
async function ownerDirectory(root, owner) {
  const path = join(root, owner);
  await mkdir(path, { mode: 0o700 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new HttpError(409, "Storage path unavailable");
  return path;
}
async function requestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_FILE) throw new HttpError(413, "PDF exceeds 3 MiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}
function authorize(req, key, now) {
  const timestamp = req.headers["x-budget-timestamp"];
  const digest = req.headers["x-budget-content-sha256"];
  const signature = req.headers["x-budget-signature"];
  if (
    typeof timestamp !== "string" ||
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > MAX_AGE ||
    typeof digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new HttpError(401, "Unauthorized");
  const canonical = `${req.method}\n${req.url}\n${timestamp}\n${digest}`;
  const expected = createHmac("sha256", key).update(canonical).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new HttpError(401, "Unauthorized");
  if (req.method !== "PUT" && digest !== EMPTY_HASH)
    throw new HttpError(400, "Unexpected body digest");
  return digest;
}
function validPdf(content) {
  return (
    content.length > 0 &&
    content.subarray(0, 5).toString("ascii") === "%PDF-" &&
    content.subarray(-1024).includes(Buffer.from("%%EOF"))
  );
}

/** Authentication is mandatory for every file operation, including local requests. */
export function createReceiptServer({
  root,
  secret,
  now = Date.now,
  reserveBytes = 256 * 1024 * 1024,
}) {
  if (!/^[a-f0-9]{64}$/.test(secret ?? ""))
    throw new Error("A 32-byte hexadecimal key is required");
  const key = Buffer.from(secret, "hex");
  root = resolve(root);
  let inFlight = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    try {
      if (req.url === "/health" && req.method === "GET") {
        const disk = await statfs(root);
        if (Number(disk.bavail) * Number(disk.bsize) < reserveBytes)
          throw new HttpError(507, "Storage low");
        return reply(res, 200, {
          service: "butce-receipts-nas",
          version: 1,
          status: "ok",
        });
      }
      const match = ROUTE.exec(req.url ?? "");
      if (!match) return reply(res, 404, { error: "Not found" });
      if (!["PUT", "GET", "HEAD", "DELETE"].includes(req.method))
        return reply(res, 405, { error: "Method not allowed" });
      const digest = authorize(req, key, now());
      if (
        req.method !== "PUT" &&
        (req.headers["transfer-encoding"] ||
          Number(req.headers["content-length"] || "0") !== 0)
      )
        throw new HttpError(400, "Unexpected request body");
      if (inFlight >= 4) {
        res.setHeader("Retry-After", "2");
        throw new HttpError(429, "Busy");
      }
      inFlight++;
      try {
        const [, owner, id] = match;
        const directory = await ownerDirectory(root, owner);
        const path = join(directory, `${id}.pdf`);
        if (req.method === "PUT") {
          if (req.headers["content-type"] !== "application/pdf")
            throw new HttpError(415, "PDF content type required");
          const length = Number(req.headers["content-length"]);
          if (Number.isFinite(length) && length > MAX_FILE)
            throw new HttpError(413, "PDF exceeds 3 MiB");
          const content = await requestBody(req);
          if (hash(content) !== digest)
            throw new HttpError(400, "Content digest mismatch");
          if (!validPdf(content)) throw new HttpError(400, "Invalid PDF");
          const disk = await statfs(root);
          if (
            Number(disk.bavail) * Number(disk.bsize) <
            reserveBytes + content.length
          )
            throw new HttpError(507, "Storage low");
          const temporary = join(directory, `.upload-${randomUUID()}`);
          const file = await open(temporary, "wx", 0o600);
          try {
            await file.writeFile(content);
            await file.sync();
          } catch (error) {
            await unlink(temporary).catch(() => {});
            throw error;
          } finally {
            await file.close();
          }
          try {
            // Linking publishes the complete file atomically without replacing another upload.
            await link(temporary, path);
          } catch (error) {
            if (error.code !== "EEXIST") throw error;
            const previous = await regularFile(path);
            if (hash(previous) !== digest)
              throw new HttpError(409, "Existing receipt differs");
          } finally {
            await unlink(temporary).catch(() => {});
          }
          return reply(res, 200, { id, size: content.length, sha256: digest });
        }
        if (req.method === "DELETE") {
          await unlink(path).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
          return reply(res, 200, { ok: true });
        }
        const content = await regularFile(path);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="dekont.pdf"',
        );
        res.setHeader("Content-Length", content.length);
        res.setHeader("X-Budget-Content-Sha256", hash(content));
        res.writeHead(200);
        res.end(req.method === "HEAD" ? undefined : content);
      } finally {
        inFlight--;
      }
    } catch (error) {
      if (res.destroyed || res.headersSent) {
        res.destroy();
        return;
      }
      const status =
        error instanceof HttpError
          ? error.status
          : error.code === "ENOENT"
            ? 404
            : error.code === "ENOSPC"
              ? 507
              : 503;
      reply(res, status, {
        error:
          error instanceof HttpError
            ? error.message
            : status === 404
              ? "Not found"
              : "Storage unavailable",
      });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  server.maxHeadersCount = 40;
  return server;
}

export async function start() {
  const root = process.env.RECEIPT_DATA_DIR || "/data";
  const config = process.env.RECEIPT_CONFIG_DIR || "/config";
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(config, { recursive: true, mode: 0o700 });
  const keyPath = join(config, "service-key.txt");
  let created = false;
  try {
    const file = await open(keyPath, "wx", 0o600);
    try {
      await file.writeFile(randomBytes(32).toString("hex") + "\n");
      await file.sync();
      created = true;
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const keyFile = await open(
    keyPath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let secret;
  try {
    secret = (await keyFile.readFile("utf8")).trim();
  } finally {
    await keyFile.close();
  }
  await chmod(keyPath, 0o600);
  const server = createReceiptServer({ root, secret });
  const port = Number(process.env.PORT || 8787);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", resolve);
  });
  console.log(
    "Butce NAS receipt service ready; private container port " + port,
  );
  if (created)
    console.log(
      "Connection key saved to /config/service-key.txt; do not share it in chat.",
    );
  const shutdown = () => {
    server.close();
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return server;
}
