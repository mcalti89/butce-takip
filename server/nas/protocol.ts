import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MAX_REQUEST = 5 * 1024 * 1024;
export const MAX_ENVELOPE = 8 * 1024 * 1024;
export const REQUEST_HEADERS = [
  "content-type",
  "cookie",
  "origin",
  "sec-fetch-site",
  "authorization",
] as const;
export const RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "x-content-type-options",
  "content-security-policy",
  "cross-origin-resource-policy",
  "allow",
  "set-cookie",
] as const;
export type ForwardRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
};
export type ForwardResponse = {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
};
export function keyBytes(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret.trim()))
    throw new Error("NAS_GATEWAY_CONFIG");
  return Buffer.from(secret.trim(), "hex");
}
export function digest(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}
export function sign(key: Buffer, context: string, body: Buffer) {
  return createHmac("sha256", key)
    .update(`${context}\n${digest(body)}`)
    .digest("hex");
}
export function equalSignature(actual: string, expected: string) {
  return (
    /^[a-f0-9]{64}$/.test(actual) &&
    timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))
  );
}
export function validPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length <= 4096 &&
    /^\/api\/(cloud|fx|fx-sync|receipts-sync)(\?[^#\r\n]*)?$/.test(path)
  );
}
export function decodeBody(value: unknown, max: number) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(max / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error("NAS_GATEWAY_BODY");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > max || bytes.toString("base64") !== value)
    throw new Error("NAS_GATEWAY_BODY");
  return bytes;
}
