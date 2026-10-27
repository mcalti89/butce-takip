import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server, type RequestListener } from "node:http";
import { randomBytes } from "node:crypto";
import { createNasGateway } from "../server/nas/gateway";
import { NasBackendClient, withNasBackend } from "../server/nas/remote";
import { keyBytes, sign, type ForwardRequest } from "../server/nas/protocol";
const servers: Server[] = [];
async function listen(app: RequestListener) {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  return { port: address.port, url: `http://127.0.0.1:${address.port}` };
}
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
function message(overrides: Partial<ForwardRequest> = {}): ForwardRequest {
  return {
    method: "GET",
    path: "/api/cloud?action=status",
    headers: {},
    body: "",
    ...overrides,
  };
}
async function fixture() {
  let calls = 0;
  const inner = express();
  inner.use(express.raw({ type: () => true, limit: "5mb" }));
  inner.use((req, res) => {
    calls++;
    if (req.query.pdf)
      return res
        .type("application/pdf")
        .set("Content-Disposition", "attachment; filename=receipt.pdf")
        .send(Buffer.from("%PDF-1.4\nfixture\n%%EOF"));
    res.setHeader("Set-Cookie", [
      "__Host-budget_google_session=fixture; Path=/; HttpOnly; Secure; SameSite=Lax",
      "challenge=other; Path=/; Secure",
    ]);
    res.status(req.query.denied ? 401 : 200).json({
      method: req.method,
      path: req.originalUrl,
      cookie: req.get("cookie"),
      origin: req.get("origin"),
      auth: req.get("authorization"),
      size: Buffer.isBuffer(req.body) ? req.body.length : 0,
    });
  });
  const backend = await listen(inner);
  const secret = randomBytes(32).toString("hex");
  const outer = await listen(
    createNasGateway({ secret, innerPort: backend.port }),
  );
  return {
    secret,
    outer,
    client: new NasBackendClient(outer.url, secret, { localTest: true }),
    calls: () => calls,
  };
}
function signed(
  secret: string,
  input: unknown,
  timestamp = String(Date.now()),
  nonce = randomBytes(16).toString("hex"),
) {
  const body = Buffer.from(JSON.stringify(input));
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Budget-Time": timestamp,
      "X-Budget-Nonce": nonce,
      "X-Budget-Signature": sign(
        keyBytes(secret),
        `request-v1\n${timestamp}\n${nonce}`,
        body,
      ),
    },
    body,
  };
}
describe("NAS database HTTPS bridge", () => {
  it("pauses all data and maintenance writes while preserving budget reads", async () => {
    let called = 0;
    const local = express();
    local.use((_req, res) => {
      called++;
      res.json({ ok: true });
    });
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      BUDGET_WRITES_PAUSED: "1",
    };
    const entry = await listen(withNasBackend(local, { env }));
    for (const path of [
      "/api/fx-sync",
      "/api/receipts-sync",
      "/api/fx",
      "/api/fx?action=latest",
      "/api/cloud?action=google%2Dconfig",
    ]) {
      const response = await fetch(entry.url + path);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("60");
    }
    expect(
      (await fetch(entry.url + "/api/cloud?action=data", { method: "POST" }))
        .status,
    ).toBe(503);
    expect(called).toBe(0);
    expect((await fetch(entry.url + "/api/cloud?action=data")).status).toBe(
      200,
    );
    expect(called).toBe(1);
  });
  it("keeps the migration path private even when NAS routing is enabled", async () => {
    const f = await fixture();
    const entry = await listen(
      withNasBackend(express(), {
        env: {
          NODE_ENV: "test",
          BUDGET_BACKEND_URL: f.outer.url,
          BUDGET_BACKEND_SECRET: f.secret,
        },
        localTest: true,
      }),
    );
    expect(
      (await fetch(entry.url + "/internal/migration", { method: "POST" }))
        .status,
    ).toBe(405);
    expect(f.calls()).toBe(0);
    expect(
      (
        await f.client.request(
          message({ method: "POST", path: "/internal/migration" }),
        )
      ).status,
    ).toBe(200);
  });

  it("preserves original origin, session cookies, request bytes and multiple Set-Cookie values", async () => {
    const f = await fixture();
    const result = await f.client.request(
      message({
        method: "POST",
        path: "/api/cloud?action=write",
        headers: {
          origin: "https://butce.muratcalti.com",
          cookie: "private=session",
          "content-type": "application/json",
        },
        body: Buffer.from('{"name":"Umman • OMR"}').toString("base64"),
      }),
    );
    expect(result.status).toBe(200);
    expect(result.headers["set-cookie"]).toHaveLength(2);
    expect(
      JSON.parse(Buffer.from(result.body, "base64").toString()),
    ).toMatchObject({
      method: "POST",
      path: "/api/cloud?action=write",
      cookie: "private=session",
      origin: "https://butce.muratcalti.com",
      size: Buffer.byteLength('{"name":"Umman • OMR"}'),
    });
  });
  it("preserves PDF bytes and application authorization failures", async () => {
    const f = await fixture();
    const pdf = await f.client.request(message({ path: "/api/cloud?pdf=1" }));
    expect(Buffer.from(pdf.body, "base64").toString()).toBe(
      "%PDF-1.4\nfixture\n%%EOF",
    );
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(
      (await f.client.request(message({ path: "/api/cloud?denied=1" }))).status,
    ).toBe(401);
  });
  it("rejects unsigned requests, wrong keys and public direct application routes", async () => {
    const f = await fixture();
    expect(
      (await fetch(f.outer.url + "/v1/request", { method: "POST" })).status,
    ).toBe(401);
    await expect(
      new NasBackendClient(f.outer.url, randomBytes(32).toString("hex"), {
        localTest: true,
      }).request(message()),
    ).rejects.toThrow();
    expect((await fetch(f.outer.url + "/api/cloud")).status).toBe(404);
    expect(f.calls()).toBe(0);
  });
  it("rejects replay, stale signatures and modified bodies before calling the backend", async () => {
    const f = await fixture();
    const request = signed(f.secret, message());
    expect((await fetch(f.outer.url + "/v1/request", request)).status).toBe(
      200,
    );
    expect((await fetch(f.outer.url + "/v1/request", request)).status).toBe(
      409,
    );
    expect(
      (
        await fetch(
          f.outer.url + "/v1/request",
          signed(f.secret, message(), String(Date.now() - 61000)),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(f.outer.url + "/v1/request", {
          ...request,
          body: Buffer.from('{"modified":true}'),
        })
      ).status,
    ).toBe(401);
    expect(f.calls()).toBe(1);
  });
  it("rejects arbitrary URLs, unknown forwarded headers and malformed base64", async () => {
    const f = await fixture();
    for (const input of [
      message({ path: "http://example.test/" }),
      message({ path: "/admin" }),
      message({ headers: { host: "attacker.test" } }),
      message({ headers: { cookie: "a\r\nb" } }),
      message({ body: "not base64" }),
      message({ body: "YQ==" }),
    ])
      expect(
        (await fetch(f.outer.url + "/v1/request", signed(f.secret, input)))
          .status,
      ).toBe(400);
    expect(f.calls()).toBe(0);
  });
  it("accepts a full 3 MiB PDF encoded inside the normal JSON upload", async () => {
    const f = await fixture();
    const upload = Buffer.from(
      JSON.stringify({
        content: Buffer.alloc(3 * 1024 * 1024, 65).toString("base64"),
      }),
    );
    const reply = await f.client.request(
      message({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: upload.toString("base64"),
      }),
    );
    expect(JSON.parse(Buffer.from(reply.body, "base64").toString()).size).toBe(
      upload.length,
    );
  });
  it("does not follow redirects or accept unsigned responses", async () => {
    let reached = false;
    const destination = await listen((_req, res) => {
      reached = true;
      res.end();
    });
    const redirect = await listen((_req, res) => {
      res.writeHead(302, { Location: destination.url });
      res.end();
    });
    await expect(
      new NasBackendClient(redirect.url, randomBytes(32).toString("hex"), {
        localTest: true,
      }).request(message()),
    ).rejects.toThrow();
    expect(reached).toBe(false);
    const unsigned = await listen((_req, res) => res.end("{}"));
    await expect(
      new NasBackendClient(unsigned.url, randomBytes(32).toString("hex"), {
        localTest: true,
      }).request(message()),
    ).rejects.toThrow();
  });
  it("requires an HTTPS origin and strict secret outside explicit local tests", () => {
    const secret = randomBytes(32).toString("hex");
    for (const url of [
      "http://example.test",
      "https://u:p@example.test",
      "https://example.test/path",
      "https://example.test/?a=1",
      "https://example.test/#hash",
    ])
      expect(() => new NasBackendClient(url, secret)).toThrow();
    expect(
      () => new NasBackendClient("https://example.test", "invalid"),
    ).toThrow();
    vi.stubEnv("NODE_ENV", "production");
    expect(
      () =>
        new NasBackendClient("http://127.0.0.1", secret, { localTest: true }),
    ).toThrow();
  });
  it("keeps Aiven routing unchanged until opted in, and never falls back after an outage", async () => {
    let localCalls = 0;
    const local = express();
    local.use((_req, res) => {
      localCalls++;
      res.json({ local: true });
    });
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    const entry = await listen(withNasBackend(local, { env, localTest: true }));
    expect(await (await fetch(entry.url + "/api/cloud")).json()).toEqual({
      local: true,
    });
    env.BUDGET_BACKEND_URL = "http://127.0.0.1:1";
    env.BUDGET_BACKEND_SECRET = randomBytes(32).toString("hex");
    expect((await fetch(entry.url + "/api/cloud")).status).toBe(503);
    expect(localCalls).toBe(1);
  });
  it("authenticates maintenance at Vercel before forwarding with the NAS-only secret", async () => {
    const f = await fixture();
    const local = express();
    const cronSecret = randomBytes(32).toString("hex");
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      BUDGET_BACKEND_URL: f.outer.url,
      BUDGET_BACKEND_SECRET: f.secret,
      CRON_SECRET: cronSecret,
    };
    const entry = await listen(withNasBackend(local, { env, localTest: true }));
    expect((await fetch(entry.url + "/api/fx-sync")).status).toBe(401);
    expect(f.calls()).toBe(0);
    const response = await fetch(entry.url + "/api/fx-sync", {
      headers: { Authorization: "Bearer " + cronSecret },
    });
    expect(await response.json()).toMatchObject({ auth: "Bearer " + f.secret });
  });
});
