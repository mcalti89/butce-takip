import express from "express";
import http from "node:http";
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

// The inner listener is bound to loopback by the entrypoint. It only serves the
// existing application routes; the public listener never exposes those routes.
export function createNasGateway(options: {
  secret: string;
  innerPort: number;
  now?: () => number;
}) {
  const key = keyBytes(options.secret);
  const now = options.now ?? Date.now;
  const seen = new Map<string, number>();
  let active = 0;
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  app.get("/health", (_req, res) =>
    res.json({ service: "butce-database-api", version: 1, status: "ok" }),
  );
  app.post(
    "/v1/request",
    express.raw({ type: "application/json", limit: MAX_ENVELOPE }),
    async (req, res) => {
      const bytes: Buffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.alloc(0);
      const timestamp = req.get("X-Budget-Time") ?? "";
      const nonce = req.get("X-Budget-Nonce") ?? "";
      if (
        !bytes.length ||
        !/^\d{13}$/.test(timestamp) ||
        Math.abs(now() - Number(timestamp)) > 60000 ||
        !/^[a-f0-9]{32}$/.test(nonce) ||
        !equalSignature(
          req.get("X-Budget-Signature") ?? "",
          sign(key, `request-v1\n${timestamp}\n${nonce}`, bytes),
        )
      )
        return res.status(401).json({ error: "unauthorized" });
      for (const [id, expires] of seen) if (expires <= now()) seen.delete(id);
      if (seen.has(nonce))
        return res.status(409).json({ error: "replayed_request" });
      if (active >= 4 || seen.size >= 4096)
        return res.status(503).json({ error: "service_busy" });
      seen.set(nonce, Number(timestamp) + 60001);
      let message: ForwardRequest;
      let body: Buffer;
      try {
        message = JSON.parse(bytes.toString("utf8"));
        if (
          !message ||
          !["GET", "POST"].includes(message.method) ||
          !validPath(message.path) ||
          !message.headers ||
          typeof message.headers !== "object" ||
          Array.isArray(message.headers)
        )
          throw new Error();
        for (const [name, value] of Object.entries(message.headers)) {
          if (
            !(REQUEST_HEADERS as readonly string[]).includes(name) ||
            typeof value !== "string" ||
            value.length > 32768 ||
            /[\r\n\0]/.test(value)
          )
            throw new Error();
        }
        body = decodeBody(message.body, MAX_REQUEST);
        if (message.method === "GET" && body.length) throw new Error();
      } catch {
        return res.status(400).json({ error: "invalid_request" });
      }
      active++;
      try {
        const reply = await new Promise<ForwardResponse>((resolve, reject) => {
          const call = http.request(
            {
              host: "127.0.0.1",
              port: options.innerPort,
              method: message.method,
              path: message.path,
              headers: {
                ...message.headers,
                "content-length": String(body.length),
              },
              timeout: 55000,
            },
            (response) => {
              const chunks: Buffer[] = [];
              let size = 0;
              response.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_REQUEST) {
                  response.destroy();
                  reject(new Error());
                } else chunks.push(chunk);
              });
              response.on("error", reject);
              response.on("end", () => {
                const headers: ForwardResponse["headers"] = {};
                for (const name of RESPONSE_HEADERS) {
                  const value = response.headers[name];
                  if (value !== undefined) headers[name] = value;
                }
                resolve({
                  status: response.statusCode ?? 503,
                  headers,
                  body: Buffer.concat(chunks).toString("base64"),
                });
              });
            },
          );
          call.on("timeout", () => call.destroy(new Error("timeout")));
          call.on("error", reject);
          call.end(body);
        });
        const output = Buffer.from(JSON.stringify(reply));
        res.set(
          "X-Budget-Signature",
          sign(key, `response-v1\n${nonce}`, output),
        );
        return res.type("application/json").send(output);
      } catch {
        return res.status(503).json({ error: "backend_unavailable" });
      } finally {
        active--;
      }
    },
  );
  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(400).json({ error: "invalid_request" }),
  );
  return app;
}
