import type {
  InvestmentPosition,
  InvestmentEntry,
} from "./investment-portfolio";
import { budgetTransactions } from "./account-scope";
import { validTime, compareDatedRecordsNewestFirst } from "./time";
export { localTime, validTime } from "./time";
import { currencyDigits, currencyScale } from "./currency";
import {
  validFinanceData,
  type FinancialAccount,
  type AccountTransfer,
  type PaymentPlan,
} from "./finance";
export type TransactionType = "income" | "expense";
export type Category = {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
};
export type Transaction = {
  id: string;
  type: TransactionType;
  categoryId: string;
  amount: number;
  date: string;
  description: string;
  time?: string;
  accountId?: string;
  planId?: string;
  planIndex?: number;
  currency?: string;
  baseAmount?: number;
  fxRate?: number;
  fxUnit?: number;
  fxDate?: string;
  fxSide?: "buying" | "selling";
};
export type FxRateSnapshot = {
  date: string;
  currency: string;
  currencyName: string;
  unit: number;
  forexBuying: number | null;
  forexSelling: number | null;
  banknoteBuying: number | null;
  banknoteSelling: number | null;
  bulletinNo: string;
  rateSource?: "TCMB_USD_OMR_PEG";
  fetchedAtUtc?: string;
};
export type BudgetData = {
  version: 1;
  financialAccounts?: FinancialAccount[];
  accountTransfers?: AccountTransfer[];
  paymentPlans?: PaymentPlan[];
  investmentPositions?: InvestmentPosition[];
  investmentEntries?: InvestmentEntry[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Record<string, Record<string, number>>;
  savingsGoals?: Record<string, number>;
  trackedCurrencies?: string[];
  fxRates?: FxRateSnapshot[];
  demo: boolean;
};
export const PALETTE = [
  "#22C55E",
  "#60A5FA",
  "#A78BFA",
  "#FBBF24",
  "#FB7185",
  "#2DD4BF",
  "#FB923C",
  "#94A3B8",
];
export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "market",
    name: "Market",
    type: "expense",
    color: "#22C55E",
    icon: "shopping-bag",
  },
  {
    id: "dining",
    name: "Dışarıda yemek",
    type: "expense",
    color: "#FBBF24",
    icon: "coffee",
  },
  {
    id: "transport",
    name: "Ulaşım",
    type: "expense",
    color: "#60A5FA",
    icon: "truck",
  },
  {
    id: "bills",
    name: "Faturalar",
    type: "expense",
    color: "#A78BFA",
    icon: "file-text",
  },
  {
    id: "shopping",
    name: "Alışveriş",
    type: "expense",
    color: "#FB7185",
    icon: "gift",
  },
  {
    id: "housing",
    name: "Ev & kira",
    type: "expense",
    color: "#2DD4BF",
    icon: "home",
  },
  {
    id: "health",
    name: "Sağlık",
    type: "expense",
    color: "#FB923C",
    icon: "heart",
  },
  {
    id: "other",
    name: "Diğer gider",
    type: "expense",
    color: "#94A3B8",
    icon: "more-horizontal",
  },
  {
    id: "salary",
    name: "Maaş",
    type: "income",
    color: "#22C55E",
    icon: "briefcase",
  },
  {
    id: "freelance",
    name: "Ek gelir",
    type: "income",
    color: "#2DD4BF",
    icon: "zap",
  },
];
export const money = (value: number, compact = false) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: compact && Number.isInteger(value) ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(value);
export const moneyIn = (value: number, currency: string, compact = false) => {
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
};
export const id = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export const today = () =>
  `${monthKey()}-${String(new Date().getDate()).padStart(2, "0")}`;
