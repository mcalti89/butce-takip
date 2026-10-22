import type { BudgetData } from "./model";
import { validateData } from "./model";
export type CloudStatus = {
  enabled: boolean;
  authenticated: boolean;
  email?: string;
};
export type CloudSnapshot = { revision: number; data: BudgetData | null };
export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
function endpoint(action: string) {
  const configured = process.env.EXPO_PUBLIC_BUDGET_API_URL?.replace(/\/$/, "");
  if (configured) return `${configured}?action=${action}`;
  if (
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    window.location.port === "8081"
  )
    return `${window.location.protocol}//${window.location.hostname}:3000/api/cloud?action=${action}`;
  return `/api/cloud?action=${action}`;
}
async function request<T>(action: string, body?: unknown): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    response = await fetch(endpoint(action), {
      signal: controller.signal,
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new CloudError(
      "SQL sunucusuna ulaşılamadı. Bağlantını kontrol et; yerel kopyan korunuyor.",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw new CloudError(
      result?.error || "SQL hizmeti şu anda kullanılamıyor.",
      response.status,
    );
  return result as T;
}
export const cloudStatus = () => request<CloudStatus>("status");
export const cloudLogin = (email: string, password: string) =>
  request<CloudStatus>("login", { email, password });
export const cloudLogout = () => request<{ ok: boolean }>("logout", {});
export async function cloudRead(): Promise<CloudSnapshot> {
  const snapshot = await request<CloudSnapshot>("data");
  if (
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    (snapshot.data !== null && !validateData(snapshot.data))
  )
    throw new CloudError(
      "Sunucudaki bütçe verisi doğrulanamadı. Mevcut kayıtlar değiştirilmedi.",
      500,
    );
  return snapshot;
}
export async function cloudWrite(revision: number, data: BudgetData) {
  const next = await request<{ revision: number }>("data", { revision, data });
  if (next.revision !== revision + 1)
    throw new CloudError(
      "Kayıt sürümü doğrulanamadı. Son verileri yeniden yükle.",
      500,
    );
  return next.revision;
}
