import express from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import {
  decodeBody,
  equalSignature,
  keyBytes,
  MAX_ENVELOPE,
  MAX_REQUEST,
  REQUEST_HEADERS,
  RESPONSE_HEADERS,
  sign,
  validPath,
  type ForwardRequest,
  type ForwardResponse,
} from "./protocol";

async function readLimited(response: globalThis.Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > MAX_ENVELOPE) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(Buffer.from(item.value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}
export class NasBackendClient {
  private key: Buffer;
  private url: string;
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
      parsed.pathname !== "/"
    )
      throw new Error("NAS_GATEWAY_CONFIG");
    this.url = parsed.origin;
    this.key = keyBytes(secret);
  }
  async request(message: ForwardRequest): Promise<ForwardResponse> {
    const body = Buffer.from(JSON.stringify(message));
    if (!validPath(message.path) || body.length > MAX_ENVELOPE)
      throw new Error();
    const nonce = randomBytes(16).toString("hex");
    const timestamp = String(Date.now());
    // No retry or fallback to Aiven: a write may have committed before a lost
    // reply. Existing document revisions and receipt UUIDs resolve retries.
    const response = await fetch(this.url + "/v1/request", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(
        message.path.startsWith("/api/cloud") ? 25000 : 55000,
      ),
      headers: {
        "Content-Type": "application/json",
        "X-Budget-Time": timestamp,
        "X-Budget-Nonce": nonce,
        "X-Budget-Signature": sign(
          this.key,
          `request-v1\n${timestamp}\n${nonce}`,
          body,
        ),
      },
      body: new Uint8Array(body),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error("NAS_GATEWAY_UNAVAILABLE");
    }
    const output = await readLimited(response);
    if (
      !equalSignature(
        response.headers.get("X-Budget-Signature") ?? "",
        sign(this.key, `response-v1\n${nonce}`, output),
      )
    )
      throw new Error("NAS_GATEWAY_INTEGRITY");
    const reply: ForwardResponse = JSON.parse(output.toString("utf8"));
    if (
      !reply ||
      !Number.isInteger(reply.status) ||
      reply.status < 200 ||
      reply.status > 599 ||
      !reply.headers ||
      typeof reply.headers !== "object" ||
      Array.isArray(reply.headers)
    )
      throw new Error();
    decodeBody(reply.body, MAX_REQUEST);
    for (const [name, value] of Object.entries(reply.headers)) {
      if (
        !(RESPONSE_HEADERS as readonly string[]).includes(name) ||
        !(
          typeof value === "string" ||
          (name === "set-cookie" &&
            Array.isArray(value) &&
            value.every((v) => typeof v === "string"))
        ) ||
        (Array.isArray(value) ? value : [value]).some((v) => /[\r\n\0]/.test(v))
      )
        throw new Error();
    }
    return reply;
  }
}
function authorized(candidate: string, expected: string | undefined) {
  return Boolean(
    expected &&
    expected.length >= 32 &&
    timingSafeEqual(
      createHash("sha256").update(candidate).digest(),
      createHash("sha256")
        .update("Bearer " + expected)
        .digest(),
    ),
  );
}
// Opt-in only. Leaving BUDGET_BACKEND_URL unset preserves the current Aiven app.
export function withNasBackend(
  local: express.Express,
  options: { env?: NodeJS.ProcessEnv; localTest?: boolean } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  const remote = express();
  remote.use(express.raw({ type: () => true, limit: MAX_REQUEST }));
  remote.use(async (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const env = options.env ?? process.env;
    try {
      const path = req.originalUrl;
      if (
        !validPath(path) ||
        path.startsWith("/internal/") ||
        !["GET", "POST"].includes(req.method)
      )
        return res.status(405).json({ error: "method_not_allowed" });
      const headers: Record<string, string> = {};
      for (const name of REQUEST_HEADERS) {
        const value = req.get(name);
        if (value) headers[name] = value;
      }
      const endpoint = path.split("?")[0];
      if (["/api/fx-sync", "/api/receipts-sync"].includes(endpoint)) {
        const auth = headers.authorization ?? "";
        if (
          !authorized(auth, env.CRON_SECRET) &&
          !(
            endpoint === "/api/receipts-sync" &&
            authorized(auth, env.BUDGET_RECEIPT_SYNC_SECRET)
          )
        )
          return res.status(401).json({ error: "unauthorized" });
        headers.authorization =
          "Bearer " + (env.BUDGET_BACKEND_SECRET ?? "").trim();
      }
      // Vercel may already have parsed JSON before invoking the function.
      const body =
        req.method === "GET"
          ? Buffer.alloc(0)
          : Buffer.isBuffer(req.body)
            ? req.body
            : req.body == null
              ? Buffer.alloc(0)
              : Buffer.from(JSON.stringify(req.body));
      if (body.length > MAX_REQUEST) throw new Error();
      const client = new NasBackendClient(
        env.BUDGET_BACKEND_URL ?? "",
        env.BUDGET_BACKEND_SECRET ?? "",
        options,
      );
      const reply = await client.request({
        method: req.method,
        path,
        headers,
        body: body.toString("base64"),
      });
      for (const [name, value] of Object.entries(reply.headers))
        res.setHeader(name, value);
      // Deployed NAS v2 did not forward this header. On this exact route the
      // signed 200/PDF reply proves the NAS checked query.accountId against the
      // authenticated account before reading the file (budget/app.ts). Restore
      // that same marker for older agents, without changing ownership checks.
      const requestUrl = new URL(path, "http://localhost");
      const requestedAccount = requestUrl.searchParams.getAll("accountId");
      if (
        !reply.headers["x-budget-account"] &&
        req.method === "GET" &&
        requestUrl.pathname === "/api/cloud" &&
        requestUrl.searchParams.getAll("action").length === 1 &&
        requestUrl.searchParams.get("action") === "receipt-download" &&
        reply.status === 200 &&
        typeof reply.headers["content-type"] === "string" &&
        reply.headers["content-type"].startsWith("application/pdf") &&
        requestedAccount.length === 1 &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          requestedAccount[0],
        )
      )
        res.setHeader("X-Budget-Account", requestedAccount[0]);
      res.status(reply.status).send(decodeBody(reply.body, MAX_REQUEST));
    } catch {
      res.status(503).json({
        error:
          "Veritabanı hizmetine şu anda ulaşılamıyor. Biraz sonra tekrar dene.",
      });
    }
  });
  remote.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(413).json({ error: "request_too_large" }),
  );
  app.use((req, res, next) => {
    const env = options.env ?? process.env;
    if (env.BUDGET_WRITES_PAUSED === "1") {
      const url = new URL(req.originalUrl, "http://localhost");
      const action = url.searchParams.get("action");
      const mutates =
        req.method !== "GET" ||
        ["/api/fx-sync", "/api/receipts-sync"].includes(url.pathname) ||
        (url.pathname === "/api/cloud" && action === "google-config") ||
        (url.pathname === "/api/fx" && (!action || action === "latest"));
      if (mutates)
        return res
          .status(503)
          .set({ "Retry-After": "60", "Cache-Control": "no-store" })
          .json({
            code: "MAINTENANCE",
            error:
              "Veritabanı aktarımı sürüyor. Kayıt için biraz sonra tekrar dene.",
          });
    }
    next();
  });
  app.use((req, res, next) =>
    (options.env ?? process.env).BUDGET_BACKEND_URL
      ? remote(req, res, next)
      : local(req, res, next),
  );
  return app;
}
