// Synthetic XML, never a live TCMB rate or a production seed.
export function tcmbFixture(date = "2026-10-21") {
  const codes = [
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "CHF",
    "AUD",
    "CAD",
    "NOK",
    "CNY",
    "XDR",
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><Tarih_Date Tarih="${date.slice(8)}.${date.slice(5, 7)}.${date.slice(0, 4)}" Bulten_No="${date.slice(0, 4)}/199">${codes.map((code) => `<Currency CurrencyCode="${code}"><Unit>${code === "JPY" ? 100 : 1}</Unit><Isim>${code === "USD" ? "ABD &amp; doları" : code}</Isim><CurrencyName>${code}</CurrencyName><ForexBuying>31.1250</ForexBuying><ForexSelling>31.2500</ForexSelling><BanknoteBuying></BanknoteBuying><BanknoteSelling/></Currency>`).join("")}</Tarih_Date>`;
}
