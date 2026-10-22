import { describe, expect, it } from "vitest";
import {
  emptyData,
  type BudgetData,
  type Transaction,
} from "../lib/budget/model";
import { type FinancialAccount, type PaymentPlan } from "../lib/budget/finance";
import {
  exportReportCSV,
  budgetAlerts,
  monthEnd,
  monthReport,
  nextMonthForecast,
  percentChange,
} from "../lib/budget/reports";
const bank: FinancialAccount = {
  id: "bank",
  name: "Banka",
  kind: "bank",
  currency: "TRY",
  openingDate: "2026-01-01",
  openingBalance: 10000,
  archived: false,
};
const card: FinancialAccount = {
  ...bank,
  id: "card",
  name: "Kart",
  kind: "card",
  openingBalance: -1000,
  creditLimit: 5000,
  statementDay: 15,
  paymentDay: 25,
};
const tx = (
  id: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id,
  date,
  amount,
  type: "expense",
  categoryId: "market",
  description: id,
  ...extra,
});
const plan = (
  id: string,
  startDate: string,
  amount: number,
  extra: Partial<PaymentPlan> = {},
): PaymentPlan => ({
  id,
  title: id,
  startDate,
  amount,
  kind: "once",
  type: "expense",
  categoryId: "bills",
  currency: "TRY",
  archived: false,
  ...extra,
});
function data(): BudgetData {
  return { ...emptyData(), financialAccounts: [{ ...bank }, { ...card }] };
}
const asOf = "2026-10-23";
describe("next month forecast", () => {
  it("keeps a fresh account entirely empty and never mutates the budget", () => {
    const d = emptyData(),
      before = structuredClone(d);
    expect(nextMonthForecast(d, asOf).rows).toEqual([]);
    expect(d).toEqual(before);
  });
  it("carries this month's remainder into next month's income and expense", () => {
    const d = data();
    d.paymentPlans = [
      plan("oct", "2026-10-25", 500),
      plan("salary", "2026-11-01", 2000, {
        type: "income",
        categoryId: "salary",
      }),
      plan("rent", "2026-11-05", 1000),
    ];
    const r = nextMonthForecast(d, asOf).rows[0];
    expect(r.current).toBe(9000);
    expect(r.thisMonthEnd).toBe(8500);
    expect(r.income).toBe(2000);
    expect(r.expense).toBe(1000);
    expect(r.nextMonthEnd).toBe(9500);
  });
  it("does not count linked recorded installments twice", () => {
    const d = data();
    d.paymentPlans = [
      plan("parts", "2026-10-20", 1000, {
        kind: "installment",
        count: 3,
        accountId: "card",
      }),
    ];
    d.transactions = [
      tx("paid", "2026-10-20", 333.34, {
        accountId: "card",
        planId: "parts",
        planIndex: 0,
      }),
    ];
    const f = nextMonthForecast(d, asOf);
    expect(f.events).toHaveLength(1);
    expect(f.events[0].amount).toBe(333.33);
    expect(f.rows[0].nextMonthEnd).toBe(8333.33);
  });
  it("card payments and internal transfers do not produce a second expense", () => {
    const d = data();
    d.accountTransfers = [
      {
        id: "pay",
        fromId: "bank",
        toId: "card",
        currency: "TRY",
        amount: 700,
        date: "2026-10-22",
        note: "",
      },
    ];
    const r = nextMonthForecast(d, asOf).rows[0];
    expect(r.cash).toBe(9300);
    expect(r.cards).toBe(-300);
    expect(r.nextMonthEnd).toBe(9000);
  });
  it("keeps currencies separate without invented exchange rates", () => {
    const d = data();
    d.financialAccounts!.push({
      ...bank,
      id: "usd",
      currency: "USD",
      openingBalance: 100,
    });
    d.paymentPlans = [
      plan("usd-plan", "2026-11-01", 30, { currency: "USD", accountId: "usd" }),
    ];
    const f = nextMonthForecast(d, asOf);
    expect(f.rows.find((r) => r.currency === "TRY")!.nextMonthEnd).toBe(9000);
    expect(f.rows.find((r) => r.currency === "USD")!.nextMonthEnd).toBe(70);
  });
  it("shows overdue obligations separately and only includes them when selected", () => {
    const d = data();
    d.paymentPlans = [
      plan("late", "2026-10-01", 400),
      plan("late-income", "2026-10-10", 100, {
        type: "income",
        categoryId: "salary",
      }),
    ];
    const r = nextMonthForecast(d, asOf).rows[0];
    expect(r.overdueExpense).toBe(400);
    expect(r.overdueIncome).toBe(100);
    expect(r.nextMonthEnd).toBe(9000);
    const f = nextMonthForecast(d, asOf, true);
    expect(f.rows[0].thisMonthEnd).toBe(8700);
    expect(
      f.events.every((e) => e.date === asOf && e.source === "overdue"),
    ).toBe(true);
  });
  it("includes unprocessed plans due today", () => {
    const d = data();
    d.paymentPlans = [plan("today", asOf, 100)];
    expect(nextMonthForecast(d, asOf).rows[0].nextMonthEnd).toBe(8900);
  });
  it("still shows currencies that only have excluded overdue obligations", () => {
    const d = emptyData();
    d.paymentPlans = [plan("late", "2026-09-01", 35, { currency: "EUR" })];
    const r = nextMonthForecast(d, asOf).rows[0];
    expect(r.currency).toBe("EUR");
    expect(r.nextMonthEnd).toBe(0);
    expect(r.overdueExpense).toBe(35);
  });
  it("does not turn unassigned historic income into a bank balance", () => {
    const d = data();
    d.transactions = [
      tx("legacy", "2026-10-01", 5000, {
        type: "income",
        categoryId: "salary",
      }),
    ];
    const f = nextMonthForecast(d, asOf);
    expect(f.rows[0].current).toBe(9000);
    expect(f.unassignedTransactions).toBe(1);
  });
  it("clearly tracks unassigned future plans in the net estimate", () => {
    const d = data();
    d.paymentPlans = [plan("unassigned", "2026-11-01", 300)];
    const r = nextMonthForecast(d, asOf).rows[0];
    expect(r.unassignedPlans).toBe(1);
    expect(r.nextMonthEnd).toBe(8700);
  });
  it("excludes archived plans and zero archived accounts", () => {
    const d = data();
    d.paymentPlans = [plan("archived", "2026-11-01", 300, { archived: true })];
    d.financialAccounts!.push({
      ...bank,
      id: "closed",
      openingBalance: 0,
      archived: true,
    });
    expect(nextMonthForecast(d, asOf).events).toHaveLength(0);
  });
  it("counts future recorded activity once and not at today's balance", () => {
    const d = data();
    d.paymentPlans = [plan("future", "2026-11-01", 500, { accountId: "bank" })];
    d.transactions = [
      tx("future-booked", "2026-11-02", 450, {
        accountId: "bank",
        planId: "future",
        planIndex: 0,
      }),
    ];
    const f = nextMonthForecast(d, asOf);
    expect(f.events).toHaveLength(1);
    expect(f.events[0].source).toBe("recorded");
    expect(f.rows[0].current).toBe(9000);
    expect(f.rows[0].nextMonthEnd).toBe(8550);
  });
  it("applies accounts starting in next month as opening adjustments", () => {
    const d = emptyData();
    d.financialAccounts = [
      { ...bank, openingDate: "2026-11-01", openingBalance: 500 },
    ];
    const r = nextMonthForecast(d, asOf).rows[0];
    expect(r.current).toBe(0);
    expect(r.thisMonthEnd).toBe(0);
    expect(r.openingAdjustments).toBe(500);
    expect(r.nextMonthEnd).toBe(500);
  });
  it("finds the lowest daily net position, grouping same-day receipts and payments", () => {
    const d = data();
    d.paymentPlans = [
      plan("large", "2026-11-01", 10000),
      plan("recovery", "2026-11-02", 3000, {
        type: "income",
        categoryId: "salary",
      }),
    ];
    const r = nextMonthForecast(d, asOf).rows[0];
    expect(r.lowest).toBe(-1000);
    expect(r.lowestDate).toBe("2026-11-01");
    expect(r.nextMonthEnd).toBe(2000);
    d.paymentPlans[1].startDate = "2026-11-01";
    expect(nextMonthForecast(d, asOf).rows[0].lowest).toBe(2000);
  });
  it("handles year rollover, leap days and month-end recurrence", () => {
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(nextMonthForecast(data(), "2026-12-31").end).toBe("2027-01-31");
    const d = data();
    d.paymentPlans = [plan("monthly", "2026-01-31", 100, { kind: "monthly" })];
    const f = nextMonthForecast(d, "2026-02-01");
    expect(
      f.events.filter((e) => e.source === "plan").map((e) => e.date),
    ).toEqual(["2026-02-28", "2026-03-31"]);
  });
  it("uses exact cents in installment forecasts", () => {
    const d = data();
    d.paymentPlans = [
      plan("tiny", "2026-10-31", 0.05, {
        kind: "installment",
        count: 3,
        accountId: "card",
      }),
    ];
    const f = nextMonthForecast(d, asOf);
    expect(f.rows[0].thisMonthEnd).toBe(8999.98);
    expect(f.rows[0].nextMonthEnd).toBe(8999.96);
  });
});
describe("monthly reports and category trends", () => {
  it("matches the elapsed day and offers full previous month comparison", () => {
    const d = data();
    d.transactions = [
      tx("a", "2026-10-10", 100),
      tx("b", "2026-09-10", 80),
      tx("c", "2026-09-30", 20),
    ];
    const r = monthReport(d, "2026-10", asOf);
    expect(r.current.expense).toBe(100);
    expect(r.previous.expense).toBe(80);
    expect(r.changes.expense).toBe(25);
    expect(monthReport(d, "2026-10", asOf, false).previous.expense).toBe(100);
  });
  it("compares full historical months", () => {
    const d = data();
    d.transactions = [tx("a", "2026-09-30", 100), tx("b", "2026-08-31", 80)];
    expect(monthReport(d, "2026-09", asOf).changes.expense).toBe(25);
  });
  it("clamps the comparison day in shorter preceding months", () => {
    expect(monthReport(data(), "2026-03", "2026-03-30").previousEnd).toBe(
      "2026-02-28",
    );
  });
  it("excludes future-dated transactions from actual reports and budgets", () => {
    const d = data();
    d.transactions = [
      tx("future", "2026-10-30", 500),
      tx("next", "2026-11-02", 200),
    ];
    expect(monthReport(d, "2026-10", asOf).current.expense).toBe(0);
    expect(monthReport(d, "2026-11", asOf).current.expense).toBe(0);
    d.budgets["2026-10"] = { market: 0 };
    expect(budgetAlerts(d, "2026-10", asOf)).toEqual([]);
  });
  it("uses fixed TRY snapshots instead of summing foreign original amounts", () => {
    const d = data();
    d.transactions = [
      tx("fx", "2026-10-10", 10, { currency: "USD", baseAmount: 400 }),
    ];
    const r = monthReport(d, "2026-10", asOf);
    expect(r.current.expense).toBe(400);
    expect(r.categories[0].spent).toBe(400);
  });
  it("handles no previous spend without infinite percentages", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(0, 100)).toBe(-100);
    expect(monthReport(data(), "2026-10", asOf).current.savingsRate).toBeNull();
  });
  it("computes negative savings rate and net delta correctly", () => {
    const d = data();
    d.transactions = [
      tx("salary", "2026-10-01", 100, { type: "income", categoryId: "salary" }),
      tx("e", "2026-10-10", 150),
    ];
    const r = monthReport(d, "2026-10", asOf);
    expect(r.current.savingsRate).toBe(-50);
    expect(r.changes.net).toBe(-50);
  });
  it("category share, comparison and prior three calendar month average remain consistent", () => {
    const d = data();
    d.transactions = [
      tx("jul", "2026-07-01", 300),
      tx("sep", "2026-09-10", 600),
      tx("oct", "2026-10-10", 400),
      tx("bill", "2026-10-10", 600, { categoryId: "bills" }),
    ];
    const r = monthReport(d, "2026-10", asOf),
      c = r.categories.find((c) => c.id === "market")!;
    expect(c.share).toBe(40);
    expect(c.change).toBe(-200);
    expect(c.average).toBe(300);
    expect(c.history.map((h) => h.month)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });
  it("does not include transfers or openings in income/expense", () => {
    const r = monthReport(data(), "2026-10", asOf);
    expect(r.current).toEqual({
      income: 0,
      expense: 0,
      net: 0,
      savingsRate: null,
    });
  });
});
describe("budget notifications", () => {
  it("warns on actual overruns including zero budget", () => {
    const d = data();
    d.budgets["2026-10"] = { market: 0 };
    d.transactions = [tx("e", "2026-10-01", 1)];
    const a = budgetAlerts(d, "2026-10", asOf)[0];
    expect(a.status).toBe("over");
    expect(a.ratio).toBeNull();
    expect(a.remaining).toBe(-1);
  });
  it("does not warn on untouched zero limit or undefined limits", () => {
    const d = data();
    d.budgets["2026-10"] = { market: 0 };
    expect(budgetAlerts(d, "2026-10", asOf)).toEqual([]);
    d.transactions = [tx("bill", "2026-10-01", 1000, { categoryId: "bills" })];
    expect(budgetAlerts(d, "2026-10", asOf)).toEqual([]);
  });
  it("warns at 80 percent and when exactly at limit without calling it overspent", () => {
    const d = data();
    d.budgets["2026-10"] = { market: 100 };
    d.transactions = [tx("e", "2026-10-01", 80)];
    expect(budgetAlerts(d, "2026-10", asOf)[0].status).toBe("near");
    d.transactions[0].amount = 100;
    expect(budgetAlerts(d, "2026-10", asOf)[0].status).toBe("near");
  });
  it("shows pace risk after seven days, without labeling it an actual overrun", () => {
    const d = data();
    d.budgets["2026-10"] = { market: 100 };
    d.transactions = [tx("e", "2026-10-01", 50)];
    expect(budgetAlerts(d, "2026-10", "2026-10-06")).toEqual([]);
    const a = budgetAlerts(d, "2026-10", "2026-10-10")[0];
    expect(a.status).toBe("risk");
    expect(a.projected).toBe(155);
  });
  it("does not extrapolate past months, last day, or future months", () => {
    const d = data();
    d.budgets["2026-09"] = { market: 100 };
    d.transactions = [tx("e", "2026-09-01", 50)];
    expect(budgetAlerts(d, "2026-09", asOf)).toEqual([]);
    d.budgets["2026-10"] = { market: 100 };
    d.transactions = [tx("e", "2026-10-01", 50)];
    expect(budgetAlerts(d, "2026-10", "2026-10-31")).toEqual([]);
    expect(budgetAlerts(d, "2026-11", asOf)).toEqual([]);
  });
  it("recomputes alerts after correcting an expense", () => {
    const d = data();
    d.budgets["2026-10"] = { market: 100 };
    d.transactions = [tx("e", "2026-10-01", 150)];
    expect(budgetAlerts(d, "2026-10", asOf)[0].status).toBe("over");
    d.transactions = [];
    expect(budgetAlerts(d, "2026-10", asOf)).toEqual([]);
  });
});

describe("report CSV", () => {
  it("exports the same comparison periods and fixed TRY amounts as the screen", () => {
    const d = data();
    d.transactions = [
      tx("fx", "2026-10-01", 10, { currency: "USD", baseAmount: 400 }),
    ];
    const csv = exportReportCSV(d, "2026-10", asOf);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"2026-09-23"');
    expect(csv).toContain('"Gider";"400";"0"');
    expect(csv).toContain('"Tasarruf oranı (%)";"Hesaplanamadı"');
    expect(exportReportCSV(d, "2026-10", asOf, false)).toContain(
      '"2026-09-30"',
    );
  });
  it("quotes category separators and neutralizes spreadsheet formula names", () => {
    const d = data();
    d.categories[0] = { ...d.categories[0], name: '=SUM(1;2)"test' };
    const csv = exportReportCSV(d, "2026-10", asOf);
    expect(csv).toContain(`"'=SUM(1;2)""test"`);
  });
});
