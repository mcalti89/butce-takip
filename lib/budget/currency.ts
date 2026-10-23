/** Omani rial is divided into 1,000 baisa. Existing currencies retain 2 digits. */
export const currencyDigits = (currency = "TRY") =>
  currency === "OMR" ? 3 : 2;
export const currencyScale = (currency = "TRY") =>
  10 ** currencyDigits(currency);
export const minorUnits = (value: number, currency = "TRY") =>
  Math.round(value * currencyScale(currency));