export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
};
export const monthLabel = (month: string, short = false) => {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", {
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
  }).format(new Date(y, m - 1, 1));
};
export const compareTransactionsNewestFirst = compareDatedRecordsNewestFirst;
export const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
};
export function parseAmount(input: string, currency = "TRY"): number {
  let v = input.trim().replace(/\s|₺|TRY/gi, "");
  if (v.includes(",") && v.includes("."))
    v =
      v.lastIndexOf(",") > v.lastIndexOf(".")
        ? v.replace(/\./g, "").replace(",", ".")
        : v.replace(/,/g, "");
  else if (v.includes(",")) v = v.replace(",", ".");
  if (!new RegExp(`^\\d+(\\.\\d{1,${currencyDigits(currency)}})?$`).test(v))
    return NaN;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 999999999
    ? Math.round(n * currencyScale(currency)) / currencyScale(currency)
    : NaN;
}
export function emptyData(): BudgetData {
  return {
    version: 1,
    financialAccounts: [],
    accountTransfers: [],
    paymentPlans: [],
    investmentPositions: [],
    investmentEntries: [],
    categories: [...DEFAULT_CATEGORIES],
    transactions: [],
    budgets: {},
    savingsGoals: {},
    trackedCurrencies: ["USD", "EUR", "GBP", "OMR"],
    fxRates: [],
    demo: false,
  };
}
export function demoData(): BudgetData {
  const data = emptyData();
  data.demo = true;
  const month = monthKey();
  const spend = [14200, 15300, 14850, 16400, 17800, 17120];
  for (let i = 0; i < 6; i++) {
    const m = shiftMonth(month, i - 5);
    data.transactions.push({
      id: `demo-salary-${i}`,
      type: "income",
      categoryId: "salary",
      amount: 32000,
      date: `${m}-01`,
      description: "Aylık maaş",
    });
    if (i < 5)
      data.transactions.push({
        id: `demo-expense-${i}`,
        type: "expense",
        categoryId: "market",
        amount: spend[i],
        date: `${m}-10`,
        description: "Önceki ay harcamaları",
      });
  }
  const rows: [string, number, number, string][] = [
    ["housing", 8000, 2, "Aylık kira"],
    ["bills", 1840, 3, "Elektrik, internet & su"],
    ["market", 1250, 4, "Haftalık market alışverişi"],
    ["dining", 650, 5, "Arkadaşlarla akşam yemeği"],
    ["transport", 620, 6, "İstanbulkart yükleme"],
    ["shopping", 1200, 7, "Yeni sezon alışverişi"],
    ["market", 1600, 9, "Market alışverişi"],
    ["dining", 720, 10, "Hafta sonu kahvaltısı"],
    ["health", 300, 11, "Eczane"],
    ["transport", 420, 12, "Taksi"],
    ["market", 1250, 13, "Haftalık market alışverişi"],
    ["dining", 610, 14, "Öğle yemeği"],
    ["dining", 660, 15, "Akşam yemeği"],
  ];
  rows.forEach(([categoryId, amount, day, description], i) =>
    data.transactions.push({
      id: `demo-current-${i}`,
      type: "expense",
      categoryId,
      amount,
      date: `${month}-${String(day).padStart(2, "0")}`,
      description,
    }),
  );
  data.transactions.push({
    id: "demo-extra",
    type: "income",
    categoryId: "freelance",
    amount: 3500,
    date: `${month}-08`,
    description: "Freelance proje ödemesi",
  });
  data.budgets[month] = {
    market: 5000,
    dining: 2000,
    transport: 1500,
    bills: 2500,
    shopping: 1800,
    housing: 8000,
    health: 1000,
  };
  return data;
}
export function summarize(data: BudgetData, month: string) {
  const transactions = budgetTransactions(data).filter(
    (t) => t.date.slice(0, 7) === month,
  );
  const income = sum(transactions.filter((t) => t.type === "income"));
  const expense = sum(transactions.filter((t) => t.type === "expense"));
  const categories = data.categories
    .filter((c) => c.type === "expense")
    .map((c) => {
      const spent = sum(
        transactions.filter(
          (t) => t.categoryId === c.id && t.type === "expense",
        ),
      );
      const budget = data.budgets[month]?.[c.id];
      return {
        ...c,
        spent,
        budget,
        remaining: budget === undefined ? undefined : round(budget - spent),
        ratio: budget ? spent / budget : 0,
      };
    });
  const budgetTotal = round(
    Object.values(data.budgets[month] || {}).reduce((a, b) => a + b, 0),
  );
  const budgetedSpent = round(
    categories
      .filter((c) => c.budget !== undefined)
      .reduce((a, c) => a + c.spent, 0),
  );
  return {
    transactions,
    income,
    expense,
    net: round(income - expense),
    categories,
    budgetTotal,
    budgetRemaining: round(budgetTotal - budgetedSpent),
  };
}
const round = (v: number) => Math.round(v * 100) / 100;
const sum = (rows: Transaction[]) =>
  round(rows.reduce((a, b) => a + (b.baseAmount ?? b.amount), 0));
