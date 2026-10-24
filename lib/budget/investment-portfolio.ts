import type { BudgetData } from "./model";
import type { FinancialAccount } from "./finance";
import { currencyScale, minorUnits } from "./currency";
import { compareDatedRecordsNewestFirst } from "./time";
import { transferReceivedAmount } from "./exchange";

export type InvestmentPosition = {
  id: string;
  accountId: string;
  currency: string;
  name: string;
  kind: "deposit" | "stock" | "fund" | "gold" | "other";
  startDate: string;
  maturityDate?: string;
  annualRate?: number;
  withholdingRate?: number;
  archived: boolean;
};
export type InvestmentEntry = {
  id: string;
  positionId: string;
  type: "allocate" | "release" | "income" | "expense" | "valuation";
  amount: number;
  date: string;
  time?: string;
  note: string;
};
export const investmentKindNames = {
  deposit: "Mevduat",
  stock: "Borsa",
  fund: "Fon",
  gold: "Altın",
  other: "Diğer",
};
export const investmentEntryNames = {
  allocate: "Anapara yatırma",
  release: "Anapara çekme",
  income: "Gerçekleşen getiri",
  expense: "Zarar / masraf",
  valuation: "Güncel değer",
};
const validDate = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const validId = (s: unknown): s is string =>
  typeof s === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,190}$/.test(s);
const moneyValid = (n: unknown, currency: string, zero = false): n is number =>
  typeof n === "number" &&
  Number.isFinite(n) &&
  n <= 999999999 &&
  (zero ? n >= 0 : n > 0) &&
  Math.abs(n * currencyScale(currency) - minorUnits(n, currency)) < 0.0001;
