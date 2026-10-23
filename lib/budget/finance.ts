import { isInvestmentAccount } from "./account-scope";
import {
  validExchange,
  transferReceivedAmount,
  type CurrencyExchange,
} from "./exchange";
import { validTime } from "./time";
import { currencyScale, minorUnits } from "./currency";
import type { BudgetData, Transaction } from "./model";
import { SUPPORTED_CURRENCY_CODES } from "./fx";
export type FinancialAccount = {
  id: string;
  name: string;
  kind: "cash" | "bank" | "card" | "investment";
  currency: string;
  openingBalance: number;
  openingDate: string;
  archived: boolean;
  creditLimit?: number;
  statementDay?: number;
  paymentDay?: number;
};
export type AccountTransfer = {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  currency: string;
  date: string;
  note: string;
  time?: string;
  exchange?: CurrencyExchange;
};
export type PaymentPlan = {
  id: string;
  title: string;
  kind: "once" | "monthly" | "installment";
  type: "income" | "expense";
  amount: number;
  currency: string;
  categoryId: string;
  accountId?: string;
  startDate: string;
  endDate?: string;
  count?: number;
  archived: boolean;
};
export type PaymentOccurrence = {
  plan: PaymentPlan;
  index: number;
  date: string;
  amount: number;
  transaction?: Transaction;
};
const cents = minorUnits;
const dateValid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const moneyValid = (n: unknown, zero = false, currency = "TRY"): n is number =>
  typeof n === "number" &&
  Number.isFinite(n) &&
  Math.abs(n) <= 999999999 &&
  (zero || n > 0) &&
  Math.abs(n * currencyScale(currency) - cents(n, currency)) < 0.0001;
const identifier = (s: unknown): s is string =>
  typeof s === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,190}$/.test(s);
const currencyValid = (s: unknown): s is string =>
  s === "TRY" ||
  (typeof s === "string" &&
    (SUPPORTED_CURRENCY_CODES as readonly string[]).includes(s));
