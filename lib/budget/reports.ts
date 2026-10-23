import { budgetTransactions } from "./account-scope";
import { currencyScale, minorUnits } from "./currency";
import { type BudgetData, type Transaction, shiftMonth } from "./model";
import { accountBalance, paymentOccurrences } from "./finance";

const cents = (n: number) => Math.round(n * 100);
const round = (n: number) => Math.round(n * 100) / 100;
export const monthEnd = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
};
const dayInMonth = (month: string, day: number) =>
  `${month}-${String(Math.min(day, Number(monthEnd(month).slice(8)))).padStart(2, "0")}`;
export const percentChange = (current: number, previous: number) =>
  previous === 0
    ? null
    : round(((current - previous) / Math.abs(previous)) * 100);
const totals = (rows: Transaction[]) => {
  let income = 0,
    expense = 0;
  for (const t of rows) {
    if (t.type === "income") income += cents(t.baseAmount ?? t.amount);
    else expense += cents(t.baseAmount ?? t.amount);
  }
  return {
    income: income / 100,
    expense: expense / 100,
    net: (income - expense) / 100,
    savingsRate: income > 0 ? round(((income - expense) / income) * 100) : null,
  };
};
export function monthReport(
  data: BudgetData,
  month: string,
  asOf: string,
  matched = true,
) {
  const transactions = budgetTransactions(data);
  const previousMonth = shiftMonth(month, -1);
  const partial = month === asOf.slice(0, 7) && asOf < monthEnd(month);
  const currentEnd =
    month > asOf.slice(0, 7)
      ? ""
      : month === asOf.slice(0, 7)
        ? asOf
        : monthEnd(month);
  const previousEnd =
    partial && matched
      ? dayInMonth(previousMonth, Number(asOf.slice(8)))
      : monthEnd(previousMonth);
  const rows = transactions.filter(
    (t) => t.date.startsWith(month + "-") && t.date <= currentEnd,
  );
  const previousRows = transactions.filter(
    (t) =>
      t.date.startsWith(previousMonth + "-") &&
      t.date <= previousEnd &&
      t.date <= asOf,
  );
  const current = totals(rows),
    previous = totals(previousRows);
  const months = Array.from({ length: 6 }, (_, i) => {
    const key = shiftMonth(month, i - 5);
    return {
      key,
      ...totals(
        transactions.filter(
          (t) => t.date.startsWith(key + "-") && t.date <= asOf,
        ),
      ),
    };
  });
  const categories = data.categories
    .filter((c) => c.type === "expense")
    .map((category) => {
      const spent = totals(
        rows.filter((t) => t.categoryId === category.id),
      ).expense;
      const previousSpent = totals(
        previousRows.filter((t) => t.categoryId === category.id),
      ).expense;
      const history = months.map((m) => ({
        month: m.key,
        amount: totals(
          transactions.filter(
            (t) =>
              t.type === "expense" &&
              t.categoryId === category.id &&
              t.date.startsWith(m.key + "-") &&
              t.date <= asOf,
          ),
        ).expense,
      }));
      const average = round(
        history.slice(2, 5).reduce((sum, h) => sum + h.amount, 0) / 3,
      );
      return {
        ...category,
        spent,
        previousSpent,
        change: round(spent - previousSpent),
        percent: percentChange(spent, previousSpent),
        share: current.expense ? round((spent / current.expense) * 100) : 0,
        average,
        history,
      };
    })
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name, "tr"));
  return {
    current,
    previous,
    months,
    categories,
    currentEnd,
    previousEnd,
    previousMonth,
    partial,
    changes: {
      income: percentChange(current.income, previous.income),
      expense: percentChange(current.expense, previous.expense),
      net: round(current.net - previous.net),
    },
  };
}

export type BudgetAlert = {
  categoryId: string;
  name: string;
  spent: number;
  limit: number;
  remaining: number;
  ratio: number | null;
  projected: number | null;
  status: "over" | "near" | "risk";
};
export function budgetAlerts(
  data: BudgetData,
  month: string,
  asOf: string,
): BudgetAlert[] {
  if (month > asOf.slice(0, 7)) return [];
  const summary = monthReport(data, month, asOf);
  const isCurrent = month === asOf.slice(0, 7);
  const elapsed = Number(asOf.slice(8)),
    days = Number(monthEnd(month).slice(8));
  return summary.categories
    .flatMap((c) => {
      const limit = data.budgets[month]?.[c.id];
      if (limit === undefined) return [];
      const projected =
        isCurrent && elapsed >= 7 && elapsed < days && c.spent > 0
          ? round((c.spent / elapsed) * days)
          : null;
      const status =
        c.spent > limit
          ? "over"
          : c.spent > 0 && c.spent >= limit * 0.8
            ? "near"
            : projected !== null && projected > limit
              ? "risk"
              : null;
      return status
        ? [
            {
              categoryId: c.id,
              name: c.name,
              spent: c.spent,
              limit,
              remaining: round(limit - c.spent),
              ratio: limit > 0 ? c.spent / limit : null,
              projected,
              status,
            } satisfies BudgetAlert,
          ]
        : [];
    })
    .sort(
      (a, b) =>
        ["over", "near", "risk"].indexOf(a.status) -
          ["over", "near", "risk"].indexOf(b.status) || b.spent - a.spent,
    );
}

