import {
  BudgetData,
  Category,
  PALETTE,
  Transaction,
  TransactionType,
  id,
  parseAmount,
  validDate,
} from "./model";
import { parseFxNumber, TCMB_CURRENCY_CODES } from "./fx";
export type ImportResult = {
  transactions: Transaction[];
  categories: Category[];
  errors: string[];
  skipped: number;
  total: number;
};
const normalize = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
const fingerprint = (t: Transaction) =>
  [
    t.type,
    t.categoryId,
    t.amount,
    t.currency || "TRY",
    t.date,
    t.description,
  ].join("|");
function parseRows(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/)[0];
  const delimiter =
    (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV dosyasında kapanmamış tırnak var.");
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}
export function importCSV(text: string, data: BudgetData): ImportResult {
  const result: ImportResult = {
    transactions: [],
    categories: [...data.categories],
    errors: [],
    skipped: 0,
    total: 0,
  };
  let rows: string[][];
  try {
    rows = parseRows(text);
  } catch (e) {
    result.errors.push((e as Error).message);
    return result;
  }
  if (rows.length < 2) {
    result.errors.push("Dosyada başlık ve en az bir işlem satırı olmalı.");
    return result;
  }
  const headers = rows[0].map(normalize);
  const aliases: Record<string, string[]> = {
    date: ["date", "tarih"],
    type: ["type", "tur", "tip"],
    category: ["category", "kategori"],
    amount: ["amount", "tutar"],
    description: ["description", "aciklama", "not"],
    id: ["id", "kimlik"],
    currency: ["currency", "para birimi", "doviz", "doviz cinsi"],
    baseAmount: ["baseamount", "tryamount", "trytutar", "try karsiligi"],
    fxRate: ["fxrate", "exchange rate", "kur"],
    fxUnit: ["fxunit", "kur birimi", "unit"],
    fxDate: ["fxdate", "kur tarihi"],
    fxSide: ["fxside", "kur yonu"],
  };
  const col = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [
      key,
      headers.findIndex((h) => names.includes(h)),
    ]),
  );
  const missing = ["date", "type", "category", "amount"].filter(
    (key) => col[key] < 0,
  );
  if (missing.length) {
    result.errors.push(
      `Eksik sütunlar: ${missing.join(", ")}. Beklenen: date,type,category,amount,description.`,
    );
    return result;
  }
  if (rows.length > 10001) {
    result.errors.push("Tek seferde en fazla 10.000 işlem içe aktarılabilir.");
    return result;
  }
  const existingIds = new Set(data.transactions.map((t) => t.id));
  const existing = new Set(data.transactions.map(fingerprint));
  const unescape = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);
  for (let i = 1; i < rows.length; i++) {
    result.total++;
    const row = rows[i];
    const date = (row[col.date] || "").trim();
    const rawType = normalize(row[col.type] || "");
    const type: TransactionType | undefined = ["income", "gelir"].includes(
      rawType,
    )
      ? "income"
      : ["expense", "gider"].includes(rawType)
        ? "expense"
        : undefined;
    const amount = parseAmount(row[col.amount] || "");
    const currency = (row[col.currency] || "TRY").trim().toUpperCase();
    const baseAmount =
      col.baseAmount < 0 ? null : parseFxNumber(row[col.baseAmount] || "");
    const fxRate = col.fxRate < 0 ? null : parseFxNumber(row[col.fxRate] || "");
    const fxUnit = col.fxUnit < 0 ? null : parseFxNumber(row[col.fxUnit] || "");
    const fxDate = (row[col.fxDate] || "").trim();
    const fxSide = normalize(row[col.fxSide] || "");
    const name = unescape((row[col.category] || "").trim());
    const description = unescape(row[col.description] || "");
    if (
      !validDate(date) ||
      !type ||
      !Number.isFinite(amount) ||
      !name ||
      name.length > 40 ||
      description.length > 300 ||
      !/^[A-Z]{3}$/.test(currency) ||
      (currency !== "TRY" &&
        (!TCMB_CURRENCY_CODES.includes(
          currency as (typeof TCMB_CURRENCY_CODES)[number],
        ) ||
          baseAmount === null ||
          baseAmount < 0 ||
          baseAmount > 999999999 ||
          fxRate === null ||
          fxRate <= 0 ||
          fxUnit === null ||
          !Number.isInteger(fxUnit) ||
          fxUnit < 1 ||
          !validDate(fxDate) ||
          !["buying", "selling"].includes(fxSide) ||
          fxSide !== (type === "income" ? "buying" : "selling")))
    ) {
      result.errors.push(
        `Satır ${i + 1}: tarih (YYYY-MM-DD), tür (income/expense), pozitif tutar ve kategori gerekli. Kategori en fazla 40, açıklama 300 karakter.`,
      );
      continue;
    }
    const importedId = (row[col.id] || "").trim();
    if (importedId && existingIds.has(importedId)) {
      result.skipped++;
      continue;
    }
    let category = result.categories.find(
      (c) => c.type === type && normalize(c.name) === normalize(name),
    );
    if (!category) {
      category = {
        id: id(),
        name,
        type,
        color: PALETTE[result.categories.length % PALETTE.length],
        icon: type === "income" ? "briefcase" : "tag",
      };
      result.categories.push(category);
    }
    const transaction: Transaction = {
      id: importedId || id(),
      date,
      type,
      amount,
      categoryId: category.id,
      description,
    };
    if (currency !== "TRY") {
      transaction.currency = currency;
      transaction.baseAmount = baseAmount!;
      transaction.fxRate = fxRate!;
      transaction.fxUnit = fxUnit!;
      transaction.fxDate = fxDate;
      transaction.fxSide = fxSide as "buying" | "selling";
    }
    if (
      existingIds.has(transaction.id) ||
      existing.has(fingerprint(transaction))
    ) {
      result.skipped++;
      continue;
    }
    existingIds.add(transaction.id);
    existing.add(fingerprint(transaction));
    result.transactions.push(transaction);
  }
  return result;
}
const csvCell = (value: string) => {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};
export function exportCSV(data: BudgetData): string {
  const rows = [
    [
      "id",
      "date",
      "type",
      "category",
      "amount",
      "description",
      "currency",
      "baseAmount",
      "fxRate",
      "fxUnit",
      "fxDate",
      "fxSide",
    ]
      .map(csvCell)
      .join(","),
  ];
  [...data.transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) =>
      rows.push(
        [
          t.id,
          t.date,
          t.type,
          data.categories.find((c) => c.id === t.categoryId)?.name || "Diğer",
          t.amount.toFixed(2),
          t.description,
          t.currency || "TRY",
          t.currency && t.currency !== "TRY"
            ? (t.baseAmount ?? "").toString()
            : "",
          t.currency && t.currency !== "TRY" ? (t.fxRate ?? "").toString() : "",
          t.currency && t.currency !== "TRY" ? (t.fxUnit ?? "").toString() : "",
          t.currency && t.currency !== "TRY" ? t.fxDate || "" : "",
          t.currency && t.currency !== "TRY" ? t.fxSide || "" : "",
        ]
          .map(csvCell)
          .join(","),
      ),
    );
  return "\uFEFF" + rows.join("\r\n");
}
export const CSV_TEMPLATE =
  "\uFEFFdate,type,category,amount,description,currency,baseAmount,fxRate,fxUnit,fxDate,fxSide\r\n2026-10-01,income,Maaş,32000.00,Aylık maaş,TRY,,,,,\r\n2026-10-02,expense,Market,10.00,Örnek döviz işlemi,USD,496.02,49.6015,1,2026-10-21,selling";
