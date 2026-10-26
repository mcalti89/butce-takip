import { createHash, createHmac, randomUUID } from "node:crypto";

const MAX_FILE = 3 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export class NasStorageError extends Error {
  constructor(readonly code = "INTEGRITY") {
    super(
      "NAS dosya alanına ulaşılamadı veya dekont doğrulanamadı. Biraz sonra tekrar dene.",
    );
  }
}
export type NasFile = {
  accountId: string;
  id: string;
  hash: string;
  size: number;
};
async function limitedBody(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new NasStorageError();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new NasStorageError();
      }
      chunks.push(Buffer.from(result.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
export class NasReceiptStore {
  readonly url: string;
  private readonly key: Buffer;
  constructor(
    url: string,
    secret: string,
    options: { localTest?: boolean } = {},
  ) {
    const parsed = new URL(url);
    const local =
      options.localTest === true &&
      process.env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(parsed.hostname);
    if (
      (!local && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/" ||
      !/^[a-f0-9]{64}$/.test(secret.trim())
    )
      throw new NasStorageError("CONFIG");
    this.url = parsed.origin;
    this.key = Buffer.from(secret.trim(), "hex");
  }
  private async request(
    method: string,
    file: NasFile,
    content?: Buffer,
    timeoutMs = 8000,
  ) {
    if (
      !UUID.test(file.accountId) ||
      !UUID.test(file.id) ||
      !/^[a-f0-9]{64}$/.test(file.hash) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 1 ||
      file.size > MAX_FILE
    )
      throw new NasStorageError();
    const path = `/v1/receipts/${file.accountId}/${file.id}`;
    const timestamp = String(Date.now());
    const digest = createHash("sha256")
      .update(content ?? "")
      .digest("hex");
    const signature = createHmac("sha256", this.key)
      .update(`${method}\n${path}\n${timestamp}\n${digest}`)
      .digest("hex");
    try {
      const response = await fetch(this.url + path, {
        method,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "X-Budget-Timestamp": timestamp,
          "X-Budget-Content-Sha256": digest,
          "X-Budget-Signature": signature,
          ...(content ? { "Content-Type": "application/pdf" } : {}),
        },
        ...(content ? { body: new Uint8Array(content) } : {}),
      });
      if (method === "DELETE" && response.status === 404) {
        await response.body?.cancel();
        return Buffer.alloc(0);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new NasStorageError(`HTTP_${response.status}`);
      }
      if (method === "GET") {
        if (
          !response.headers
            .get("content-type")
            ?.startsWith("application/pdf") ||
          response.headers.get("X-Budget-Content-Sha256") !== file.hash
        ) {
          await response.body?.cancel();
          throw new NasStorageError();
        }
        const bytes = await limitedBody(response, MAX_FILE);
        if (
          bytes.length !== file.size ||
          createHash("sha256").update(bytes).digest("hex") !== file.hash
        )
          throw new NasStorageError();
        return bytes;
      }
      const bytes = await limitedBody(response, 8192);
      const result = JSON.parse(bytes.toString("utf8"));
      if (
        method === "PUT" &&
        (result.id !== file.id ||
          result.sha256 !== file.hash ||
          result.size !== file.size)
      )
        throw new NasStorageError();
      if (method === "DELETE" && result.ok !== true)
        throw new NasStorageError();
      return Buffer.alloc(0);
    } catch (error) {
      if (error instanceof NasStorageError) throw error;
      throw new NasStorageError(
        error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
          ? "TIMEOUT"
          : "NETWORK",
      );
    }
  }
  async put(file: NasFile, content: Buffer) {
    if (
      content.length !== file.size ||
      createHash("sha256").update(content).digest("hex") !== file.hash
    )
      throw new NasStorageError();
    await this.request("PUT", file, content);
  }
  get(file: NasFile) {
    return this.request("GET", file);
  }
  async remove(file: NasFile, timeoutMs = 8000) {
    await this.request("DELETE", file, undefined, timeoutMs);
  }
}
export function nasFromEnvironment() {
  const url = process.env.BUDGET_NAS_URL,
    secret = process.env.BUDGET_NAS_SECRET;
  if (!url && !secret) return null;
  if (!url || !secret) throw new NasStorageError("CONFIG");
  return new NasReceiptStore(url, secret);
}
export async function verifyNasStorage(store: NasReceiptStore) {
  const content = Buffer.from(
    "%PDF-1.4\nSynthetic private NAS connectivity check\n%%EOF\n",
  );
  const file = {
    accountId: randomUUID(),
    id: randomUUID(),
    hash: createHash("sha256").update(content).digest("hex"),
    size: content.length,
  };
  try {
    await store.put(file, content);
    await store.get(file);
  } finally {
    await store.remove(file);
  }
}
