import { describe, expect, it } from "vitest";
import { emptyData, validateData, summarize } from "../lib/budget/model";
import {
  accountBalance,
  saveFinancialAccount,
  saveTransfer,
  type FinancialAccount,
} from "../lib/budget/finance";
import {
  saveInvestmentPosition,
  saveInvestmentEntry,
  deleteInvestmentEntry,
  positionSummary,
  portfolioAccountSummary,
  type InvestmentPosition,
  type InvestmentEntry,
} from "../lib/budget/investment-portfolio";
import { accountMonthActivity } from "../lib/budget/account-activity";
import { nextMonthForecast, monthReport } from "../lib/budget/reports";
const date = "2026-10-24";
const account: FinancialAccount = {
  id: "invest",
  name: "Invest",
  kind: "investment",
  currency: "TRY",
  openingBalance: 1000,
  openingDate: "2026-10-01",
  archived: false,
};
const p: InvestmentPosition = {
  id: "stock",
  accountId: "invest",
  currency: "TRY",
  name: "Synthetic stock",
  kind: "stock",
  startDate: "2026-10-01",
  archived: false,
};
const entry = (
  id: string,
  type: InvestmentEntry["type"],
  amount: number,
  day = "2026-10-02",
  time = "12:00",
): InvestmentEntry => ({
  id,
  positionId: "stock",
  type,
  amount,
  date: day,
  time,
  note: id,
});
function data() {
  const d = emptyData();
  d.financialAccounts = [
    account,
    { ...account, id: "bank", name: "Bank", kind: "bank", openingBalance: 500 },
  ];
  return saveInvestmentPosition(
    d,
    p,
    entry("initial", "allocate", 600, "2026-10-01"),
  );
}
const summary = (d: ReturnType<typeof data>, month = "2026-10") =>
  portfolioAccountSummary(
    d,
    account,
    accountBalance(d, account, date),
    date,
    month,
  );