function unique(rows: { id: string }[]) {
  return (
    rows.every((r) => r && identifier(r.id)) &&
    new Set(rows.map((r) => r.id)).size === rows.length
  );
}
/** Clamp independently from the original start day: Jan 31 -> Feb 28 -> Mar 31. */
export function monthlyDate(
  start: string,
  index: number,
  day = Number(start.slice(8)),
) {
  const d = new Date(start + "T00:00:00Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + index);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function installmentAmount(
  total: number,
  count: number,
  index: number,
  currency = "TRY",
) {
  const all = cents(total, currency),
    each = Math.floor(all / count);
  return (each + (index < all % count ? 1 : 0)) / currencyScale(currency);
}
export function occurrenceDate(plan: PaymentPlan, index: number) {
  return plan.kind === "once"
    ? plan.startDate
    : monthlyDate(plan.startDate, index);
}
export function occurrenceAmount(plan: PaymentPlan, index: number) {
  return plan.kind === "installment"
    ? installmentAmount(plan.amount, plan.count!, index, plan.currency)
    : plan.amount;
}
export function paymentOccurrences(
  data: BudgetData,
  from: string,
  to: string,
): PaymentOccurrence[] {
  const paid = new Map(
    data.transactions
      .filter((t) => t.planId !== undefined)
      .map((t) => [`${t.planId}:${t.planIndex}`, t]),
  );
  const out: PaymentOccurrence[] = [];
  for (const plan of data.paymentPlans ?? []) {
    if (isInvestmentAccount(data, plan.accountId)) continue;
    if (plan.archived && !data.transactions.some((t) => t.planId === plan.id))
      continue;
    const startMonth =
      Number(plan.startDate.slice(0, 4)) * 12 +
      Number(plan.startDate.slice(5, 7));
    const targetMonth =
      Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
    const begin =
      plan.kind === "once" ? 0 : Math.max(0, targetMonth - startMonth);
    const limit =
      plan.kind === "once"
        ? 1
        : plan.kind === "installment"
          ? plan.count!
          : 1200;
    for (let index = begin; index < limit; index++) {
      const date = occurrenceDate(plan, index);
      if (date > to || (plan.endDate && date > plan.endDate)) break;
      if (date < from) continue;
      if (plan.archived && !paid.has(`${plan.id}:${index}`)) continue;
      out.push({
        plan,
        index,
        date,
        amount: occurrenceAmount(plan, index),
        transaction: paid.get(`${plan.id}:${index}`),
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.plan.title.localeCompare(b.plan.title),
  );
}
export function accountBalance(
  data: BudgetData,
  account: FinancialAccount,
  asOf: string,
) {
  if (asOf < account.openingDate) return 0;
  const currency = account.currency;
  let n = cents(account.openingBalance, currency);
  for (const t of data.transactions)
    if (t.accountId === account.id && t.date <= asOf)
      n += (t.type === "income" ? 1 : -1) * cents(t.amount, currency);
  for (const t of data.accountTransfers ?? [])
    if (t.date <= asOf) {
      if (t.fromId === account.id) n -= cents(t.amount, currency);
      if (t.toId === account.id)
        n += cents(transferReceivedAmount(t), currency);
    }
  return n / currencyScale(currency);
}
export function pendingInstallments(data: BudgetData, accountId: string) {
  if (isInvestmentAccount(data, accountId)) return 0;
  const paid = new Set(
    data.transactions
      .filter((t) => t.planId !== undefined)
      .map((t) => `${t.planId}:${t.planIndex}`),
  );
  const currency =
    data.financialAccounts?.find((a) => a.id === accountId)?.currency ?? "TRY";
  let total = 0;
  for (const p of data.paymentPlans ?? [])
    if (!p.archived && p.kind === "installment" && p.accountId === accountId)
      for (let i = 0; i < p.count!; i++)
        if (!paid.has(`${p.id}:${i}`))
          total += cents(occurrenceAmount(p, i), currency);
  return total / currencyScale(currency);
}
export function cardDates(account: FinancialAccount, from: string) {
  const anchor = from.slice(0, 7) + "-01";
  let closing = monthlyDate(anchor, 0, account.statementDay!);
  if (closing < from) closing = monthlyDate(anchor, 1, account.statementDay!);
  let payment = monthlyDate(anchor, 0, account.paymentDay!);
  if (payment < from) payment = monthlyDate(anchor, 1, account.paymentDay!);
  return { closing, payment };
}
export function setAccountArchived(
  data: BudgetData,
  accountId: string,
  archived: boolean,
  asOf: string,
): BudgetData {
  const account = data.financialAccounts?.find((a) => a.id === accountId);
  if (!account) throw new Error("Hesap bulunamadı.");
  if (
    archived &&
    (accountBalance(data, account, asOf) !== 0 ||
      (data.paymentPlans ?? []).some(
        (p) => p.accountId === accountId && !p.archived,
      ) ||
      data.transactions.some(
        (t) => t.accountId === accountId && t.date > asOf,
      ) ||
      (data.accountTransfers ?? []).some(
        (t) =>
          (t.fromId === accountId || t.toId === accountId) && t.date > asOf,
      ))
  )
    throw new Error(
      "Arşivlemeden önce bakiyeyi sıfırla ve bağlı planları kapat.",
    );
  return {
    ...data,
    financialAccounts: data.financialAccounts!.map((a) =>
      a.id === accountId ? { ...a, archived } : a,
    ),
  };
}
export function saveFinancialAccount(
  data: BudgetData,
  account: FinancialAccount,
): BudgetData {
  const previous = data.financialAccounts?.find((a) => a.id === account.id);
  if (previous?.archived)
    throw new Error("Düzenlemeden önce hesabı arşivden çıkar.");
  const used =
    data.transactions.some((t) => t.accountId === account.id) ||
    (data.accountTransfers ?? []).some(
      (t) => t.fromId === account.id || t.toId === account.id,
    ) ||
    (data.paymentPlans ?? []).some((p) => p.accountId === account.id);
  if (previous && used && previous.currency !== account.currency)
    throw new Error(
      "İşlem veya plan bağlı hesabın para birimi değiştirilemez.",
    );
  if (previous && previous.kind !== account.kind) {
    if (
      account.kind !== "card" &&
      account.kind !== "investment" &&
      data.paymentPlans?.some(
        (p) => p.accountId === account.id && p.kind === "installment",
      )
    )
      throw new Error(
        "Taksit geçmişi bağlı hesabı Kredi kartı veya Yatırım türünde tut. Diğer türler için önce taksit bağlantılarını düzenle.",
      );
    if (
      account.kind === "card" &&
      data.accountTransfers?.some(
        (t) => t.exchange && (t.fromId === account.id || t.toId === account.id),
      )
    )
      throw new Error(
        "Döviz dönüşümü geçmişi bağlı hesap Kredi kartı yapılamaz; Nakit, Banka veya Yatırım seçebilirsin.",
      );
  }
  if (
    data.transactions.some(
      (t) => t.accountId === account.id && t.date < account.openingDate,
    ) ||
    (data.accountTransfers ?? []).some(
      (t) =>
        (t.fromId === account.id || t.toId === account.id) &&
        t.date < account.openingDate,
    ) ||
    (data.paymentPlans ?? []).some(
      (p) => p.accountId === account.id && p.startDate < account.openingDate,
    )
  )
    throw new Error(
      "Başlangıç tarihi mevcut hareket veya planlardan sonra olamaz.",
    );
  return {
    ...data,
    financialAccounts: previous
      ? data.financialAccounts!.map((a) => (a.id === account.id ? account : a))
      : [...(data.financialAccounts ?? []), account],
  };
}
export function saveTransfer(
  data: BudgetData,
  transfer: AccountTransfer,
): BudgetData {
  const from = data.financialAccounts?.find((a) => a.id === transfer.fromId),
    to = data.financialAccounts?.find((a) => a.id === transfer.toId);
  if (
    transfer.exchange !== undefined ||
    !from ||
    !to ||
    from.archived ||
    to.archived ||
    from.id === to.id ||
    from.currency !== to.currency ||
    transfer.currency !== from.currency
  )
    throw new Error("Aynı para biriminde iki farklı aktif hesap seç.");
  if (transfer.date < from.openingDate || transfer.date < to.openingDate)
    throw new Error(
      "Transfer tarihi hesapların takip başlangıcından önce olamaz.",
    );
  const exists = data.accountTransfers?.some((t) => t.id === transfer.id);
  return {
    ...data,
    accountTransfers: exists
      ? data.accountTransfers!.map((t) => (t.id === transfer.id ? transfer : t))
      : [...(data.accountTransfers ?? []), transfer],
  };
}
/** Both currency legs and the fixed historical quote live in one atomic document update. */
export function saveExchange(
  data: BudgetData,
  transfer: AccountTransfer,
): BudgetData {
  const from = data.financialAccounts?.find((a) => a.id === transfer.fromId),
    to = data.financialAccounts?.find((a) => a.id === transfer.toId);
  if (
    !from ||
    !to ||
    from.archived ||
    to.archived ||
    from.kind === "investment" ||
    to.kind === "investment" ||
    !validExchange(transfer, from, to) ||
    !moneyValid(transfer.amount, false, transfer.currency) ||
    !dateValid(transfer.date) ||
    (transfer.time !== undefined && !validTime(transfer.time)) ||
    transfer.date < from.openingDate ||
    transfer.date < to.openingDate ||
    typeof transfer.note !== "string" ||
    transfer.note.length > 300
  )
    throw new Error(
      "Farklı para birimlerinde iki aktif nakit/banka hesabı, geçerli tutar, tarih ve kur seç.",
    );
  const exists = data.accountTransfers?.some((t) => t.id === transfer.id);
  return {
    ...data,
    accountTransfers: exists
      ? data.accountTransfers!.map((t) => (t.id === transfer.id ? transfer : t))
      : [...(data.accountTransfers ?? []), transfer],
  };
}
export function deleteTransfer(data: BudgetData, id: string): BudgetData {
  const transfer = data.accountTransfers?.find((t) => t.id === id);
  if (!transfer) throw new Error("Transfer bulunamadı.");
  if (
    data.financialAccounts?.some(
      (a) => a.archived && (a.id === transfer.fromId || a.id === transfer.toId),
    )
  )
    throw new Error("Transferi silmeden önce bağlı hesapları arşivden çıkar.");
  return {
    ...data,
    accountTransfers: (data.accountTransfers ?? []).filter((t) => t.id !== id),
  };
}
export function validFinanceData(data: BudgetData) {
  if (
    [data.financialAccounts, data.accountTransfers, data.paymentPlans].some(
      (v) => v !== undefined && !Array.isArray(v),
    )
  )
    return false;
  const accounts = data.financialAccounts ?? [],
    transfers = data.accountTransfers ?? [],
    plans = data.paymentPlans ?? [];
  if (
    !Array.isArray(accounts) ||
    accounts.length > 100 ||
    !unique(accounts) ||
    !Array.isArray(transfers) ||
    transfers.length > 10000 ||
    !unique(transfers) ||
    !Array.isArray(plans) ||
    plans.length > 200 ||
    !unique(plans)
  )
    return false;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const a of accounts) {
    if (
      !["cash", "bank", "card", "investment"].includes(a.kind) ||
      typeof a.name !== "string" ||
      !a.name.trim() ||
      a.name.length > 80 ||
      !currencyValid(a.currency) ||
      !moneyValid(a.openingBalance, true, a.currency) ||
      !dateValid(a.openingDate) ||
      typeof a.archived !== "boolean"
    )
      return false;
    if (
      a.kind === "card" &&
      (!moneyValid(a.creditLimit, false, a.currency) ||
        !Number.isInteger(a.statementDay) ||
        a.statementDay! < 1 ||
        a.statementDay! > 31 ||
        !Number.isInteger(a.paymentDay) ||
        a.paymentDay! < 1 ||
        a.paymentDay! > 31)
    )
      return false;
  }
  for (const t of transfers) {
    const f = byId.get(t.fromId),
      to = byId.get(t.toId);
    if (
      !f ||
      !to ||
      f.id === to.id ||
      (t.exchange !== undefined
        ? !validExchange(t, f, to)
        : f.currency !== to.currency) ||
      t.currency !== f.currency ||
      !moneyValid(t.amount, false, t.currency ?? "TRY") ||
      !dateValid(t.date) ||
      (t.time !== undefined && !validTime(t.time)) ||
      t.date < f.openingDate ||
      t.date < to.openingDate ||
      typeof t.note !== "string" ||
      t.note.length > 300
    )
      return false;
  }
  for (const p of plans) {
    const a = p.accountId ? byId.get(p.accountId) : undefined;
    if (
      typeof p.title !== "string" ||
      !p.title.trim() ||
      p.title.length > 80 ||
      !["once", "monthly", "installment"].includes(p.kind) ||
      !["income", "expense"].includes(p.type) ||
      !currencyValid(p.currency) ||
      !moneyValid(p.amount, false, p.currency) ||
      !dateValid(p.startDate) ||
      typeof p.archived !== "boolean" ||
      !data.categories.some(
        (c) => c.id === p.categoryId && c.type === p.type,
      ) ||
      (p.accountId !== undefined &&
        (!a || a.currency !== p.currency || p.startDate < a.openingDate))
    )
      return false;
    if (
      (p.kind !== "monthly" && p.endDate !== undefined) ||
      (p.kind !== "installment" && p.count !== undefined)
    )
      return false;
    if (
      p.endDate !== undefined &&
      (!dateValid(p.endDate) || p.endDate < p.startDate)
    )
      return false;
    if (
      p.kind === "installment" &&
      (!a ||
        (a.kind !== "card" && a.kind !== "investment") ||
        p.type !== "expense" ||
        !Number.isInteger(p.count) ||
        p.count! < 2 ||
        p.count! > 120 ||
        cents(p.amount, p.currency) < p.count!)
    )
      return false;
  }
  const seen = new Set<string>();
  for (const t of data.transactions) {
    if (t.accountId !== undefined) {
      const a = byId.get(t.accountId);
      if (
        !a ||
        a.currency !== (t.currency ?? "TRY") ||
        t.date < a.openingDate ||
        !moneyValid(t.amount, false, t.currency ?? "TRY")
      )
        return false;
    }
    if (t.planId !== undefined || t.planIndex !== undefined) {
      const p = plans.find((p) => p.id === t.planId),
        i = t.planIndex;
      if (
        !p ||
        !Number.isInteger(i) ||
        i! < 0 ||
        i! > 1199 ||
        i! >=
          (p.kind === "once"
            ? 1
            : p.kind === "installment"
              ? p.count!
              : 1200) ||
        p.type !== t.type ||
        p.currency !== (t.currency ?? "TRY") ||
        (p.endDate && occurrenceDate(p, i!) > p.endDate) ||
        (p.kind === "installment" && p.accountId !== t.accountId)
      )
        return false;
      const key = `${p.id}:${i}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  for (const a of accounts)
    if (
      a.archived &&
      (accountBalance(data, a, "9999-12-31") !== 0 ||
        plans.some((p) => p.accountId === a.id && !p.archived))
    )
      return false;
  return true;
}