export type ForecastEvent = {
  date: string;
  title: string;
  amount: number;
  currency: string;
  type: "income" | "expense" | "opening";
  source: "plan" | "recorded" | "opening" | "overdue";
  accountId?: string;
};
export function nextMonthForecast(
  data: BudgetData,
  asOf: string,
  includeOverdue = false,
) {
  const transactions = budgetTransactions(data);
  const currentMonth = asOf.slice(0, 7),
    nextMonth = shiftMonth(currentMonth, 1);
  const currentEnd = monthEnd(currentMonth),
    end = monthEnd(nextMonth);
  const accounts = (data.financialAccounts ?? []).filter(
    (a) => !a.archived && a.kind !== "investment",
  );
  const currencies = new Set(accounts.map((a) => a.currency));
  const events: ForecastEvent[] = [];
  for (const account of accounts)
    if (account.openingDate > asOf && account.openingDate <= end)
      events.push({
        date: account.openingDate,
        title: `${account.name} açılışı`,
        amount: account.openingBalance,
        currency: account.currency,
        type: "opening",
        source: "opening",
        accountId: account.id,
      });
  for (const t of transactions)
    if (
      t.accountId &&
      accounts.some((a) => a.id === t.accountId) &&
      t.date > asOf &&
      t.date <= end
    )
      events.push({
        date: t.date,
        title: t.description || "Tarihli kayıt",
        amount: t.amount,
        currency: t.currency ?? "TRY",
        type: t.type,
        source: "recorded",
        accountId: t.accountId,
      });
  const all = paymentOccurrences(data, "0001-01-01", end).filter(
    (o) => !o.transaction,
  );
  const overdue = all.filter((o) => o.date < asOf);
  for (const o of all) {
    if (o.date < asOf && !includeOverdue) continue;
    events.push({
      date: o.date < asOf ? asOf : o.date,
      title: o.plan.title,
      amount: o.amount,
      currency: o.plan.currency,
      type: o.plan.type,
      source: o.date < asOf ? "overdue" : "plan",
      accountId: o.plan.accountId,
    });
  }
  for (const e of events) currencies.add(e.currency);
  for (const o of overdue) currencies.add(o.plan.currency);
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "tr"),
  );
  const rows = [...currencies].sort().map((currency) => {
    const scale = currencyScale(currency);
    const cents = (value: number) => minorUnits(value, currency);
    const own = accounts.filter((a) => a.currency === currency);
    const cash = own
      .filter((a) => a.kind !== "card")
      .reduce((n, a) => n + cents(accountBalance(data, a, asOf)), 0);
    const cards = own
      .filter((a) => a.kind === "card")
      .reduce((n, a) => n + cents(accountBalance(data, a, asOf)), 0);
    const start = cash + cards;
    let running = start,
      thisEnd = start,
      income = 0,
      expense = 0,
      low = start,
      lowDate = asOf,
      nextOpening = 0;
    const daily = [{ date: asOf, balance: start / scale }];
    const relevant = events.filter((e) => e.currency === currency);
    const dates = [...new Set(relevant.map((e) => e.date))];
    for (const date of dates) {
      for (const e of relevant.filter((e) => e.date === date)) {
        const signed =
          e.type === "expense" ? -cents(e.amount) : cents(e.amount);
        running += signed;
        if (date <= currentEnd) thisEnd += signed;
        else if (e.type === "income") income += cents(e.amount);
        else if (e.type === "expense") expense += cents(e.amount);
        else nextOpening += signed;
      }
      daily.push({ date, balance: running / scale });
      if (running < low) {
        low = running;
        lowDate = date;
      }
    }
    if (daily[daily.length - 1].date !== end)
      daily.push({ date: end, balance: running / scale });
    return {
      currency,
      cash: cash / scale,
      cards: cards / scale,
      current: start / scale,
      thisMonthEnd: thisEnd / scale,
      income: income / scale,
      expense: expense / scale,
      openingAdjustments: nextOpening / scale,
      nextMonthEnd: running / scale,
      lowest: low / scale,
      lowestDate: lowDate,
      daily,
      unassignedPlans: relevant.filter((e) => !e.accountId).length,
      overdueIncome:
        overdue
          .filter(
            (o) => o.plan.currency === currency && o.plan.type === "income",
          )
          .reduce((n, o) => n + cents(o.amount), 0) / scale,
      overdueExpense:
        overdue
          .filter(
            (o) => o.plan.currency === currency && o.plan.type === "expense",
          )
          .reduce((n, o) => n + cents(o.amount), 0) / scale,
    };
  });
  return {
    asOf,
    currentMonth,
    nextMonth,
    currentEnd,
    end,
    rows,
    events,
    hasAccounts: accounts.length > 0,
    unassignedTransactions: transactions.filter(
      (t) => !t.accountId && t.date <= asOf,
    ).length,
  };
}

