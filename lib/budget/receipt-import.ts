import type { BudgetData, Transaction } from "./model";
import type { FinancialAccount, AccountTransfer } from "./finance";
import type { ReceiptImportSource } from "./receipt-model";
import { validIban, normalizeIban } from "./bank-identity";
import { validDate, validTime } from "./model";
import { currencyDigits } from "./currency";
export type ImportMode = "expense" | "income" | "transfer" | "exchange";
export type ReceiptSuggestion = {
  bank?: string;
  amount?: number;
  currency?: string;
  date?: string;
  time?: string;
  description?: string;
  reference?: string;
  mode?: ImportMode;
  accountId?: string;
  fromId?: string;
  toId?: string;
  senderIban?: string;
  recipientIban?: string;
  warnings: string[];
};
export const bankText = (value: string) =>
  value
    .toLocaleUpperCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ|ı/g, "I");
const BANKS: [string, string[]][] = [
  ["Enpara", ["ENPARA"]],
  ["QNB", ["QNB", "FINANSBANK"]],
  ["Garanti BBVA", ["GARANTI"]],
  ["İş Bankası", ["IS BANKASI", "ISBANK"]],
  ["Akbank", ["AKBANK"]],
  ["Ziraat Bankası", ["ZIRAAT"]],
  ["VakıfBank", ["VAKIFBANK", "VAKIF BANK"]],
  ["Halkbank", ["HALKBANK", "HALK BANK"]],
  ["Yapı Kredi", ["YAPI KREDI"]],
  ["DenizBank", ["DENIZBANK"]],
  ["TEB", ["TEB", "TURK EKONOMI BANKASI"]],
  ["Kuveyt Türk", ["KUVEYT TURK"]],
  ["HSBC", ["HSBC"]],
  ["ING", ["ING BANK"]],
  ["Bank Muscat", ["BANK MUSCAT", "BANKMUSCAT"]],
  ["Bank Dhofar", ["BANK DHOFAR", "BANKDHOFAR"]],
  ["Sohar International", ["SOHAR INTERNATIONAL"]],
  ["National Bank of Oman", ["NATIONAL BANK OF OMAN"]],
  ["Oman Arab Bank", ["OMAN ARAB BANK"]],
];
function bankIn(text: string) {
  const upper = bankText(text);
  return BANKS.filter(([, aliases]) =>
    aliases.some((a) => upper.includes(a)),
  ).sort(
    (a, b) =>
      Math.min(...a[1].map((s) => upper.indexOf(s)).filter((n) => n >= 0)) -
      Math.min(...b[1].map((s) => upper.indexOf(s)).filter((n) => n >= 0)),
  )[0]?.[0];
}
const currencyIn = (s: string): string | undefined => {
  const u = bankText(s);
  const code = u.match(
    /\b(OMR|USD|EUR|GBP|AED|SAR|QAR|KWD|BHD|CHF|JPY|CAD|AUD|TRY|TL)\b/,
  );
  if (code) return code[1] === "TL" ? "TRY" : code[1];
  if (/₺|TURK LIRASI/.test(u)) return "TRY";
  if (/€/.test(u)) return "EUR";
  if (/£/.test(u)) return "GBP";
  if (/\$/.test(u)) return "USD";
  if (/\bR\.?O\.?\b|OMANI RIAL/.test(u)) return "OMR";
};
export function parseReceiptAmount(input: string, currency: string) {
  let value = input.replace(/[\s\u00a0]/g, "").replace(/^[+-]/, "");
  if (!/^\d[\d.,]*$/.test(value)) return undefined;
  const comma = value.lastIndexOf(","),
    dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    const [whole, fraction, ...rest] = value.split(decimal);
    if (
      rest.length ||
      !fraction ||
      fraction.length > currencyDigits(currency) ||
      !new RegExp(`^\\d{1,3}(?:\\${group}\\d{3})+$`).test(whole)
    )
      return undefined;
    value = whole.split(group).join("") + "." + fraction;
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? "," : ".";
    const parts = value.split(separator);
    if (parts.length > 2) {
      if (
        !/^\d{1,3}$/.test(parts[0]) ||
        parts.slice(1).some((s) => s.length !== 3)
      )
        return undefined;
      value = parts.join("");
    } else if (parts[1].length === 3 && currency !== "OMR") {
      if (parts[0].length > 3) return undefined;
      value = parts.join("");
    } else {
      if (!parts[1] || parts[1].length > currencyDigits(currency))
        return undefined;
      value = parts[0] + "." + parts[1];
    }
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 999999999 ? n : undefined;
}
function ibans(text: string) {
  const found: string[] = [];
  const lengths: Record<string, number> = {
    TR: 26,
    OM: 23,
    AE: 23,
    SA: 24,
    QA: 29,
    KW: 30,
    BH: 22,
    GB: 22,
    DE: 22,
    FR: 27,
    NL: 18,
    CH: 21,
  };
  const upper = bankText(text);
  for (const match of upper.matchAll(
    /\b(TR|OM|AE|SA|QA|KW|BH|GB|DE|FR|NL|CH)\s*\d\s*\d/g,
  )) {
    let value = "";
    for (const char of upper.slice(match.index)) {
      if (/[A-Z0-9]/.test(char)) value += char;
      else if (!/\s/.test(char)) break;
      if (value.length === lengths[match[1]]) break;
    }
    if (validIban(value) && !found.includes(value)) found.push(value);
  }
  return found;
}
function dateIn(value: string) {
  const iso = value.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/);
  if (iso) {
    const s = `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (validDate(s)) return s;
  }
  const local = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (local) {
    const s = `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
    if (validDate(s)) return s;
  }
  return undefined;
}
function uniqueBest<T>(values: { value: T; score: number }[]) {
  const score = Math.max(...values.map((v) => v.score));
  const best = values.filter((v) => v.score === score);
  const unique = [...new Set(best.map((v) => JSON.stringify(v.value)))];
  return unique.length === 1 ? best[0].value : undefined;
}
export function analyzeReceipt(
  text: string,
  accounts: FinancialAccount[],
): ReceiptSuggestion {
  const lines = text
    .slice(0, 200000)
    .split(/\r?\n/)
    .map((s) => s.replace(/[\t\u00a0]/g, " ").trim())
    .filter(Boolean);
  const all = lines.join("\n"),
    upper = bankText(all),
    warnings: string[] = [];
  const bank = bankIn(lines.slice(0, 20).join("\n")) ?? bankIn(all);
  const globalCurrencies = [
    ...new Set(lines.map(currencyIn).filter((s): s is string => !!s)),
  ];
  const amounts: {
    value: { amount: number; currency: string };
    score: number;
  }[] = [];
  const dates: { value: string; score: number }[] = [],
    times: { value: string; score: number }[] = [];
  let senderIban: string | undefined,
    recipientIban: string | undefined,
    party: "sender" | "recipient" | undefined,
    partyAge = 99;
  let description: string | undefined, reference: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      u = bankText(line),
      next = lines[i + 1] ?? "";
    const sender =
      /GONDEREN|GONDERICI|BORCLU|SENDER|REMITTER|DEBTOR|FROM ACCOUNT/.test(u);
    const recipient =
      /ALICI|LEHTAR|ALACAKLI|BENEFICIARY|RECEIVER|CREDITOR|TO ACCOUNT/.test(u);
    if (sender && !recipient) {
      party = "sender";
      partyAge = 0;
    } else if (recipient && !sender) {
      party = "recipient";
      partyAge = 0;
    } else partyAge++;
    const found = ibans(line);
    if (found.length === 1 && partyAge < 5) {
      if (party === "sender") senderIban ??= found[0];
      if (party === "recipient") recipientIban ??= found[0];
    }
    const amountLabel = u.match(
      /ISLEM TUTARI|TRANSFER TUTARI|GONDERILEN TUTAR|ODEME TUTARI|HAVALE TUTARI|EFT TUTARI|FAST TUTARI|TRANSACTION AMOUNT|TRANSFER AMOUNT|AMOUNT TRANSFERRED|\bTUTAR(?:I)?\b|\bAMOUNT\b/,
    );
    if (
      amountLabel &&
      !/BAKIYE|BALANCE|KOMISYON|MASRAF|UCRET|CHARGE|FEE|BSMV/.test(
        u.slice(0, amountLabel.index),
      )
    ) {
      let part = line.slice((amountLabel.index ?? 0) + amountLabel[0].length);
      if (!/\d/.test(part)) part = next;
      const stop = bankText(part).search(
        /KOMISYON|MASRAF|UCRET|CHARGE|FEE|BSMV|BAKIYE|BALANCE/,
      );
      if (stop >= 0) part = part.slice(0, stop);
      const currency =
        currencyIn(part) ??
        (globalCurrencies.length === 1 ? globalCurrencies[0] : undefined);
      const values = [...part.matchAll(/[+-]?\d[\d., ]{0,40}/g)]
        .map((m) => m[0].trim())
        .map((s) => (currency ? parseReceiptAmount(s, currency) : undefined))
        .filter((s): s is number => s !== undefined);
      if (currency && values.length === 1)
        amounts.push({
          value: { amount: values[0], currency },
          score:
            /ISLEM|TRANSFER|GONDERILEN|ODEME|TRANSACTION|HAVALE|EFT|FAST/.test(
              amountLabel[0],
            )
              ? 100
              : 80,
        });
    }
    const date =
      dateIn(line) ??
      (/ISLEM TARIH|TRANSACTION DATE|TRANSFER DATE|\bTARIH\b|\bDATE\b/.test(u)
        ? dateIn(next)
        : undefined);
    if (date && !/VALOR|VALUE DATE|DOGUM|BIRTH|BASIM|PRINT|DUZENLENME/.test(u))
      dates.push({
        value: date,
        score: /ISLEM|TRANSACTION|TRANSFER/.test(u)
          ? 100
          : /TARIH|DATE/.test(u)
            ? 70
            : 20,
      });
    const time = (
      line.match(/\b([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/)?.[0] ??
      (/ISLEM SAATI|TRANSACTION TIME/.test(u)
        ? next.match(/\b([01]\d|2[0-3]):[0-5]\d/)?.[0]
        : undefined)
    )?.slice(0, 5);
    if (time && validTime(time) && !/PRINT|BASIM|DUZENLENME/.test(u))
      times.push({
        value: time,
        score: /ISLEM|TRANSACTION|TRANSFER/.test(u) ? 100 : 30,
      });
    if (
      !description &&
      /^(?:ISLEM )?ACIKLAMA\b|^DESCRIPTION\b|^PAYMENT DETAILS\b/.test(u)
    )
      description = (
        line
          .replace(
            /^(?:işlem\s+)?açıklama\s*[:：]?\s*|^(?:islem\s+)?aciklama\s*[:：]?\s*|^description\s*[:：]?\s*|^payment details\s*[:：]?\s*/i,
            "",
          )
          .trim() || next
      ).slice(0, 300);
    if (
      !reference &&
      /ISLEM (?:NO|NUMARA)|REFERANS|REFERENCE|DEKONT (?:NO|NUMARA)/.test(u)
    ) {
      const label = u.match(
        /ISLEM (?:NO(?:SU)?|NUMARASI)|REFERANS(?: NO(?:SU)?)?|REFERENCE(?: NUMBER| NO)?|DEKONT (?:NO(?:SU)?|NUMARASI)/,
      );
      const value =
        (label
          ? line
              .slice((label.index ?? 0) + label[0].length)
              .replace(/^[\s:：.-]+/, "")
              .trim()
          : "") || next;
      if (/^[A-Za-z0-9][A-Za-z0-9 /_.-]{2,119}$/.test(value) && !dateIn(value))
        reference = value.trim();
    }
  }
  const amount = uniqueBest(amounts),
    date = uniqueBest(dates),
    time = uniqueBest(times);
  const eligible = accounts.filter((a) => !a.archived);
  const exact = (iban?: string) => {
    const found = iban
      ? eligible.filter((a) => a.iban && normalizeIban(a.iban) === iban)
      : [];
    return found.length === 1 ? found[0] : undefined;
  };
  const from = exact(senderIban),
    to = exact(recipientIban);
  let mode: ImportMode | undefined;
  if (from && to && from.id !== to.id)
    mode = from.currency === to.currency ? "transfer" : "exchange";
  else if (from && !to) mode = "expense";
  else if (to && !from) mode = "income";
  else if (
    /GELEN (?:EFT|FAST|HAVALE)|ALACAK KAYDI|INCOMING TRANSFER|CREDITED TO/.test(
      upper,
    )
  )
    mode = "income";
  else if (
    /GIDEN (?:EFT|FAST|HAVALE)|GONDERILEN|PARA GONDER|BORC KAYDI|OUTGOING TRANSFER|DEBITED FROM|POS HARCAMA/.test(
      upper,
    )
  )
    mode = "expense";
  if (
    /HESAPLARIM ARASI|KENDI HESAPLAR|KART BORCU ODEME|KREDI KARTI (?:BORC )?ODEME|CASH WITHDRAWAL|NAKIT CEKIM|PARA CEKME/.test(
      upper,
    ) &&
    mode !== "exchange"
  )
    mode = "transfer";
  const allIbans = ibans(all),
    matched = allIbans.map(exact).filter((a): a is FinancialAccount => !!a);
  let account = mode === "income" ? to : from;
  if (!account && matched.length === 1) account = matched[0];
  if (!account && bank) {
    const family =
      bank === "Enpara"
        ? ["ENPARA"]
        : bank === "QNB"
          ? ["QNB", "FINANSBANK"]
          : (BANKS.find(([name]) => name === bank)?.[1] ?? [bankText(bank)]);
    const candidates = eligible.filter(
      (a) =>
        a.kind !== "cash" &&
        (!amount || a.currency === amount.currency) &&
        family.some((alias) =>
          bankText(`${a.name} ${a.bankName ?? ""}`).includes(alias),
        ),
    );
    if (candidates.length === 1) account = candidates[0];
  }
  if (
    account?.kind === "investment" &&
    mode !== "transfer" &&
    mode !== "exchange"
  ) {
    mode = undefined;
    warnings.push(
      "Yatırım hesabı tespit edildi; işlem türünü transfer olarak kontrol et.",
    );
  }
  if (!mode)
    warnings.push(
      "Gelir, gider veya transfer yönü kesin belirlenemedi. İşlem türünü seç.",
    );
  if (!amount)
    warnings.push(
      "Tutar ve para birimi kesin okunamadı. İşlem ekranında doldur.",
    );
  if (!date)
    warnings.push("İşlem tarihi kesin okunamadı. İşlem ekranında doldur.");
  if (!time)
    warnings.push("İşlem saati bulunamadı; saat alanı boş bırakılacak.");
  if (!account && !from)
    warnings.push(
      "Hesap eşleşmedi. İşlem ekranında kendi hesabını seç. Hesaplarına banka adı/IBAN eklemek eşleşmeyi iyileştirir.",
    );
  if (!all.trim())
    warnings.push(
      "Bu PDF'te okunabilir metin bulunamadı. Taranmış veya resim tabanlı dekont bilgilerini elle doldurabilirsin.",
    );
  return {
    bank,
    ...amount,
    date,
    time,
    description:
      description ||
      [bank, reference && `Ref: ${reference}`].filter(Boolean).join(" · ") ||
      undefined,
    reference,
    mode,
    accountId: account?.id,
    fromId: from?.id ?? (mode !== "income" ? account?.id : undefined),
    toId: to?.id,
    senderIban,
    recipientIban,
    warnings,
  };
}
export function importedDuplicate(
  data: BudgetData,
  source: ReceiptImportSource,
  date?: string,
) {
  const match = (value: Transaction | AccountTransfer) =>
    value.receiptImport?.sha256 === source.sha256 ||
    !!(
      date &&
      source.reference &&
      source.bank &&
      value.date === date &&
      value.receiptImport?.reference === source.reference &&
      value.receiptImport?.bank === source.bank
    );
  const transaction = data.transactions.find(match);
  if (transaction) return { kind: "transaction" as const, value: transaction };
  const transfer = data.accountTransfers?.find(match);
  return transfer ? { kind: "transfer" as const, value: transfer } : undefined;
}
export function suggestedCategory(
  data: BudgetData,
  mode: "income" | "expense",
  text: string,
) {
  const description = bankText(text);
  const keywords =
    mode === "income" && /MAAS|SALARY/.test(description)
      ? /MAAS|SALARY/
      : mode === "expense" &&
          /AIDAT|FATURA|ELEKTRIK|SU BEDELI|DOGALGAZ/.test(description)
        ? /FATURA|BILLS/
        : mode === "expense" && /KIRA|RENT/.test(description)
          ? /KIRA|HOUSING/
          : /DIGER|OTHER|EK GELIR/;
  return (
    data.categories.find(
      (c) => c.type === mode && keywords.test(bankText(c.name)),
    )?.id ?? data.categories.find((c) => c.type === mode)?.id
  );
}
