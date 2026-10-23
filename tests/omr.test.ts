import { describe, expect, it } from "vitest";
import {
  emptyData,
  parseAmount,
  moneyIn,
  validateData,
  summarize,
  type Transaction,
} from "../lib/budget/model";
import { omrFromUsd, convertToTry, type FxQuote } from "../lib/budget/fx";
import {
  accountBalance,
  occurrenceAmount,
  pendingInstallments,
  type FinancialAccount,
  type PaymentPlan,
} from "../lib/budget/finance";
import { nextMonthForecast } from "../lib/budget/reports";
import { exportCSV, importCSV } from "../lib/budget/csv";
const usd: FxQuote = {
  currency: "USD",
  currencyName: "ABD doları",
  date: "2026-10-21",
  unit: 1,
  forexBuying: 38.45,
  forexSelling: 38.8345,
  banknoteBuying: 38.4,
  banknoteSelling: 38.9,
  bulletinNo: "2026/199",
};
const account: FinancialAccount = {
  id: "omr-bank",
  name: "Umman hesabım",
  kind: "bank",
  currency: "OMR",
  openingBalance: 10.005,
  openingDate: "2026-10-01",
  archived: false,
};
const expense: Transaction = {
  id: "expense",
  date: "2026-10-21",
  type: "expense",
  categoryId: "market",
  amount: 2.751,
  currency: "OMR",
  accountId: account.id,
  baseAmount: 277.85,
  fxRate: 101,
  fxUnit: 1,
  fxDate: "2026-10-21",
  fxSide: "selling",
  description: "Umman alışverişi",
};
const d = () => ({
  ...emptyData(),
  financialAccounts: [{ ...account }],
  transactions: [{ ...expense }],
});
describe("Umman riyali ve baisa", () => {
  it("derives OMR from the archived USD quote with an explicit source", () => {
    const q = omrFromUsd(usd);
    expect(q.forexBuying).toBe(100);
    expect(q.forexSelling).toBe(101);
    expect(q.date).toBe(usd.date);
    expect(q.bulletinNo).toBe(usd.bulletinNo);
    expect(q.rateSource).toBe("TCMB_USD_OMR_PEG");
    expect(q.banknoteBuying).toBeNull();
    expect(q.banknoteSelling).toBeNull();
  });
  it("handles the source unit, missing rates, and rejects a non-USD source", () => {
    expect(
      omrFromUsd({ ...usd, unit: 100, forexBuying: 3845 }).forexBuying,
    ).toBe(100);
    expect(omrFromUsd({ ...usd, forexBuying: null }).forexBuying).toBeNull();
    expect(() => omrFromUsd({ ...usd, currency: "EUR" })).toThrow();
  });
  it("accepts exactly three fractional digits for OMR, including a single baisa", () => {
    expect(parseAmount("2,751", "OMR")).toBe(2.751);
    expect(parseAmount("0.001", "OMR")).toBe(0.001);
    expect(parseAmount("1.234,567", "OMR")).toBe(1234.567);
    expect(parseAmount("2.7511", "OMR")).toBeNaN();
    expect(parseAmount("2.751", "TRY")).toBeNaN();
  });
  it("displays the third decimal instead of silently rounding baisa away", () => {
    expect(moneyIn(2.751, "OMR")).toContain("2,751");
  });
  it("uses 2 digits for TRY base amounts and the appropriate buy/sell snapshot", () => {
    expect(convertToTry(2.751, omrFromUsd(usd), "selling")).toBe(277.85);
    expect(convertToTry(2.751, omrFromUsd(usd), "buying")).toBe(275.1);
  });
  it("preserves baisa in linked account balances and keeps TRY reports separate", () => {
    const data = d();
    expect(validateData(data)).toBe(true);
    expect(accountBalance(data, account, "2026-10-23")).toBe(7.254);
    expect(summarize(data, "2026-10").expense).toBe(277.85);
    data.transactions[0].amount = 2.7511;
    expect(validateData(data)).toBe(false);
  });
  it("transfers an exact baisa without creating another expense", () => {
    const data = d();
    data.financialAccounts.push({ ...account, id: "cash", openingBalance: 0 });
    Object.assign(data, {
      accountTransfers: [
        {
          id: "transfer",
          fromId: account.id,
          toId: "cash",
          amount: 0.001,
          currency: "OMR",
          date: "2026-10-22",
          note: "",
        },
      ],
    });
    expect(validateData(data)).toBe(true);
    expect(accountBalance(data, account, "2026-10-23")).toBe(7.253);
    expect(accountBalance(data, data.financialAccounts[1], "2026-10-23")).toBe(
      0.001,
    );
  });
  it("splits installments in baisa and preserves the exact total", () => {
    const p: PaymentPlan = {
      id: "parts",
      title: "Taksit",
      kind: "installment",
      type: "expense",
      amount: 1.001,
      currency: "OMR",
      categoryId: "market",
      accountId: account.id,
      count: 3,
      startDate: "2026-10-21",
      archived: false,
    };
    const data = d();
    Object.assign(data.financialAccounts[0], {
      kind: "card",
      creditLimit: 100,
      statementDay: 15,
      paymentDay: 25,
    });
    data.paymentPlans = [p];
    expect(validateData(data)).toBe(true);
    expect([0, 1, 2].map((i) => occurrenceAmount(p, i))).toEqual([
      0.334, 0.334, 0.333,
    ]);
    expect(pendingInstallments(data, account.id)).toBe(1.001);
    data.transactions[0] = {
      ...expense,
      amount: 0.334,
      planId: p.id,
      planIndex: 0,
    };
    expect(pendingInstallments(data, account.id)).toBe(0.667);
  });
  it("keeps three digits in forecasts instead of rounding every movement to cents", () => {
    const data = d();
    data.paymentPlans = [
      {
        id: "plan",
        title: "Ödeme",
        kind: "once",
        type: "expense",
        amount: 0.003,
        currency: "OMR",
        categoryId: "market",
        startDate: "2026-11-01",
        archived: false,
      },
    ];
    const r = nextMonthForecast(data, "2026-10-23").rows[0];
    expect(r.current).toBe(7.254);
    expect(r.expense).toBe(0.003);
    expect(r.nextMonthEnd).toBe(7.251);
  });
  it("round-trips OMR original amount and fixed TRY equivalent through CSV", () => {
    const data = d();
    const text = exportCSV(data);
    expect(text).toContain("2.751");
    const restored = importCSV(text, emptyData());
    expect(restored.errors).toEqual([]);
    expect(restored.transactions[0].amount).toBe(2.751);
    expect(restored.transactions[0].currency).toBe("OMR");
    expect(restored.transactions[0].baseAmount).toBe(277.85);
  });
});
