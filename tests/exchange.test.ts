import { describe, expect, it } from "vitest";
import { buildExchange } from "../lib/budget/exchange";
import {
  accountBalance,
  saveExchange,
  saveTransfer,
  deleteTransfer,
  setAccountArchived,
  saveFinancialAccount,
  type AccountTransfer,
  type FinancialAccount,
} from "../lib/budget/finance";
import { emptyData, validateData, summarize } from "../lib/budget/model";
import { accountMonthActivity } from "../lib/budget/account-activity";
import { filterActivity } from "../lib/budget/activity";
import { dailyMonthReport } from "../lib/budget/reports";
import { omrFromUsd, type FxQuote } from "../lib/budget/fx";
const date = "2026-10-24";
const usd: FxQuote = {
  currency: "USD",
  date: "2026-10-23",
  unit: 1,
  forexBuying: 40,
  forexSelling: 41,
  banknoteBuying: 39,
  banknoteSelling: 42,
  currencyName: "Dolar",
  bulletinNo: "1",
};
const account = (
  id: string,
  currency: string,
  balance = 0,
): FinancialAccount => ({
  id,
  name: id,
  kind: "bank",
  currency,
  openingBalance: balance,
  openingDate: "2026-10-01",
  archived: false,
});
function data() {
  const d = emptyData();
  d.financialAccounts = [
    account("usd", "USD", 100),
    account("try", "TRY", 1000),
    account("omr", "OMR", 10),
  ];
  return d;
}
function transfer(amount = 25): AccountTransfer {
  return {
    id: "exchange",
    fromId: "usd",
    toId: "try",
    currency: "USD",
    amount,
    date,
    time: "11:00",
    note: "Dolar bozdur",
    exchange: buildExchange(amount, "USD", "TRY", date, usd),
  };
}
describe("historical currency exchange", () => {
  it("sells dollars at forex buying and credits TRY once without income/expense", () => {
    const d = saveExchange(data(), transfer());
    expect(accountBalance(d, d.financialAccounts![0], date)).toBe(75);
    expect(accountBalance(d, d.financialAccounts![1], date)).toBe(2000);
    expect(d.accountTransfers).toHaveLength(1);
    expect(d.transactions).toEqual([]);
    expect(summarize(d, "2026-10")).toMatchObject({ income: 0, expense: 0 });
    expect(dailyMonthReport(d, "2026-10", date).totals.net).toBe(0);
    expect(validateData(d)).toBe(true);
  });
  it("buys dollars at forex selling rather than buying or banknote rates", () => {
    const x = buildExchange(410, "TRY", "USD", date, undefined, usd);
    expect(x.toAmount).toBe(10);
    expect(x.toQuote?.side).toBe("selling");
  });
  it("keeps historical bulletin date for a weekend and survives JSON backup", () => {
    const d = saveExchange(data(), transfer());
    const restored = JSON.parse(JSON.stringify(d));
    expect(validateData(restored)).toBe(true);
    expect(restored.accountTransfers[0].exchange.fromQuote.date).toBe(
      "2026-10-23",
    );
    expect(restored.accountTransfers[0].date).toBe(date);
    usd.forexBuying = 45;
    expect(accountBalance(restored, restored.financialAccounts[1], date)).toBe(
      2000,
    );
    usd.forexBuying = 40;
  });
  it("applies TCMB units before conversion", () => {
    expect(
      buildExchange(200, "JPY", "TRY", date, {
        ...usd,
        currency: "JPY",
        unit: 100,
        forexBuying: 27,
      }).toAmount,
    ).toBe(54);
  });
  it("keeps OMR baisa precision including the incoming account", () => {
    const q = omrFromUsd(usd);
    const x = buildExchange(100, "TRY", "OMR", date, undefined, q);
    const d = saveExchange(data(), {
      ...transfer(),
      fromId: "try",
      toId: "omr",
      currency: "TRY",
      amount: 100,
      exchange: x,
    });
    expect(x.toAmount).toBe(0.938);
    expect(accountBalance(d, d.financialAccounts![2], date)).toBe(10.938);
    expect(
      accountMonthActivity(d, d.financialAccounts![2], "2026-10", date),
    ).toMatchObject({ transferIn: 0.938, closing: 10.938 });
  });
  it("supports cross currencies using source buying and target selling", () => {
    const eur = { ...usd, currency: "EUR" as const, forexSelling: 50 };
    expect(buildExchange(25, "USD", "EUR", date, usd, eur).toAmount).toBe(20);
  });
  it("reconciles monthly incoming/outgoing movements in each account currency", () => {
    const d = saveExchange(data(), transfer());
    expect(
      accountMonthActivity(d, d.financialAccounts![0], "2026-10", date),
    ).toMatchObject({ transferOut: 25, transferIn: 0, closing: 75 });
    expect(
      accountMonthActivity(d, d.financialAccounts![1], "2026-10", date),
    ).toMatchObject({ transferOut: 0, transferIn: 1000, closing: 2000 });
    expect(filterActivity(d, "2026-10", "transfer", "all", "döviz").count).toBe(
      1,
    );
    expect(filterActivity(d, "2026-10", "all", "all", "TRY").count).toBe(1);
  });
  it("edits and deletes both legs atomically", () => {
    let d = saveExchange(data(), transfer());
    d = saveExchange(d, transfer(50));
    expect(d.accountTransfers).toHaveLength(1);
    expect(accountBalance(d, d.financialAccounts![1], date)).toBe(3000);
    d = deleteTransfer(d, "exchange");
    expect(accountBalance(d, d.financialAccounts![0], date)).toBe(100);
    expect(accountBalance(d, d.financialAccounts![1], date)).toBe(1000);
  });
  it.each([
    "missing",
    "future",
    "zero",
    "negative",
    "wrong currency",
    "missing buying",
  ])("rejects an unusable historical quote: %s", (kind) => {
    const q =
      kind === "missing"
        ? undefined
        : {
            ...usd,
            ...(kind === "future" ? { date: "2026-10-25" } : {}),
            ...(kind === "zero" ? { unit: 0 } : {}),
            ...(kind === "negative" ? { forexBuying: -1 } : {}),
            ...(kind === "wrong currency" ? { currency: "EUR" as const } : {}),
            ...(kind === "missing buying" ? { forexBuying: null } : {}),
          };
    expect(() => buildExchange(25, "USD", "TRY", date, q)).toThrow();
  });
  it.each([
    "target amount",
    "rate",
    "side",
    "future",
    "target currency",
    "null",
    "missing snapshot",
  ])("rejects tampered exchange documents: %s", (kind) => {
    const t = transfer();
    if (kind === "target amount") t.exchange!.toAmount += 1;
    if (kind === "rate") t.exchange!.rate = 41;
    if (kind === "side") t.exchange!.fromQuote!.side = "selling";
    if (kind === "future") t.exchange!.fromQuote!.date = "2026-10-25";
    if (kind === "target currency") t.exchange!.toCurrency = "EUR";
    if (kind === "null") (t as any).exchange = null;
    if (kind === "missing snapshot") delete t.exchange;
    expect(validateData({ ...data(), accountTransfers: [t] })).toBe(false);
    expect(() => saveExchange(data(), t)).toThrow();
  });
  it("rejects same-currency exchange, tiny rounded receipts, excessive precision and same account", () => {
    expect(() => buildExchange(1, "USD", "USD", date, usd, usd)).toThrow();
    expect(() =>
      buildExchange(0.01, "TRY", "USD", date, undefined, usd),
    ).toThrow();
    expect(() => buildExchange(1.001, "USD", "TRY", date, usd)).toThrow();
    expect(() =>
      saveExchange(data(), { ...transfer(), toId: "usd" }),
    ).toThrow();
  });
  it("retains same-currency transfer restrictions", () => {
    expect(() => saveTransfer(data(), transfer())).toThrow();
    const t = transfer();
    delete t.exchange;
    expect(() => saveTransfer(data(), t)).toThrow();
  });
  it("honors account dates, archiving, currency locks and card exclusion", () => {
    let d = data();
    d.financialAccounts![0].openingDate = "2026-10-25";
    expect(() => saveExchange(d, transfer())).toThrow();
    d = data();
    d.financialAccounts![0].archived = true;
    expect(() => saveExchange(d, transfer())).toThrow();
    d = data();
    d.financialAccounts![0].kind = "card";
    expect(() => saveExchange(d, transfer())).toThrow();
    d = saveExchange(data(), transfer());
    expect(() => setAccountArchived(d, "usd", true, date)).toThrow();
    expect(() =>
      saveFinancialAccount(d, { ...d.financialAccounts![0], currency: "EUR" }),
    ).toThrow();
  });
});
