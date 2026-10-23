import { describe, expect, it } from "vitest";
import {
  emptyData,
  summarize,
  trend,
  insights,
  validateData,
  type Transaction,
} from "../lib/budget/model";
import {
  accountBalance,
  saveFinancialAccount,
  saveTransfer,
  saveExchange,
  paymentOccurrences,
  pendingInstallments,
  type FinancialAccount,
  type PaymentPlan,
} from "../lib/budget/finance";
import {
  nextMonthForecast,
  monthReport,
  dailyMonthReport,
  budgetAlerts,
  exportReportCSV,
} from "../lib/budget/reports";
import { savingsSummary } from "../lib/budget/savings";
import { filterActivity } from "../lib/budget/activity";
import { buildManualExchange } from "../lib/budget/exchange";
import { validInvestmentChanges } from "../server/budget/investments";
const date = "2026-10-23";
const bank: FinancialAccount = {
  id: "bank",
  name: "Bank",
  kind: "bank",
  currency: "TRY",
  openingBalance: 1000,
  openingDate: "2026-09-01",
  archived: false,
};
const investment: FinancialAccount = {
  ...bank,
  id: "invest",
  name: "Invest",
  kind: "investment",
  openingBalance: 10000,
};
const tx = (id: string, amount: number, accountId = "bank"): Transaction => ({
  id,
  amount,
  accountId,
  date: "2026-10-01",
  type: "expense",
  categoryId: "market",
  description: id,
});
const plan: PaymentPlan = {
  id: "plan",
  title: "Recurring",
  kind: "monthly",
  type: "expense",
  currency: "TRY",
  amount: 50,
  categoryId: "market",
  accountId: "invest",
  startDate: "2026-10-25",
  archived: false,
};
function data() {
  const d = emptyData();
  d.financialAccounts = [bank];
  d.transactions = [tx("real", 100)];
  d.budgets = { "2026-10": { market: 200 } };
  d.savingsGoals = { "2026-10": 100 };
  return d;
}
function withInvestment() {
  const d = data();
  d.financialAccounts!.push(investment);
  d.transactions.push(
    tx("invest-expense", 1000, "invest"),
    {
      ...tx("invest-income", 10000, "invest"),
      type: "income",
      categoryId: "salary",
    },
    { ...tx("invest-future", 1000, "invest"), date: "2026-11-01" },
  );
  d.paymentPlans = [plan];
  return d;
}
describe("investment account scope", () => {
  it("stores investment accounts and preserves their own balance outside budget totals", () => {
    const d = withInvestment();
    expect(validateData(d)).toBe(true);
    expect(accountBalance(d, investment, date)).toBe(19000);
    expect(summarize(d, "2026-10")).toEqual(summarize(data(), "2026-10"));
  });
  it("excludes investment history from all reports, trends, alerts, savings and report CSV", () => {
    const d = withInvestment(),
      base = data();
    expect(monthReport(d, "2026-10", date)).toEqual(
      monthReport(base, "2026-10", date),
    );
    expect(dailyMonthReport(d, "2026-10", date)).toEqual(
      dailyMonthReport(base, "2026-10", date),
    );
    expect(trend(d, "2026-10")).toEqual(trend(base, "2026-10"));
    expect(insights(d, "2026-10")).toEqual(insights(base, "2026-10"));
    expect(budgetAlerts(d, "2026-10", date)).toEqual(
      budgetAlerts(base, "2026-10", date),
    );
    expect(savingsSummary(d, "2026-10")).toEqual(
      savingsSummary(base, "2026-10"),
    );
    expect(exportReportCSV(d, "2026-10", date)).toBe(
      exportReportCSV(base, "2026-10", date),
    );
  });
  it("excludes investment openings, balances, currencies, future transactions and plans from forecast", () => {
    const d = withInvestment();
    d.financialAccounts!.push({
      ...investment,
      id: "usd",
      currency: "USD",
      openingDate: "2026-11-01",
      openingBalance: 50000,
    });
    expect(nextMonthForecast(d, date, true)).toEqual(
      nextMonthForecast(data(), date, true),
    );
    expect(paymentOccurrences(d, "2026-10-01", "2026-12-31")).toEqual([]);
  });
  it("does not treat investment-only accounts as operating forecast accounts", () => {
    const d = emptyData();
    d.financialAccounts = [investment];
    expect(nextMonthForecast(d, date)).toMatchObject({
      hasAccounts: false,
      rows: [],
      events: [],
    });
  });
  it("funding reduces the source balance but is neither income nor expense", () => {
    let d = data();
    d.financialAccounts!.push(investment);
    d = saveTransfer(d, {
      id: "fund",
      fromId: "bank",
      toId: "invest",
      amount: 200,
      currency: "TRY",
      date,
      note: "Investment funding",
    });
    expect(accountBalance(d, bank, date)).toBe(700);
    expect(accountBalance(d, investment, date)).toBe(10200);
    expect(summarize(d, "2026-10")).toMatchObject({ income: 0, expense: 100 });
    expect(nextMonthForecast(d, date).rows[0].current).toBe(700);
    expect(filterActivity(d, "2026-10", "transfer").transfers).toHaveLength(1);
  });
  it("allows a transfer back without counting the returned principal as income", () => {
    let d = data();
    d.financialAccounts!.push(investment);
    d = saveTransfer(d, {
      id: "return",
      fromId: "invest",
      toId: "bank",
      amount: 500,
      currency: "TRY",
      date,
      note: "Return",
    });
    expect(accountBalance(d, bank, date)).toBe(1400);
    expect(accountBalance(d, investment, date)).toBe(9500);
    expect(nextMonthForecast(d, date).rows[0].current).toBe(1400);
    expect(summarize(d, "2026-10").income).toBe(0);
  });
  it("reclassifies a used bank account into investment and back without altering records or balance", () => {
    const d = data();
    const converted = saveFinancialAccount(d, { ...bank, kind: "investment" });
    expect(converted.transactions).toEqual(d.transactions);
    expect(
      accountBalance(converted, converted.financialAccounts![0], date),
    ).toBe(900);
    expect(summarize(converted, "2026-10").expense).toBe(0);
    expect(filterActivity(converted, "2026-10").transactions).toHaveLength(0);
    expect(validInvestmentChanges(d, converted)).toBe(true);
    const restored = saveFinancialAccount(converted, bank);
    expect(restored).toEqual(d);
  });
  it.each(["cash", "bank", "card", "investment"] as const)(
    "allows account type %s on a used account while retaining its currency and signed balance",
    (kind) => {
      const d = data();
      const a = {
        ...bank,
        kind,
        ...(kind === "card"
          ? { creditLimit: 5000, statementDay: 15, paymentDay: 25 }
          : {}),
      };
      const changed = saveFinancialAccount(d, a);
      expect(validateData(changed)).toBe(true);
      expect(changed.financialAccounts![0].kind).toBe(kind);
      expect(accountBalance(changed, a, date)).toBe(900);
      expect(() =>
        saveFinancialAccount(d, { ...a, currency: "USD" }),
      ).toThrow();
    },
  );
  it("suspends existing card installments in investment scope and restores them when returned to card", () => {
    const d = emptyData();
    const card: FinancialAccount = {
      ...bank,
      kind: "card",
      creditLimit: 5000,
      statementDay: 15,
      paymentDay: 25,
    };
    d.financialAccounts = [card];
    d.paymentPlans = [
      {
        ...plan,
        accountId: "bank",
        kind: "installment",
        count: 3,
        startDate: "2026-10-01",
        amount: 300,
      },
    ];
    const converted = saveFinancialAccount(d, { ...card, kind: "investment" });
    expect(validateData(converted)).toBe(true);
    expect(pendingInstallments(converted, "bank")).toBe(0);
    expect(paymentOccurrences(converted, "2026-10-01", "2026-12-31")).toEqual(
      [],
    );
    expect(validInvestmentChanges(d, converted)).toBe(true);
    expect(
      paymentOccurrences(
        saveFinancialAccount(converted, card),
        "2026-10-01",
        "2026-12-31",
      ),
    ).toHaveLength(3);
  });
  it("retains historical FX snapshots on conversion but rejects a new investment FX trade", () => {
    const d = emptyData();
    d.financialAccounts = [
      bank,
      { ...bank, id: "usd", currency: "USD", openingBalance: 100 },
    ];
    const t = {
      id: "fx",
      fromId: "usd",
      toId: "bank",
      amount: 10,
      currency: "USD",
      date,
      note: "FX",
      exchange: buildManualExchange(10, "USD", "TRY", date, 40),
    };
    const saved = saveExchange(d, t);
    const converted = saveFinancialAccount(saved, {
      ...bank,
      kind: "investment",
    });
    expect(validateData(converted)).toBe(true);
    expect(validInvestmentChanges(saved, converted)).toBe(true);
    expect(() => saveExchange(converted, { ...t, id: "new" })).toThrow();
    expect(
      validInvestmentChanges(converted, {
        ...converted,
        accountTransfers: [...converted.accountTransfers!, { ...t, id: "new" }],
      }),
    ).toBe(false);
  });
  it("rejects new direct income/expense and new/reassigned plans on investment accounts", () => {
    const d = data();
    d.financialAccounts!.push(investment);
    expect(
      validInvestmentChanges(d, {
        ...d,
        transactions: [...d.transactions, tx("new", 50, "invest")],
      }),
    ).toBe(false);
    expect(
      validInvestmentChanges(d, {
        ...d,
        transactions: [{ ...d.transactions[0], accountId: "invest" }],
      }),
    ).toBe(false);
    expect(validInvestmentChanges(d, { ...d, paymentPlans: [plan] })).toBe(
      false,
    );
  });
  it("preserves history but prevents changing the money amount or executing an old investment plan", () => {
    const d = withInvestment();
    expect(validInvestmentChanges(d, structuredClone(d))).toBe(true);
    const changed = structuredClone(d);
    changed.transactions.find((t) => t.id === "invest-expense")!.amount = 5;
    expect(validInvestmentChanges(d, changed)).toBe(false);
    const execution = structuredClone(d);
    execution.transactions.push({
      ...tx("paid", 50, "invest"),
      planId: "plan",
      planIndex: 0,
    });
    expect(validInvestmentChanges(d, execution)).toBe(false);
  });
  it("supports a complete investment history backup restored into an empty budget", () => {
    const d = JSON.parse(JSON.stringify(withInvestment()));
    expect(validateData(d)).toBe(true);
    expect(validInvestmentChanges(emptyData(), d)).toBe(true);
  });
});
