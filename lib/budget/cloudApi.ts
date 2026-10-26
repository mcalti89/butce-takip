import type { BudgetData } from "./model";
import { validateData } from "./model";
import type { PickedReceipt, Receipt, ReceiptKind } from "./receipt-model";
export type CloudStatus = {
  enabled: boolean;
  googleEnabled: boolean;
  authenticated: boolean;
  accountId?: string;
  email?: string;
  legacyImportAllowed?: boolean;
};
export type CloudSnapshot = {
  accountId: string;
  revision: number;
  data: BudgetData | null;
};
export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
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
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    action === "receipt-upload"
      ? 30000
      : action === "google-login"
        ? 20000
        : 10000,
  );
  try {
    const response = await fetch(endpoint(action), {
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
    const result = await response.json().catch(() => null);
    if (!response.ok || !result)
      throw new CloudError(
        result?.error || "Hesap hizmeti şu anda kullanılamıyor.",
        response.status,
        typeof result?.code === "string" ? result.code : undefined,
      );
    return result as T;
  } catch (error) {
    if (error instanceof CloudError) throw error;
    throw new CloudError(
      "Hesap sunucusuna ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}
export const cloudStatus = () => request<CloudStatus>("status");
export const googleConfig = () =>
  request<{ clientId: string; nonce: string }>("google-config");
export const cloudGoogleLogin = (credential: string) =>
  request<CloudStatus>("google-login", { credential });
export const cloudLogout = () => request<{ ok: boolean }>("logout", {});
function checkReceiptAccount<T extends { accountId: string }>(
  result: T,
  accountId: string,
): T {
  if (result.accountId !== accountId)
    throw new CloudError(
      "Açık hesap değişti. Sayfayı yenile.",
      409,
      "ACCOUNT_CHANGED",
    );
  return result;
}
export async function cloudReceipts(accountId: string) {
  const result = await request<{ accountId: string; receipts: Receipt[] }>(
    `receipts&accountId=${encodeURIComponent(accountId)}`,
  );
  return checkReceiptAccount(result, accountId).receipts;
}
export async function cloudUploadReceipt(
  accountId: string,
  kind: ReceiptKind,
  entryId: string,
  file: PickedReceipt,
) {
  const result = await request<{ accountId: string; receipt: Receipt }>(
    "receipt-upload",
    { accountId, kind, entryId, ...file },
  );
  return checkReceiptAccount(result, accountId).receipt;
}
export async function cloudDeleteReceipt(accountId: string, id: string) {
  return checkReceiptAccount(
    await request<{ accountId: string; ok: boolean }>("receipt-delete", {
      accountId,
      id,
    }),
    accountId,
  );
}
export async function cloudDownloadReceipt(accountId: string, id: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(
      endpoint(
        `receipt-download&accountId=${encodeURIComponent(accountId)}&id=${encodeURIComponent(id)}`,
      ),
      { credentials: "include", cache: "no-store", signal: controller.signal },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new CloudError(
        error?.error ?? "Dekont indirilemedi.",
        response.status,
      );
    }
    if (
      response.headers.get("X-Budget-Account") !== accountId ||
      !response.headers.get("content-type")?.startsWith("application/pdf")
    )
      throw new CloudError(
        "Dekont oturumu doğrulanamadı. Sayfayı yenile.",
        409,
        "ACCOUNT_CHANGED",
      );
    return new Uint8Array(await response.arrayBuffer());
  } catch (e) {
    if (e instanceof CloudError) throw e;
    throw new CloudError(
      "Dekont indirilemedi. Bağlantını kontrol edip tekrar dene.",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}
export async function cloudRead(accountId: string): Promise<CloudSnapshot> {
  const snapshot = await request<CloudSnapshot>("data");
  if (snapshot.accountId !== accountId)
    throw new CloudError(
      "Açık hesap değişti. Lütfen oturumunu yeniden kontrol et.",
      409,
      "ACCOUNT_CHANGED",
    );
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
export async function cloudWrite(
  accountId: string,
  revision: number,
  data: BudgetData,
) {
  const next = await request<{ accountId: string; revision: number }>("data", {
    accountId,
    revision,
    data,
  });
  if (next.accountId !== accountId)
    throw new CloudError(
      "Açık hesap değişti. Lütfen oturumunu yeniden kontrol et.",
      409,
      "ACCOUNT_CHANGED",
    );
  if (next.revision !== revision + 1)
    throw new CloudError(
      "Kayıt sürümü doğrulanamadı. Son verileri yeniden yükle.",
      500,
    );
  return next.revision;
}
