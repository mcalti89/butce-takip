import type { BudgetData } from "./model";
import { validDate, validTime } from "./model";
import { bankText, parseReceiptAmount } from "./receipt-import";
export type PhotoExpenseSuggestion = {
  merchant?: string;
  amount?: number;
  currency?: string;
  date?: string;
  time?: string;
  categoryId?: string;
  warnings: string[];
};
const currencyIn = (value: string) => {
  const u = bankText(value),
    code = u.match(/\b(TRY|TL|OMR|USD|EUR|GBP|AED|SAR|QAR|KWD|BHD)\b/)?.[1];
  if (code) return code === "TL" ? "TRY" : code;
  if (value.includes("₺")) return "TRY";
  if (value.includes("€")) return "EUR";
  if (value.includes("£")) return "GBP";
  if (/\bR\.?\s?O\.?\b|OMANI RIAL/.test(u)) return "OMR";
  return undefined;
};
function best<T>(entries: { value: T; score: number }[]) {
  if (!entries.length) return undefined;
  const score = Math.max(...entries.map((x) => x.score)),
    values = entries.filter((x) => x.score === score);
  return new Set(values.map((x) => JSON.stringify(x.value))).size === 1
    ? values[0].value
    : undefined;
}
function dateIn(value: string) {
  const iso = value.match(/\b(20\d{2})[-/.](\d{2})[-/.](\d{2})\b/);
  const local = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/);
  const result = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : local
      ? `${local[3].length === 2 ? "20" : ""}${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
      : undefined;
  return result && validDate(result) ? result : undefined;
}
export function photoCategory(
  data: BudgetData,
  merchant: string,
  text: string,
) {
  const groups: [RegExp, RegExp][] = [
    [/ECZANE|PHARMACY|HOSPITAL|HASTANE|MEDICAL|KLINIK/, /SAGLIK|HEALTH|ECZANE/],
    [
      /AKARYAKIT|PETROL|SHELL|OPET|TOTALENERGIES|AL MAHA|OMAN OIL|\bFUEL\b|BENZIN/,
      /ULASIM|TRANSPORT|YAKIT|BENZIN/,
    ],
    [
      /MIGROS|CARREFOUR|\bBIM\b|\bA101\b|\bSOK\b|LULU|NESTO|SUPERMARKET|GROCERY|HIPERMARKET|\bMARKET\b|BAKKAL/,
      /MARKET|GIDA|GROCERY/,
    ],
    [
      /RESTAURANT|RESTORAN|CAFE|KAFE|COFFEE|KAHVE|STARBUCKS|BURGER|PIZZA|LOKANTA|YEMEK/,
      /DISARIDA YEMEK|YEMEK|DINING|RESTAURANT|KAFE/,
    ],
    [
      /TAKSI|TAXI|OTOBUS|METRO|PARKING|OTOPARK|UBER|OTOMOBIL/,
      /ULASIM|TRANSPORT/,
    ],
    [
      /KITAP|KIRTASIYE|BOOKSHOP|BOOKSTORE|SCHOOL|OKUL|EGITIM/,
      /EGITIM|EDUCATION|KITAP/,
    ],
    [/ELEKTRIK|TELEKOM|TELECOM|INTERNET|SU FATURASI/, /FATURA|BILL/],
    [
      /GIYIM|TEKSTIL|CLOTHING|MODA|AYAKKABI|H&M|LC WAIKIKI|DEFACTO/,
      /ALISVERIS|GIYIM|SHOPPING/,
    ],
  ];
  const candidates = data.categories.filter((c) => c.type === "expense");
  for (const sample of [bankText(merchant), bankText(text)]) {
    const group = groups.find(([trigger]) => trigger.test(sample));
    if (group) {
      const category = candidates.find((c) => group[1].test(bankText(c.name)));
      if (category) return { id: category.id, guessed: true };
    }
  }
  return {
    id: candidates.find((c) => /DIGER|OTHER/.test(bankText(c.name)))?.id,
    guessed: false,
  };
}
export function analyzeExpensePhoto(
  text: string,
  data: BudgetData,
): PhotoExpenseSuggestion {
  const lines = text
    .slice(0, 100000)
    .split(/\r?\n/)
    .map((s) => s.replace(/[\t\u00a0]/g, " ").trim())
    .filter(Boolean);
  const currencies = [
    ...new Set(lines.map(currencyIn).filter((s): s is string => !!s)),
  ];
  const currency = currencies.length === 1 ? currencies[0] : undefined;
  const totals: {
      value: { amount: number; currency?: string };
      score: number;
    }[] = [],
    dates: { value: string; score: number }[] = [],
    times: { value: string; score: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      u = bankText(line),
      next = lines[i + 1] ?? "";
    const label = u.match(
      /GENEL TOPLAM|ODENECEK (?:TOPLAM|TUTAR)|ODENEN TUTAR|GRAND TOTAL|TOTAL AMOUNT|AMOUNT DUE|NET TOTAL|NET TOPLAM|\bTOPLAM\b|\bTOTAL\b/,
    );
    if (
      label &&
      !/ARA TOPLAM|SUB\s*TOTAL|INDIRIM|DISCOUNT|PARA USTU|CHANGE|TOPLAM ADET|TOPLAM URUN/.test(
        u,
      ) &&
      (!/KDV|VAT|TAX/.test(u) || /DAHIL|INCL/.test(u))
    ) {
      let part = line.slice((label.index ?? 0) + label[0].length);
      if (!/\d/.test(part)) part = next;
      const ownCurrency = currencyIn(part) ?? currency;
      // Never infer an amount from a quantity, card number, or an unlabeled line.
      const values = [
        ...part.matchAll(/[+-]?\d[\d.,]*(?:[ ]\d{3})*(?:[.,]\d+)?/g),
      ].map((m) =>
        /^-/.test(m[0]) || (!ownCurrency && /[.,]\d{3}$/.test(m[0]))
          ? undefined
          : parseReceiptAmount(m[0], ownCurrency ?? "TRY"),
      );
      if (values.length === 1 && values[0] !== undefined)
        totals.push({
          value: {
            amount: values[0],
            ...(ownCurrency ? { currency: ownCurrency } : {}),
          },
          score: /GENEL|ODENECEK|ODENEN|GRAND|TOTAL AMOUNT|AMOUNT DUE|NET/.test(
            label[0],
          )
            ? 100
            : 80,
        });
    }
    if (!/SON KULLAN|EXPIR|VALID|DOGUM|BIRTH/.test(u)) {
      const date =
        dateIn(line) ?? (/TARIH|DATE/.test(u) ? dateIn(next) : undefined);
      if (date)
        dates.push({
          value: date,
          score: /TARIH|DATE|ISLEM|TRANSACTION/.test(u) ? 100 : 50,
        });
      const time = (
        line.match(/\b(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/)?.[0] ??
        (/SAAT|TIME/.test(u)
          ? next.match(/\b(?:[01]\d|2[0-3]):[0-5]\d/)?.[0]
          : undefined)
      )?.slice(0, 5);
      if (time && validTime(time))
        times.push({
          value: time,
          score: /SAAT|TIME|ISLEM|TRANSACTION/.test(u) ? 100 : 50,
        });
    }
  }
  const merchant = lines
    .slice(0, 10)
    .find((line) => {
      const u = bankText(line);
      return (
        line.length >= 3 &&
        line.length <= 100 &&
        /[A-ZÇĞİÖŞÜ]/.test(u) &&
        !/^[-*=\s]+$/.test(u) &&
        !/^\d/.test(u) &&
        !/(?:\bTEL\b|TELEFON|\bFAX\b|\bVAT\b|VERGI|\bVKN\b|\bTCKN\b|\bIBAN\b|\bADRES\b|\bADDRESS\b|\bTARIH\b|\bDATE\b|\bSAAT\b|\bFIS NO\b|\bPOS\b|\bRECEIPT\b|\bINVOICE\b|\bE-ARSIV\b|\bFATURA\b|\bMAHALLESI\b|\bCAD(?:DESI)?\b|\bSOKAK\b|\bSTREET\b|\bROAD\b)/.test(
          u,
        )
      );
    })
    ?.replace(/^[*\s-]+|[*\s-]+$/g, "")
    .slice(0, 100);
  const total = best(totals),
    date = best(dates),
    time = best(times),
    category = photoCategory(data, merchant ?? "", lines.join("\n")),
    warnings: string[] = [];
  if (!merchant)
    warnings.push("İşletme adı kesin okunamadı; açıklama alanını doldur.");
  if (!total)
    warnings.push(
      "Toplam tutar kesin okunamadı; ürün fiyatlarını toplam tutar sanmamak için tutar boş bırakıldı.",
    );
  if (!total?.currency)
    warnings.push(
      "Para birimi kesin okunamadı. Seçtiğin hesabın para birimini ve fişi kontrol et.",
    );
  if (!date) warnings.push("Fiş tarihi okunamadı; tarih alanını doldur.");
  if (!time) warnings.push("Fiş saati okunamadı; saat boş bırakılacak.");
  if (!category.guessed)
    warnings.push(
      "Kategori kesin belirlenemedi; önerilen kategoriyi kontrol et.",
    );
  if (!lines.length)
    warnings.push(
      "Okunabilir yazı bulunamadı. Daha net ve iyi aydınlatılmış bir fotoğraf çekebilir veya bilgileri elle girebilirsin.",
    );
  return {
    merchant,
    amount: total?.amount,
    currency: total?.currency ?? currency,
    date,
    time,
    categoryId: category.id,
    warnings,
  };
}
