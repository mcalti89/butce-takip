import type { AccountTransfer, FinancialAccount } from "./finance";
import type { FxQuote } from "./fx";
import { currencyScale, minorUnits } from "./currency";

export type ExchangeQuote = {
  currency: string;
  date: string;
  unit: number;
  rate: number;
  side: "buying" | "selling";
  rateSource?: "TCMB_USD_OMR_PEG";
};
type ExchangeAmounts = {
  toCurrency: string;
  toAmount: number;
  /** Target currency units received for one source currency unit. */
  rate: number;
};
export type CurrencyExchange = ExchangeAmounts &
  (
    | {
        source: "TCMB";
        fromQuote?: ExchangeQuote;
        toQuote?: ExchangeQuote;
        manualRate?: never;
        rateDirection?: never;
      }
    | {
        source: "MANUAL";
        manualRate: number;
        rateDirection: "multiply" | "divide";
        fromQuote?: never;
        toQuote?: never;
      }
  );
export const manualRateDirection = (fromCurrency: string) =>
  fromCurrency === "TRY" ? ("divide" as const) : ("multiply" as const);
export function parseExchangeRate(input: string): number {
  const text = input.trim();
  if (!/^\d+(?:[.,]\d{1,8})?$/.test(text)) return NaN;
  const rate = Number(text.replace(",", "."));
  return rate > 0 && rate <= 1e9 ? rate : NaN;
}
function validManualRate(rate: number) {
  return (
    Number.isFinite(rate) &&
    rate > 0 &&
    rate <= 1e9 &&
    Number(rate.toFixed(8)) === rate
  );
}
/** Plain decimal text, including very small cross rates; never scientific notation. */
export function exchangeRateInput(
  exchange: CurrencyExchange,
  fromCurrency: string,
) {
  const rate =
    exchange.source === "MANUAL"
      ? exchange.manualRate
      : fromCurrency === "TRY"
        ? 1 / exchange.rate
        : exchange.rate;
  return rate
    .toFixed(8)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}
export function buildManualExchange(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string,
  manualRate: number,
): CurrencyExchange {
  if (
    !dateValid(date) ||
    fromCurrency === toCurrency ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 999999999 ||
    Math.abs(
      amount * currencyScale(fromCurrency) - minorUnits(amount, fromCurrency),
    ) > 0.0001 ||
    !validManualRate(manualRate)
  )
    throw new Error(
      "Geçerli tutar ve sıfırdan büyük, en fazla 8 ondalıklı bir kur gir.",
    );
  const rateDirection = manualRateDirection(fromCurrency);
  const rate = rateDirection === "divide" ? 1 / manualRate : manualRate;
  const toAmount =
    minorUnits(amount * rate, toCurrency) / currencyScale(toCurrency);
  if (!Number.isFinite(toAmount) || toAmount <= 0 || toAmount > 999999999)
    throw new Error(
      "Hedef tutar sıfırdan büyük ve hesap sınırları içinde olmalı.",
    );
  return {
    source: "MANUAL",
    manualRate,
    rateDirection,
    rate,
    toCurrency,
    toAmount,
  };
}
const dateValid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
function validQuote(
  q: ExchangeQuote | undefined,
  currency: string,
  date: string,
  side: "buying" | "selling",
) {
  if (currency === "TRY") return q === undefined;
  return (
    !!q &&
    q.currency === currency &&
    dateValid(q.date) &&
    q.date <= date &&
    q.side === side &&
    Number.isInteger(q.unit) &&
    q.unit > 0 &&
    q.unit <= 10000 &&
    Number.isFinite(q.rate) &&
    q.rate > 0 &&
    q.rate <= 1e9 &&
    (currency === "OMR"
      ? q.rateSource === "TCMB_USD_OMR_PEG"
      : q.rateSource === undefined)
  );
}
function snapshot(
  q: FxQuote | undefined,
  currency: string,
  date: string,
  side: "buying" | "selling",
): ExchangeQuote | undefined {
  if (currency === "TRY") return undefined;
  const rate = side === "buying" ? q?.forexBuying : q?.forexSelling;
  const s = q && {
    currency: q.currency,
    date: q.date,
    unit: q.unit,
    rate: rate as number,
    side,
    ...(q.rateSource ? { rateSource: q.rateSource } : {}),
  };
  if (!validQuote(s, currency, date, side))
    throw new Error(
      `${currency} için bu tarihte geçerli döviz ${side === "buying" ? "alış" : "satış"} kuru bulunamadı.`,
    );
  return s;
}
function crossRate(from?: ExchangeQuote, to?: ExchangeQuote) {
  return (from ? from.rate / from.unit : 1) / (to ? to.rate / to.unit : 1);
}
export function buildExchange(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string,
  from?: FxQuote,
  to?: FxQuote,
): CurrencyExchange {
  if (
    !dateValid(date) ||
    fromCurrency === toCurrency ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 999999999 ||
    Math.abs(
      amount * currencyScale(fromCurrency) - minorUnits(amount, fromCurrency),
    ) > 0.0001
  )
    throw new Error(
      "Farklı para birimleri, geçerli tarih ve pozitif tutar seç.",
    );
  const fromQuote = snapshot(from, fromCurrency, date, "buying"),
    toQuote = snapshot(to, toCurrency, date, "selling");
  const rate = crossRate(fromQuote, toQuote),
    toAmount =
      minorUnits(amount * rate, toCurrency) / currencyScale(toCurrency);
  if (!Number.isFinite(toAmount) || toAmount <= 0 || toAmount > 999999999)
    throw new Error(
      "Hedef tutar sıfırdan büyük ve hesap sınırları içinde olmalı.",
    );
  return {
    source: "TCMB",
    toCurrency,
    toAmount,
    rate,
    ...(fromQuote ? { fromQuote } : {}),
    ...(toQuote ? { toQuote } : {}),
  };
}
export function validExchange(
  t: AccountTransfer,
  from: FinancialAccount,
  to: FinancialAccount,
) {
  const x = t.exchange;
  if (
    !x ||
    typeof x !== "object" ||
    from.currency === to.currency ||
    from.kind === "card" ||
    to.kind === "card" ||
    t.currency !== from.currency ||
    x.toCurrency !== to.currency
  )
    return false;
  let rate: number;
  if (x.source === "MANUAL") {
    if (
      !validManualRate(x.manualRate) ||
      x.rateDirection !== manualRateDirection(from.currency) ||
      x.fromQuote !== undefined ||
      x.toQuote !== undefined
    )
      return false;
    rate = x.rateDirection === "divide" ? 1 / x.manualRate : x.manualRate;
  } else if (x.source === "TCMB") {
    if (
      x.manualRate !== undefined ||
      x.rateDirection !== undefined ||
      !validQuote(x.fromQuote, from.currency, t.date, "buying") ||
      !validQuote(x.toQuote, to.currency, t.date, "selling")
    )
      return false;
    rate = crossRate(x.fromQuote, x.toQuote);
  } else return false;
  return (
    Number.isFinite(x.rate) &&
    x.rate === rate &&
    Number.isFinite(x.toAmount) &&
    x.toAmount > 0 &&
    x.toAmount <= 999999999 &&
    x.toAmount ===
      minorUnits(t.amount * rate, to.currency) / currencyScale(to.currency)
  );
}
export const transferReceivedAmount = (t: AccountTransfer) =>
  t.exchange?.toAmount ?? t.amount;