describe("investment allocation, realized returns and manual valuations", () => {
  it("keeps allocations inside the investment account without inventing income or spending", () => {
    const d = data();
    expect(validateData(d)).toBe(true);
    expect(summary(d)).toMatchObject({
      cash: 400,
      principal: 600,
      totalValue: 1000,
      monthlyNet: 0,
    });
    expect(accountBalance(d, account, date)).toBe(1000);
    expect(d.transactions).toEqual([]);
  });
  it("records realized interest/dividends in investment cash and the selected month only", () => {
    let d = data();
    d = saveInvestmentEntry(d, entry("dividend", "income", 25));
    d = saveInvestmentEntry(d, entry("fee", "expense", 5, "2026-10-03"));
    expect(summary(d)).toMatchObject({
      cash: 420,
      monthIncome: 25,
      monthExpense: 5,
      monthlyNet: 20,
      totalValue: 1020,
    });
    expect(accountBalance(d, account, date)).toBe(1020);
    expect(summary(d, "2026-09").monthIncome).toBe(0);
  });
  it("manual market value affects unrealized return but neither cash nor monthly income", () => {
    const d = saveInvestmentEntry(data(), entry("market", "valuation", 750));
    expect(summary(d)).toMatchObject({
      cash: 400,
      principal: 600,
      value: 750,
      unrealized: 150,
      totalValue: 1150,
      monthlyNet: 0,
    });
    expect(accountBalance(d, account, date)).toBe(1000);
  });
  it("does not count returned principal as income and releases proportional market value", () => {
    let d = saveInvestmentEntry(data(), entry("market", "valuation", 750));
    d = saveInvestmentEntry(d, entry("sale", "release", 300, "2026-10-03"));
    expect(summary(d)).toMatchObject({
      cash: 700,
      principal: 300,
      value: 375,
      unrealized: 75,
      totalValue: 1075,
      monthIncome: 0,
    });
    expect(positionSummary(d, p, date)).toMatchObject({
      allocated: 600,
      released: 300,
    });
  });
  it("realizes a stock sale with a loss without subtracting market loss twice", () => {
    let d = saveInvestmentEntry(data(), entry("market", "valuation", 540));
    d = saveInvestmentEntry(
      d,
      entry("principal", "release", 600, "2026-10-03"),
    );
    d = saveInvestmentEntry(
      d,
      entry("loss", "expense", 60, "2026-10-03", "13:00"),
    );
    expect(summary(d)).toMatchObject({
      cash: 940,
      principal: 0,
      value: 0,
      totalValue: 940,
      unrealized: 0,
      monthlyNet: -60,
      totalReturn: -60,
    });
  });
  it("realizes profit separately from principal on a full sale", () => {
    let d = saveInvestmentEntry(data(), entry("market", "valuation", 750));
    d = saveInvestmentEntry(
      d,
      entry("principal", "release", 600, "2026-10-03"),
    );
    d = saveInvestmentEntry(
      d,
      entry("profit", "income", 150, "2026-10-03", "13:00"),
    );
    expect(summary(d)).toMatchObject({
      cash: 1150,
      value: 0,
      principal: 0,
      totalValue: 1150,
      monthIncome: 150,
      unrealized: 0,
    });
  });
  it("rejects allocating cash that is already placed elsewhere", () => {
    expect(() =>
      saveInvestmentEntry(data(), entry("too-much", "allocate", 401)),
    ).toThrow();
    const d = saveInvestmentPosition(data(), {
      ...p,
      id: "second",
      name: "Second",
    });
    expect(() =>
      saveInvestmentEntry(d, {
        ...entry("other", "allocate", 500),
        positionId: "second",
      }),
    ).toThrow();
  });
  it("rejects over-withdrawal of principal and deleting funding required by later entries", () => {
    expect(() =>
      saveInvestmentEntry(data(), entry("too-much", "release", 601)),
    ).toThrow();
    const d = saveInvestmentEntry(data(), entry("release", "release", 100));
    expect(() => deleteInvestmentEntry(d, "initial")).toThrow();
  });
  it("rejects an account transfer that would spend allocated principal", () => {
    const d = saveTransfer(data(), {
      id: "withdraw",
      fromId: "invest",
      toId: "bank",
      amount: 500,
      currency: "TRY",
      date,
      note: "withdraw",
    });
    expect(validateData(d)).toBe(false);
  });
  it("a later transfer funding cannot cover an earlier placement", () => {
    const d = emptyData();
    d.financialAccounts = [
      { ...account, openingBalance: 0 },
      { ...account, id: "bank", kind: "bank", openingBalance: 1000 },
    ];
    d.accountTransfers = [
      {
        id: "fund",
        fromId: "bank",
        toId: "invest",
        amount: 600,
        currency: "TRY",
        date: "2026-10-03",
        note: "fund",
      },
    ];
    expect(() =>
      saveInvestmentPosition(
        d,
        p,
        entry("initial", "allocate", 600, "2026-10-02"),
      ),
    ).toThrow();
  });
  it("supports same-day funding with daily cash availability", () => {
    const d = emptyData();
    d.financialAccounts = [
      { ...account, openingBalance: 0 },
      { ...account, id: "bank", kind: "bank", openingBalance: 1000 },
    ];
    d.accountTransfers = [
      {
        id: "fund",
        fromId: "bank",
        toId: "invest",
        amount: 600,
        currency: "TRY",
        date: "2026-10-01",
        time: "18:00",
        note: "fund",
      },
    ];
    expect(
      validateData(
        saveInvestmentPosition(
          d,
          p,
          entry("initial", "allocate", 600, "2026-10-01", "09:00"),
        ),
      ),
    ).toBe(true);
  });
  it("preserves OMR baisa exactly in cash, valuations and realized returns", () => {
    const d = emptyData(),
      a = { ...account, currency: "OMR", openingBalance: 10.005 },
      pos = { ...p, currency: "OMR" };
    d.financialAccounts = [a];
    let r = saveInvestmentPosition(
      d,
      pos,
      entry("initial", "allocate", 2.751, "2026-10-01"),
    );
    r = saveInvestmentEntry(r, entry("income", "income", 0.111));
    r = saveInvestmentEntry(r, entry("market", "valuation", 3.123));
    expect(accountBalance(r, a, date)).toBe(10.116);
    expect(
      portfolioAccountSummary(
        r,
        a,
        accountBalance(r, a, date),
        date,
        "2026-10",
      ),
    ).toMatchObject({
      cash: 7.365,
      principal: 2.751,
      value: 3.123,
      totalValue: 10.488,
    });
  });
  it("keeps all investment returns outside operating budget reports and forecasts", () => {
    const base = data();
    let d = saveInvestmentEntry(base, entry("income", "income", 100));
    d = saveInvestmentEntry(d, entry("market", "valuation", 1000));
    expect(summarize(d, "2026-10")).toEqual(summarize(base, "2026-10"));
    expect(monthReport(d, "2026-10", date)).toEqual(
      monthReport(base, "2026-10", date),
    );
    expect(nextMonthForecast(d, date)).toEqual(nextMonthForecast(base, date));
  });
  it("shows realized investment income in its own account ledger with reconciled post-balance", () => {
    let d = saveInvestmentEntry(data(), entry("income", "income", 25));
    d = saveInvestmentEntry(d, entry("fee", "expense", 5, "2026-10-03"));
    const r = accountMonthActivity(d, account, "2026-10", date);
    expect(r.rows.map((row) => [row.kind, row.balanceAfter])).toEqual([
      ["investment", 1020],
      ["investment", 1025],
    ]);
    expect(r.closing).toBe(1020);
  });
  it("keeps previous-month realized income in the next month's opening balance", () => {
    let d = data();
    d = saveInvestmentEntry(d, entry("income", "income", 25, "2026-10-20"));
    expect(
      accountMonthActivity(d, account, "2026-11", "2026-11-24"),
    ).toMatchObject({ opening: 1025, closing: 1025, rows: [] });
  });
  it("estimates simple deposit interest with optional withholding without booking the estimate", () => {
    const d = emptyData();
    d.financialAccounts = [{ ...account, openingBalance: 10000 }];
    const dep: InvestmentPosition = {
      ...p,
      kind: "deposit",
      startDate: "2026-10-01",
      maturityDate: "2026-11-02",
      annualRate: 36.5,
      withholdingRate: 10,
    };
    const r = saveInvestmentPosition(
      d,
      dep,
      entry("initial", "allocate", 10000, "2026-10-01"),
    );
    expect(positionSummary(r, dep, date)).toMatchObject({
      days: 32,
      expectedInterest: 288,
      monthIncome: 0,
    });
    expect(accountBalance(r, d.financialAccounts[0], date)).toBe(10000);
  });
  it("editing or deleting a dividend adjusts cash and monthly income without duplicating records", () => {
    let d = saveInvestmentEntry(data(), entry("income", "income", 25));
    d = saveInvestmentEntry(d, entry("income", "income", 30));
    expect(d.investmentEntries).toHaveLength(2);
    expect(summary(d).cash).toBe(430);
    d = deleteInvestmentEntry(d, "income");
    expect(summary(d).cash).toBe(400);
  });
  it("allows zero market value but rejects negative/invalid and over-precision amounts", () => {
    expect(
      validateData(saveInvestmentEntry(data(), entry("zero", "valuation", 0))),
    ).toBe(true);
    for (const n of [-1, Infinity, 1.001])
      expect(() =>
        saveInvestmentEntry(data(), entry("invalid", "income", n)),
      ).toThrow();
  });
  it("preserves closed investment history when archived and blocks new archived entries", () => {
    let d = saveInvestmentEntry(data(), entry("release", "release", 600));
    d = saveInvestmentPosition(d, { ...p, archived: true });
    expect(validateData(d)).toBe(true);
    expect(() => saveInvestmentEntry(d, entry("new", "income", 1))).toThrow();
    expect(() =>
      saveInvestmentPosition(data(), { ...p, archived: true }),
    ).toThrow();
  });
  it("locks account/currency changes while portfolio history exists", () => {
    const d = data();
    expect(() =>
      saveFinancialAccount(d, { ...account, kind: "bank" }),
    ).toThrow();
    expect(() =>
      saveFinancialAccount(d, { ...account, currency: "USD" }),
    ).toThrow();
    expect(() =>
      saveInvestmentPosition(d, { ...p, accountId: "bank" }),
    ).toThrow();
  });
  it("rejects orphan positions/entries, operating accounts and dates before account opening", () => {
    const d = data();
    for (const position of [
      { ...p, accountId: "bank" },
      { ...p, currency: "USD" },
      { ...p, startDate: "2026-09-01" },
    ])
      expect(() => saveInvestmentPosition(d, position)).toThrow();
    expect(() =>
      saveInvestmentEntry(d, {
        ...entry("orphan", "income", 1),
        positionId: "missing",
      }),
    ).toThrow();
  });
  it("roundtrips a full portfolio JSON backup and accepts older documents without portfolio fields", () => {
    const d = data();
    expect(validateData(JSON.parse(JSON.stringify(d)))).toBe(true);
    const old = emptyData();
    delete old.investmentPositions;
    delete old.investmentEntries;
    expect(validateData(old)).toBe(true);
    expect(validateData({ ...old, investmentPositions: {} })).toBe(false);
  });
});