export function trend(data: BudgetData, month: string) {
  return Array.from({ length: 6 }, (_, i) => {
    const key = shiftMonth(month, i - 5);
    const summary = summarize(data, key);
    return {
      key,
      label: monthLabel(key, true),
      expense: summary.expense,
      income: summary.income,
    };
  });
}
export type Insight = {
  title: string;
  body: string;
  tone: "warning" | "positive" | "neutral";
  icon: string;
};
export function insights(data: BudgetData, month: string): Insight[] {
  const s = summarize(data, month);
  const prev = summarize(data, shiftMonth(month, -1));
  const out: Insight[] = [];
  const over = s.categories
    .filter((c) => c.budget !== undefined && c.spent > c.budget)
    .sort((a, b) => b.ratio - a.ratio);
  over.slice(0, 2).forEach((c) =>
    out.push({
      title: c.budget
        ? `${c.name} bütçeyi %${Math.round((c.ratio - 1) * 100)} aştı`
        : `${c.name} sıfır bütçeyi aştı`,
      body: `${money(c.spent - (c.budget || 0))} limitin üzerinde. Bu kategoriye biraz daha dikkat edebilirsin.`,
      tone: "warning",
      icon: "alert-triangle",
    }),
  );
  if (prev.expense > 0 && s.expense > 0) {
    const change = Math.round((s.expense / prev.expense - 1) * 100);
    out.push({
      title:
        change === 0
          ? "Harcamaların geçen ayla aynı"
          : `Harcamaların geçen aya göre %${Math.abs(change)} ${change < 0 ? "azaldı" : "arttı"}`,
      body: `${monthLabel(shiftMonth(month, -1))}: ${money(prev.expense)} · ${monthLabel(month)}: ${money(s.expense)}. Seçili ayın tüm kayıtları karşılaştırılır.`,
      tone: change < 0 ? "positive" : "neutral",
      icon: change < 0 ? "trending-down" : "trending-up",
    });
  }
  if (s.income > 0 && s.net > 0)
    out.push({
      title: `Gelirinin %${Math.round((s.net / s.income) * 100)}'i sende kaldı`,
      body: `${money(s.net)} net bakiye. Birikim hedefin için güzel bir alan.`,
      tone: "positive",
      icon: "sparkles",
    });
  const top = [...s.categories].sort((a, b) => b.spent - a.spent)[0];
  if (out.length < 3 && top?.spent)
    out.push({
      title: `En büyük pay ${top.name.toLocaleLowerCase("tr-TR")} kategorisinde`,
      body: `Bu ayki giderlerinin %${Math.round((top.spent / s.expense) * 100)}'i bu kategoride: ${money(top.spent)}.`,
      tone: "neutral",
      icon: "pie-chart",
    });
  if (!out.length)
    out.push({
      title: "İçgörüler kayıtlarınla şekillenir",
      body: "Bir gelir veya gider ekle. Bütçe aşımı ve aylık değişimleri senin için hesaplayalım.",
      tone: "neutral",
      icon: "zap",
    });
  return out.slice(0, 3);
}
export function validateData(value: unknown): value is BudgetData {
  const v = value as BudgetData;
  if (
    !v ||
    v.version !== 1 ||
    !Array.isArray(v.categories) ||
    !Array.isArray(v.transactions) ||
    typeof v.budgets !== "object" ||
    !v.budgets ||
    typeof v.demo !== "boolean"
  )
    return false;
  if (
    !v.categories.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        typeof c.name === "string" &&
        typeof c.icon === "string" &&
        typeof c.color === "string" &&
        ["income", "expense"].includes(c.type),
    )
  )
    return false;
  if (
    !v.transactions.every(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.description === "string" &&
        typeof t.amount === "number" &&
        Number.isFinite(t.amount) &&
        t.amount > 0 &&
        (t.currency !== "OMR" ||
          Math.abs(t.amount * 1000 - Math.round(t.amount * 1000)) < 0.0001) &&
        (t.currency === undefined || /^[A-Z]{3}$/.test(t.currency)) &&
        (t.baseAmount === undefined ||
          (typeof t.baseAmount === "number" &&
            Number.isFinite(t.baseAmount) &&
            t.baseAmount >= 0 &&
            t.baseAmount <= 999999999)) &&
        (t.currency === undefined ||
          t.currency === "TRY" ||
          (typeof t.baseAmount === "number" &&
            typeof t.fxRate === "number" &&
            Number.isFinite(t.fxRate) &&
            t.fxRate > 0 &&
            Number.isInteger(t.fxUnit) &&
            t.fxUnit! > 0 &&
            validDate(t.fxDate || "") &&
            t.fxDate! <= t.date &&
            t.fxSide === (t.type === "income" ? "buying" : "selling"))) &&
        validDate(t.date) &&
        (t.time === undefined || validTime(t.time)) &&
        v.categories.some((c) => c.id === t.categoryId && c.type === t.type),
    )
  )
    return false;
  if (
    v.trackedCurrencies !== undefined &&
    (!Array.isArray(v.trackedCurrencies) ||
      v.trackedCurrencies.length > 30 ||
      new Set(v.trackedCurrencies).size !== v.trackedCurrencies.length ||
      !v.trackedCurrencies.every(
        (code) => /^[A-Z]{3}$/.test(code) && code !== "TRY",
      ))
  )
    return false;
  if (
    v.fxRates !== undefined &&
    (!Array.isArray(v.fxRates) ||
      v.fxRates.length > 2000 ||
      !v.fxRates.every(
        (r) =>
          r &&
          validDate(r.date) &&
          /^[A-Z]{3}$/.test(r.currency) &&
          typeof r.currencyName === "string" &&
          Number.isInteger(r.unit) &&
          r.unit > 0 &&
          [
            r.forexBuying,
            r.forexSelling,
            r.banknoteBuying,
            r.banknoteSelling,
          ].every(
            (n) =>
              n === null ||
              (typeof n === "number" && Number.isFinite(n) && n > 0),
          ) &&
          typeof r.bulletinNo === "string" &&
          r.bulletinNo.length <= 20,
      ))
  )
    return false;
  if (v.savingsGoals !== undefined) {
    const goals = v.savingsGoals;
    if (
      !goals ||
      typeof goals !== "object" ||
      Array.isArray(goals) ||
      !Object.entries(goals).every(
        ([m, n]) =>
          /^\d{4}-(0[1-9]|1[0-2])$/.test(m) &&
          typeof n === "number" &&
          Number.isFinite(n) &&
          n > 0 &&
          n <= 999999999 &&
          Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
      )
    )
      return false;
  }
  return (
    validFinanceData(v) &&
    Object.entries(v.budgets).every(
      ([m, budgets]) =>
        /^\d{4}-(0[1-9]|1[0-2])$/.test(m) &&
        budgets &&
        typeof budgets === "object" &&
        Object.entries(budgets).every(
          ([cid, n]) =>
            v.categories.some((c) => c.id === cid && c.type === "expense") &&
            typeof n === "number" &&
            Number.isFinite(n) &&
            n >= 0,
        ),
    )
  );
}
