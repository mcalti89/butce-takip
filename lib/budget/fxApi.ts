import { FxQuote, FxCurrencyCode, parseFxNumber } from "./fx";

export type LatestFxResponse = {
  date: string;
  source: "TCMB";
  rates: FxQuote[];
  archive?: {
    firstDate: string | null;
    latestDate: string | null;
    bulletinCount: number;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
};

export type FxHistoryResponse = {
  currency: FxCurrencyCode;
  source: "TCMB";
  rates: FxQuote[];
};

export type FxRateResponse = {
  source: "TCMB";
  rate: FxQuote;
};

export function fxApiUrl() {
  return (
    process.env.EXPO_PUBLIC_FX_API_URL?.trim().replace(/\/$/, "") ||
    (typeof window !== "undefined" ? "/api/fx" : "")
  );
}

export function isFxApiConfigured() {
  return fxApiUrl() === "/api/fx" || /^https:\/\//i.test(fxApiUrl());
}

function normalizeQuote(value: Record<string, unknown>): FxQuote {
  const currency = String(
    value.currency_code || value.currency || "",
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Kur cevabında para birimi kodu geçersiz.");
  const unit = Number(value.unit);
  if (!Number.isInteger(unit) || unit < 1)
    throw new Error("Kur cevabında birim geçersiz.");
  const date = String(value.rate_date || value.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Kur cevabında tarih geçersiz.");
  const nullableNumber = (n: unknown) =>
    n === null || n === undefined || n === "" ? null : parseFxNumber(n);
  return {
    date,
    currency: currency as FxCurrencyCode,
    ...(currency === "OMR" ? { rateSource: "TCMB_USD_OMR_PEG" as const } : {}),
    currencyName: String(value.currency_name || value.currencyName || currency),
    unit,
    forexBuying: nullableNumber(value.forex_buying ?? value.forexBuying),
    forexSelling: nullableNumber(value.forex_selling ?? value.forexSelling),
    banknoteBuying: nullableNumber(
      value.banknote_buying ?? value.banknoteBuying,
    ),
    banknoteSelling: nullableNumber(
      value.banknote_selling ?? value.banknoteSelling,
    ),
    bulletinNo: String(value.bulletin_no || value.bulletinNo || ""),
    fetchedAtUtc:
      (value.fetched_at_utc ?? value.fetchedAtUtc)
        ? String(value.fetched_at_utc ?? value.fetchedAtUtc)
        : undefined,
  };
}

async function request<T>(query: URLSearchParams): Promise<T> {
  const base = fxApiUrl();
  if (!base)
    throw new Error(
      "Kur servisi henüz bağlanmadı. Bu cihaz için kur API adresi gerekli.",
    );
  let response: Response;
  try {
    response = await fetch(`${base}?${query.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "Kur sunucusuna ulaşılamadı. İnternet bağlantısını ve API adresini kontrol et.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const code = typeof body.error === "string" ? body.error : "";
    if (code === "no_rates_yet")
      throw new Error("Kur veritabanında henüz günlük kayıt yok.");
    if (code === "no_rate_on_or_before_date")
      throw new Error("Bu işlem tarihinden önce kaydedilmiş TCMB kuru yok.");
    throw new Error(
      "Kur servisi şu anda yanıt vermiyor. Biraz sonra tekrar dene.",
    );
  }
  return response.json() as Promise<T>;
}

export async function fetchLatestFx(
  currencies: FxCurrencyCode[],
): Promise<LatestFxResponse> {
  const query = new URLSearchParams({
    action: "latest",
    codes: currencies.join(","),
  });
  const result = await request<{
    date: string;
    source: "TCMB";
    rates: Record<string, unknown>[];
    archive?: LatestFxResponse["archive"];
  }>(query);
  return { ...result, rates: result.rates.map(normalizeQuote) };
}

export async function fetchFxHistory(
  currency: FxCurrencyCode,
  from: string,
  to: string,
): Promise<FxHistoryResponse> {
  const query = new URLSearchParams({ action: "history", currency, from, to });
  const result = await request<{
    currency: FxCurrencyCode;
    source: "TCMB";
    rates: Record<string, unknown>[];
  }>(query);
  return { ...result, rates: result.rates.map(normalizeQuote) };
}

export async function fetchFxRate(
  currency: FxCurrencyCode,
  date: string,
): Promise<FxRateQuote> {
  const query = new URLSearchParams({ action: "rate", currency, date });
  const result = await request<{
    source: "TCMB";
    rate: Record<string, unknown>;
  }>(query);
  return { source: result.source, rate: normalizeQuote(result.rate) };
}

export type FxRateQuote = FxRateResponse;
