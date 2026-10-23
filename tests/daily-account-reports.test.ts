import { describe, expect, it } from "vitest";
import { emptyData, type Transaction } from "../lib/budget/model";
import { dailyMonthReport, exportReportCSV } from "../lib/budget/reports";
import { accountMonthActivity } from "../lib/budget/account-activity";
import type { FinancialAccount } from "../lib/budget/finance";
const bank: FinancialAccount = {
  id: "bank",
  name: "Banka",
  kind: "bank",
  currency: "TRY",
  openingDate: "2026-09-01",
  openingBalance: 1000,
  archived: false,
};
const card: FinancialAccount = {
  ...bank,
  id: "card",
  kind: "card",
  openingBalance: -100,
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
const data = () => ({ ...emptyData(), financialAccounts: [bank, card] });
const asOf = "2026-10-23";
describe("daily realized month table", () => {
  it("includes every day and marks future days separately from zero-activity days", () => {
    const report = dailyMonthReport(data(), "2026-10", asOf);
    expect(report.rows).toHaveLength(31);
    expect(report.rows[0]).toMatchObject({
      date: "2026-10-01",
      income: 0,
      expense: 0,
      count: 0,
      future: false,
    });
    expect(report.rows[23].future).toBe(true);
    expect(report.rows[22].future).toBe(false);
  });
  it("handles short months, leap years and year rollover", () => {
    expect(dailyMonthReport(data(), "2028-02", "2028-03-01").rows).toHaveLength(
      29,
    );
    expect(dailyMonthReport(data(), "2027-02", "2027-03-01").rows).toHaveLength(
      28,
    );
    expect(
      dailyMonthReport(data(), "2026-12", "2027-01-01").rows.at(-1)?.date,
    ).toBe("2026-12-31");
  });
  it("sums income and expense for each date regardless of time, with a matching monthly total", () => {
    const d = data();
    d.transactions = [
      tx("a", "2026-10-03", 30, {
        type: "income",
        categoryId: "salary",
        time: "09:00",
      }),
      tx("b", "2026-10-03", 10, { time: "18:00" }),
      tx("c", "2026-10-04", 5),
    ];
    const r = dailyMonthReport(d, "2026-10", asOf);
    expect(r.rows[2]).toMatchObject({
      income: 30,
      expense: 10,
      net: 20,
      count: 2,
    });
    expect(r.totals).toMatchObject({ income: 30, expense: 15, net: 15 });
  });
  it("uses the fixed TRY snapshot for OMR and includes unassigned transactions", () => {
    const d = data();
    d.transactions = [
      tx("omr", "2026-10-01", 2.751, { currency: "OMR", baseAmount: 277.85 }),
      tx("plain", "2026-10-01", 1),
    ];
    expect(dailyMonthReport(d, "2026-10", asOf).rows[0].expense).toBe(278.85);
  });
  it("ignores other months and future records, with no transfer/opening double counting", () => {
    const d = data();
    d.transactions = [
      tx("other", "2026-09-01", 100),
      tx("future", "2026-10-30", 100),
    ];
    d.accountTransfers = [
      {
        id: "t",
        fromId: "bank",
        toId: "card",
        amount: 200,
        currency: "TRY",
        date: "2026-10-02",
        note: "",
      },
    ];
    expect(dailyMonthReport(d, "2026-10", asOf).totals.expense).toBe(0);
  });
  it("uses exact cents and exports the whole daily table with future blanks", () => {
    const d = data();
    d.transactions = [tx("a", "2026-10-01", 0.1), tx("b", "2026-10-01", 0.2)];
    expect(dailyMonthReport(d, "2026-10", asOf).rows[0].expense).toBe(0.3);
    const csv = exportReportCSV(d, "2026-10", asOf);
    expect(csv).toContain('"Günlük tarih"');
    expect(csv).toContain('"2026-10-24";"";"";"";"";"Henüz gelmedi"');
  });
});
describe("monthly account activity", () => {
  it("shows only assigned transactions in the chosen account and month", () => {
    const d = data();
    d.transactions = [
      tx("mine", "2026-10-01", 20, { accountId: "bank" }),
      tx("other", "2026-10-01", 200, { accountId: "card" }),
      tx("legacy", "2026-10-01", 100),
      tx("future", "2026-10-30", 50, { accountId: "bank" }),
    ];
    const r = accountMonthActivity(d, bank, "2026-10", asOf);
    expect(r.transactions.map((t) => t.id)).toEqual(["mine"]);
    expect(r.expense).toBe(20);
    expect(r.closing).toBe(980);
  });
  it("keeps transfers separate and reconciles opening, income, expense and closing", () => {
    const d = data();
    d.transactions = [
      tx("prev", "2026-09-05", 50, { accountId: "bank" }),
      tx("salary", "2026-10-01", 300, {
        accountId: "bank",
        type: "income",
        categoryId: "salary",
      }),
      tx("spend", "2026-10-02", 100, { accountId: "bank" }),
    ];
    d.accountTransfers = [
      {
        id: "out",
        fromId: "bank",
        toId: "card",
        amount: 200,
        currency: "TRY",
        date: "2026-10-03",
        note: "Kart ödemesi",
      },
      {
        id: "in",
        fromId: "card",
        toId: "bank",
        amount: 10,
        currency: "TRY",
        date: "2026-10-04",
        note: "",
      },
    ];
    const r = accountMonthActivity(d, bank, "2026-10", asOf);
    expect(r).toMatchObject({
      opening: 950,
      income: 300,
      expense: 100,
      net: 200,
      transferIn: 10,
      transferOut: 200,
      closing: 960,
    });
  });
  it("explains a mid-month opening as a balance adjustment rather than income", () => {
    const d = data();
    const a = { ...bank, openingDate: "2026-10-10", openingBalance: 500 };
    d.financialAccounts = [a];
    d.transactions = [tx("spend", "2026-10-11", 10, { accountId: "bank" })];
    const r = accountMonthActivity(d, a, "2026-10", asOf);
    expect(r).toMatchObject({
      opening: 0,
      openingAdjustment: 500,
      income: 0,
      expense: 10,
      closing: 490,
    });
  });
  it("preserves OMR baisa and uses original OMR amounts rather than TRY snapshots", () => {
    const a = { ...bank, currency: "OMR", openingBalance: 10.005 };
    const d = data();
    d.financialAccounts = [a];
    d.transactions = [
      tx("omr", "2026-10-01", 2.751, {
        accountId: "bank",
        currency: "OMR",
        baseAmount: 277.85,
      }),
    ];
    expect(accountMonthActivity(d, a, "2026-10", asOf)).toMatchObject({
      opening: 10.005,
      expense: 2.751,
      closing: 7.254,
    });
  });
  it("sorts transactions by date and time newest first", () => {
    const d = data();
    d.transactions = [
      tx("early", "2026-10-01", 10, { accountId: "bank", time: "09:00" }),
      tx("unknown", "2026-10-01", 10, { accountId: "bank" }),
      tx("late", "2026-10-01", 10, { accountId: "bank", time: "18:00" }),
    ];
    expect(
      accountMonthActivity(d, bank, "2026-10", asOf).transactions.map(
        (t) => t.id,
      ),
    ).toEqual(["late", "early", "unknown"]);
  });
  it("shows archived account history and excludes pending plans", () => {
    const d = data();
    d.paymentPlans = [
      {
        id: "plan",
        title: "Bekliyor",
        kind: "once",
        type: "expense",
        amount: 100,
        currency: "TRY",
        categoryId: "market",
        accountId: "bank",
        startDate: "2026-10-01",
        archived: false,
      },
    ];
    expect(
      accountMonthActivity(d, { ...bank, archived: true }, "2026-10", asOf)
        .transactions,
    ).toHaveLength(0);
  });
  it("does not mutate documents when reading daily and account reports", () => {
    const d = data(),
      before = structuredClone(d);
    dailyMonthReport(d, "2026-10", asOf);
    accountMonthActivity(d, bank, "2026-10", asOf);
    expect(d).toEqual(before);
  });
});
