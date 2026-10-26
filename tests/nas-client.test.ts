import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server, type RequestListener } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  NasReceiptStore,
  NasStorageError,
  nasFromEnvironment,
} from "../server/budget/nas";
const servers: Server[] = [];
async function listen(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local server");
  return `http://127.0.0.1:${address.port}`;
}
const content = Buffer.from("%PDF-1.4\nPrivate fixture\n%%EOF");
const file = () => ({
  accountId: randomUUID(),
  id: randomUUID(),
  hash: createHash("sha256").update(content).digest("hex"),
  size: content.length,
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
describe("NAS HTTP client trust boundary", () => {
  it("requires HTTPS, an origin-only URL and a 32-byte key in production", () => {
    const key = randomBytes(32).toString("hex");
    for (const url of [
      "http://nas.example.test",
      "https://user:pass@nas.example.test",
      "https://nas.example.test/other",
      "https://nas.example.test/?query=1",
      "https://nas.example.test/#hash",
    ])
      expect(() => new NasReceiptStore(url, key)).toThrow();
    expect(
      () => new NasReceiptStore("https://nas.example.test", "not-a-key"),
    ).toThrow();
    expect(
      new NasReceiptStore("https://nas.example.test", key + "\n").url,
    ).toBe("https://nas.example.test");
    vi.stubEnv("NODE_ENV", "production");
    expect(
      () =>
        new NasReceiptStore("http://127.0.0.1:1234", key, { localTest: true }),
    ).toThrow();
  });
  it("never forwards a signed request to a redirect destination", async () => {
    let reached = false;
    const destination = await listen((_req, res) => {
      reached = true;
      res.end("unexpected");
    });
    const origin = await listen((_req, res) => {
      res.writeHead(302, { Location: destination });
      res.end();
    });
    const store = new NasReceiptStore(origin, randomBytes(32).toString("hex"), {
      localTest: true,
    });
    await expect(store.put(file(), content)).rejects.toThrow(NasStorageError);
    expect(reached).toBe(false);
  });
  it("checks actual downloaded bytes even when the response claims the expected hash", async () => {
    const expected = file();
    const origin = await listen((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "X-Budget-Content-Sha256": expected.hash,
      });
      res.end("corrupted");
    });
    const store = new NasReceiptStore(origin, randomBytes(32).toString("hex"), {
      localTest: true,
    });
    await expect(store.get(expected)).rejects.toThrow(NasStorageError);
  });
  it("diagnoses authentication failures without exposing remote bodies or credentials", async () => {
    const key = randomBytes(32).toString("hex"),
      origin = await listen((_req, res) => {
        res.statusCode = 401;
        res.end("Sensitive remote text");
      });
    const store = new NasReceiptStore(origin, key, { localTest: true });
    try {
      await store.put(file(), content);
      throw new Error("Request should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NasStorageError);
      expect((error as NasStorageError).code).toBe("HTTP_401");
      expect((error as Error).message).not.toContain(key);
      expect((error as Error).message).not.toContain("Sensitive remote text");
    }
  });
  it("rejects partial environment settings and permits an unconfigured SQL-only environment", () => {
    vi.stubEnv("BUDGET_NAS_URL", "");
    vi.stubEnv("BUDGET_NAS_SECRET", "");
    expect(nasFromEnvironment()).toBeNull();
    vi.stubEnv("BUDGET_NAS_URL", "https://nas.example.test");
    expect(() => nasFromEnvironment()).toThrow();
  });
});
