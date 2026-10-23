import type { FxRateSnapshot } from "./model";
import { currencyDigits } from "./currency";

export const TCMB_CURRENCY_CODES = [
  "USD",
  "AUD",
  "DKK",
  "EUR",
  "GBP",
  "CHF",
  "SEK",
  "CAD",
  "KWD",
  "NOK",
  "SAR",
  "JPY",
  "RON",
  "RUB",
  "CNY",
  "PKR",
  "QAR",
  "KRW",
  "AZN",
  "AED",
  "KZT",
  "XDR",
] as const;

export const SUPPORTED_CURRENCY_CODES = [
  ...TCMB_CURRENCY_CODES,
  "OMR",
] as const;
export type FxCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];
// Central Bank of Oman fixed parity: 1 USD = 0.3845 OMR (since 1986).
export const OMR_PER_USD = 0.3845;
export const OMR_PARITY_SOURCE = "https://cbo.gov.om/Pages/MonetaryPolicy.aspx";
export const rateSourceLabel = (currency: string) =>
  currency === "OMR" ? "TCMB USD + sabit OMR paritesi (hesaplanmış)" : "TCMB";
export function omrFromUsd(usd: FxQuote): FxQuote {
  if (usd.currency !== "USD")
    throw new Error("OMR requires an archived USD quote");
  const cross = (rate: number | null) =>
    rate === null
      ? null
      : Math.round((rate / usd.unit / OMR_PER_USD) * 1e8) / 1e8;
  return {
    ...usd,
    currency: "OMR",
    rateSource: "TCMB_USD_OMR_PEG",
    currencyName: "Umman riyali",
    unit: 1,
    forexBuying: cross(usd.forexBuying),
    forexSelling: cross(usd.forexSelling),
    banknoteBuying: null,
    banknoteSelling: null,
  };
}
export const DEFAULT_TRACKED_CURRENCIES: FxCurrencyCode[] = [
  "USD",
  "EUR",
  "GBP",
  "OMR",
];
export const CURRENCY_NAMES: Record<FxCurrencyCode | "TRY", string> = {
  TRY: "Türk lirası",
  OMR: "Umman riyali",
  USD: "ABD doları",
  AUD: "Avustralya doları",
  DKK: "Danimarka kronu",
  EUR: "Euro",
  GBP: "İngiliz sterlini",
  CHF: "İsviçre frangı",
  SEK: "İsveç kronu",
  CAD: "Kanada doları",
  KWD: "Kuveyt dinarı",
  NOK: "Norveç kronu",
  SAR: "Suudi Arabistan riyali",
  JPY: "Japon yeni",
  RON: "Rumen leyi",
  RUB: "Rus rublesi",
  CNY: "Çin yuanı",
  PKR: "Pakistan rupisi",
  QAR: "Katar riyali",
  KRW: "Güney Kore wonu",
  AZN: "Azerbaycan manatı",
  AED: "BAE dirhemi",
  KZT: "Kazakistan tengesi",
  XDR: "Özel Çekme Hakkı (SDR)",
};

export type FxQuote = FxRateSnapshot & { currency: FxCurrencyCode };

export function mergeFxRates(
  current: FxRateSnapshot[] = [],
  incoming: FxRateSnapshot[] = [],
  maxItems = 2000,
) {
  const rows = new Map<string, FxRateSnapshot>();
  for (const quote of [...current, ...incoming])
    rows.set(`${quote.date}:${quote.currency}`, quote);
  return [...rows.values()]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.currency.localeCompare(b.currency),
    )
    .slice(0, maxItems);
}

export function convertToTry(
  amount: number,
  quote: FxQuote,
  side: "buying" | "selling",
): number {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Döviz tutarı sıfırdan büyük olmalı.");
  if (!Number.isInteger(quote.unit) || quote.unit < 1)
    throw new Error("TCMB kur birimi geçersiz.");
  const rate = side === "buying" ? quote.forexBuying : quote.forexSelling;
  if (rate === null || !Number.isFinite(rate) || rate <= 0)
    throw new Error(`${quote.currency} için bu tarihte geçerli TCMB kuru yok.`);
  return Math.round(((amount * rate) / quote.unit) * 100) / 100;
}

export function quoteForTransaction(
  type: "income" | "expense",
  quote: FxQuote,
) {
  const side = type === "income" ? "buying" : "selling";
  const rate = side === "buying" ? quote.forexBuying : quote.forexSelling;
  if (rate === null || !Number.isFinite(rate) || rate <= 0)
    throw new Error(
      `${quote.currency} için ${quote.date} tarihli kur bulunamadı.`,
    );
  return {
    fxRate: rate,
    fxUnit: quote.unit,
    fxDate: quote.date,
    fxSide: side,
  } as const;
}

export function formatMoney(value: number, currency: string, compact = false) {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits:
        compact && Number.isInteger(value) ? 0 : currencyDigits(currency),
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

export function parseFxNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