/** A report export, not a budget backup/import format. */
export function exportReportCSV(
  data: BudgetData,
  month: string,
  asOf: string,
  matched = true,
) {
  const r = monthReport(data, month, asOf, matched);
  const rows: (string | number)[][] = [
    ["Bütçe Takip · Aylık rapor", "TRY"],
    ["Rapor tarihi", asOf],
    ["Seçili dönem", `${month}-01`, r.currentEnd || "Henüz başlamadı"],
    ["Karşılaştırma dönemi", `${r.previousMonth}-01`, r.previousEnd],
    ["Kalem", "Seçili dönem (TRY)", "Önceki dönem (TRY)"],
    ["Gelir", r.current.income, r.previous.income],
    ["Gider", r.current.expense, r.previous.expense],
    ["Net", r.current.net, r.previous.net],
    [
      "Tasarruf oranı (%)",
      r.current.savingsRate ?? "Hesaplanamadı",
      r.previous.savingsRate ?? "Hesaplanamadı",
    ],
    [],
    [
      "Kategori",
      "Harcama (TRY)",
      "Önceki harcama (TRY)",
      "Fark (TRY)",
      "Değişim (%)",
      "Pay (%)",
      "Aylık limit (TRY)",
    ],
    ...r.categories.map((c) => [
      c.name,
      c.spent,
      c.previousSpent,
      c.change,
      c.percent ?? "Önceki tutar sıfır",
      c.share,
      data.budgets[month]?.[c.id] ?? "Limit yok",
    ]),
    [],
    ["Takvim ayı", "Gelir (TRY)", "Gider (TRY)", "Net (TRY)"],
    ...r.months.map((m) => [m.key, m.income, m.expense, m.net]),
    [],
    [
      "Günlük tarih",
      "Gelir (TRY)",
      "Gider (TRY)",
      "Net (TRY)",
      "İşlem sayısı",
      "Durum",
    ],
    ...dailyMonthReport(data, month, asOf).rows.map((day) => [
      day.date,
      day.future ? "" : day.income,
      day.future ? "" : day.expense,
      day.future ? "" : day.net,
      day.future ? "" : day.count,
      day.future ? "Henüz gelmedi" : "Gerçekleşen kayıtlar",
    ]),
    [
      "Not",
      "Devam eden ay eksiktir. Döviz işlemleri kayıtlı TRY karşılığıyladır. Bu rapor tam veri yedeği değildir.",
    ],
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text =
              typeof value === "number"
                ? String(value).replace(".", ",")
                : value;
            if (
              typeof value === "string" &&
              /^[=+\-@\t\r]/.test(value.trimStart())
            )
              text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
          })
          .join(";"),
      )
      .join("\r\n")
  );
}

/** Realized income/expenses only; every calendar day is present, including zero days. */
export function dailyMonthReport(
  data: BudgetData,
  month: string,
  asOf: string,
) {
  const transactions = budgetTransactions(data);
  const days = Number(monthEnd(month).slice(8));
  const rows = Array.from({ length: days }, (_, index) => ({
    date: `${month}-${String(index + 1).padStart(2, "0")}`,
    income: 0,
    expense: 0,
    net: 0,
    count: 0,
    future: `${month}-${String(index + 1).padStart(2, "0")}` > asOf,
  }));
  for (const t of transactions) {
    if (!t.date.startsWith(month + "-") || t.date > asOf) continue;
    const row = rows[Number(t.date.slice(8)) - 1];
    if (!row) continue;
    row[t.type] += cents(t.baseAmount ?? t.amount);
    row.count++;
  }
  for (const row of rows) {
    row.income /= 100;
    row.expense /= 100;
    row.net = round(row.income - row.expense);
  }
  return {
    rows,
    totals: totals(
      transactions.filter(
        (t) => t.date.startsWith(month + "-") && t.date <= asOf,
      ),
    ),
  };
}