export function investmentCashEntries(
  data: BudgetData,
  accountId: string,
  asOf = "9999-12-31",
) {
  const ids = new Set(
    (data.investmentPositions ?? [])
      .filter((p) => p.accountId === accountId)
      .map((p) => p.id),
  );
  return (data.investmentEntries ?? []).filter(
    (e): e is InvestmentEntry & { type: "income" | "expense" } =>
      ids.has(e.positionId) &&
      e.date <= asOf &&
      (e.type === "income" || e.type === "expense"),
  );
}
export function investmentCashDelta(
  data: BudgetData,
  account: FinancialAccount,
  asOf: string,
) {
  return (
    investmentCashEntries(data, account.id, asOf).reduce(
      (n, e) =>
        n +
        (e.type === "income" ? 1 : -1) * minorUnits(e.amount, account.currency),
      0,
    ) / currencyScale(account.currency)
  );
}
export function positionSummary(
  data: BudgetData,
  position: InvestmentPosition,
  asOf: string,
  month = asOf.slice(0, 7),
) {
  const units = (n: number) => minorUnits(n, position.currency),
    scale = currencyScale(position.currency);
  let principal = 0,
    value = 0,
    allocated = 0,
    released = 0,
    income = 0,
    expense = 0,
    monthIncome = 0,
    monthExpense = 0;
  let valuationDate: string | undefined;
  const entries = (data.investmentEntries ?? [])
    .filter((e) => e.positionId === position.id && e.date <= asOf)
    .sort(compareDatedRecordsNewestFirst);
  for (const e of [...entries].reverse()) {
    const amount = units(e.amount);
    if (e.type === "allocate") {
      principal += amount;
      allocated += amount;
      value += amount;
    }
    if (e.type === "release") {
      value -= principal > 0 ? Math.round((value * amount) / principal) : 0;
      principal -= amount;
      released += amount;
    }
    if (e.type === "valuation") {
      value = amount;
      valuationDate = e.date;
    }
    if (e.type === "income") {
      income += amount;
      if (e.date.startsWith(month + "-")) monthIncome += amount;
    }
    if (e.type === "expense") {
      expense += amount;
      if (e.date.startsWith(month + "-")) monthExpense += amount;
    }
  }
  const days = position.maturityDate
    ? Math.round(
        (Date.parse(position.maturityDate + "T00:00:00Z") -
          Date.parse(position.startDate + "T00:00:00Z")) /
          86400000,
      )
    : undefined;
  const expectedInterest =
    position.kind === "deposit" &&
    days !== undefined &&
    position.annualRate !== undefined
      ? units(
          (((((principal / scale) * position.annualRate) / 100) * days) / 365) *
            (1 - (position.withholdingRate ?? 0) / 100),
        ) / scale
      : undefined;
  return {
    entries,
    principal: principal / scale,
    allocated: allocated / scale,
    released: released / scale,
    value: value / scale,
    income: income / scale,
    expense: expense / scale,
    monthIncome: monthIncome / scale,
    monthExpense: monthExpense / scale,
    monthlyNet: (monthIncome - monthExpense) / scale,
    unrealized: (value - principal) / scale,
    totalReturn: (income - expense + value - principal) / scale,
    valuationDate,
    expectedInterest,
    days,
  };
}
export function portfolioAccountSummary(
  data: BudgetData,
  account: FinancialAccount,
  bookBalance: number,
  asOf: string,
  month: string,
) {
  const positions = (data.investmentPositions ?? []).filter(
    (p) => p.accountId === account.id,
  );
  const rows = positions.map((position) => ({
    position,
    ...positionSummary(data, position, asOf, month),
  }));
  const scale = currencyScale(account.currency),
    sum = (
      key:
        | "principal"
        | "value"
        | "monthIncome"
        | "monthExpense"
        | "income"
        | "expense",
    ) => rows.reduce((n, r) => n + minorUnits(r[key], account.currency), 0);
  const principal = sum("principal"),
    cash = minorUnits(bookBalance, account.currency) - principal,
    value = sum("value");
  return {
    rows,
    cash: cash / scale,
    principal: principal / scale,
    value: value / scale,
    totalValue: (cash + value) / scale,
    monthIncome: sum("monthIncome") / scale,
    monthExpense: sum("monthExpense") / scale,
    monthlyNet: (sum("monthIncome") - sum("monthExpense")) / scale,
    unrealized: (value - principal) / scale,
    totalReturn: (sum("income") - sum("expense") + value - principal) / scale,
  };
}
/** All amounts stay in the investment account's original currency. */
export function validPortfolioData(data: BudgetData) {
  const positions = data.investmentPositions ?? [],
    entries = data.investmentEntries ?? [];
  if (
    !Array.isArray(positions) ||
    !Array.isArray(entries) ||
    positions.length > 500 ||
    entries.length > 10000
  )
    return false;
  if (
    new Set(positions.map((p) => p?.id)).size !== positions.length ||
    new Set(entries.map((e) => e?.id)).size !== entries.length
  )
    return false;
  const accounts = new Map(
    (data.financialAccounts ?? []).map((a) => [a.id, a]),
  );
  const byId = new Map(positions.map((p) => [p?.id, p]));
  for (const p of positions) {
    const a = accounts.get(p?.accountId);
    if (
      !p ||
      !validId(p.id) ||
      !a ||
      a.kind !== "investment" ||
      p.currency !== a.currency ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 80 ||
      !Object.keys(investmentKindNames).includes(p.kind) ||
      !validDate(p.startDate) ||
      p.startDate < a.openingDate ||
      typeof p.archived !== "boolean"
    )
      return false;
    if (
      p.maturityDate !== undefined &&
      (!validDate(p.maturityDate) || p.maturityDate < p.startDate)
    )
      return false;
    for (const [value, max] of [
      [p.annualRate, 1000],
      [p.withholdingRate, 100],
    ] as const)
      if (
        value !== undefined &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > max ||
          Number(value.toFixed(4)) !== value)
      )
        return false;
    if (
      p.kind !== "deposit" &&
      (p.maturityDate !== undefined ||
        p.annualRate !== undefined ||
        p.withholdingRate !== undefined)
    )
      return false;
  }
  for (const e of entries) {
    const p = byId.get(e?.positionId);
    if (
      !e ||
      !validId(e.id) ||
      !p ||
      !Object.keys(investmentEntryNames).includes(e.type) ||
      !moneyValid(e.amount, p.currency, e.type === "valuation") ||
      !validDate(e.date) ||
      e.date < p.startDate ||
      (e.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) ||
      typeof e.note !== "string" ||
      e.note.length > 300
    )
      return false;
  }
  for (const p of positions) {
    let principal = 0,
      value = 0;
    for (const e of entries
      .filter((e) => e.positionId === p.id)
      .sort((a, b) => compareDatedRecordsNewestFirst(b, a))) {
      const n = minorUnits(e.amount, p.currency);
      if (e.type === "allocate") {
        principal += n;
        value += n;
      }
      if (e.type === "release") {
        if (n > principal) return false;
        value -= principal > 0 ? Math.round((value * n) / principal) : 0;
        principal -= n;
      }
      if (e.type === "valuation") value = n;
      if (principal < 0 || value < 0) return false;
    }
    if (p.archived && (principal !== 0 || value !== 0)) return false;
  }
  // Check daily cash availability, including the real account's funding and historical movements.
  for (const a of accounts.values()) {
    if (a.kind !== "investment" || !positions.some((p) => p.accountId === a.id))
      continue;
    const daily = new Map<string, { cash: number; held: number }>();
    const add = (date: string, cash: number, held = 0) => {
      const v = daily.get(date) ?? { cash: 0, held: 0 };
      v.cash += cash;
      v.held += held;
      daily.set(date, v);
    };
    add(a.openingDate, minorUnits(a.openingBalance, a.currency));
    for (const t of data.transactions)
      if (t.accountId === a.id)
        add(
          t.date,
          (t.type === "income" ? 1 : -1) * minorUnits(t.amount, a.currency),
        );
    for (const t of data.accountTransfers ?? []) {
      if (t.fromId === a.id) add(t.date, -minorUnits(t.amount, a.currency));
      if (t.toId === a.id)
        add(t.date, minorUnits(transferReceivedAmount(t), a.currency));
    }
    for (const e of entries) {
      if (byId.get(e.positionId)?.accountId !== a.id) continue;
      const n = minorUnits(e.amount, a.currency);
      if (e.type === "income") add(e.date, n);
      if (e.type === "expense") add(e.date, -n);
      if (e.type === "allocate") add(e.date, 0, n);
      if (e.type === "release") add(e.date, 0, -n);
    }
    let cash = 0,
      held = 0;
    for (const date of [...daily.keys()].sort()) {
      cash += daily.get(date)!.cash;
      held += daily.get(date)!.held;
      if (held > 0 && cash < held) return false;
    }
  }
  return true;
}
function ensure(data: BudgetData) {
  if (!validPortfolioData(data))
    throw new Error(
      "Yatırım kaydı doğrulanamadı. Kullanılabilir nakdi, anapara çekimini, güncel değeri ve tarihleri kontrol et.",
    );
  return data;
}
export function saveInvestmentPosition(
  data: BudgetData,
  position: InvestmentPosition,
  initial?: InvestmentEntry,
) {
  const old = data.investmentPositions?.find((p) => p.id === position.id);
  if (
    old &&
    (old.accountId !== position.accountId ||
      old.currency !== position.currency) &&
    data.investmentEntries?.some((e) => e.positionId === old.id)
  )
    throw new Error(
      "Hareketi bulunan yatırımın hesabı ve para birimi değiştirilemez.",
    );
  if (
    data.financialAccounts?.find((a) => a.id === position.accountId)?.archived
  )
    throw new Error("Önce yatırım hesabını arşivden çıkar.");
  const next = {
    ...data,
    investmentPositions: old
      ? data.investmentPositions!.map((p) =>
          p.id === position.id ? position : p,
        )
      : [...(data.investmentPositions ?? []), position],
    investmentEntries: initial
      ? [...(data.investmentEntries ?? []), initial]
      : (data.investmentEntries ?? []),
  };
  if (
    initial &&
    (old || initial.positionId !== position.id || initial.type !== "allocate")
  )
    throw new Error("Başlangıç anaparası yalnızca yeni yatırıma eklenebilir.");
  return ensure(next);
}
export function saveInvestmentEntry(data: BudgetData, entry: InvestmentEntry) {
  const p = data.investmentPositions?.find((p) => p.id === entry.positionId),
    old = data.investmentEntries?.find((e) => e.id === entry.id);
  if (
    !p ||
    p.archived ||
    data.financialAccounts?.find((a) => a.id === p.accountId)?.archived
  )
    throw new Error("Aktif bir yatırım ve yatırım hesabı seç.");
  if (old && old.positionId !== entry.positionId)
    throw new Error("Hareketin bağlı olduğu yatırım değiştirilemez.");
  return ensure({
    ...data,
    investmentEntries: old
      ? data.investmentEntries!.map((e) => (e.id === entry.id ? entry : e))
      : [...(data.investmentEntries ?? []), entry],
  });
}
export function deleteInvestmentEntry(data: BudgetData, id: string) {
  const e = data.investmentEntries?.find((e) => e.id === id),
    p = data.investmentPositions?.find((p) => p.id === e?.positionId);
  if (
    !e ||
    !p ||
    p.archived ||
    data.financialAccounts?.find((a) => a.id === p.accountId)?.archived
  )
    throw new Error("Silmek için yatırım ve hesabını arşivden çıkar.");
  return ensure({
    ...data,
    investmentEntries: data.investmentEntries!.filter((e) => e.id !== id),
  });
}
