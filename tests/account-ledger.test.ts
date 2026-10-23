import { describe, expect, it } from "vitest";
import { accountMonthActivity } from "../lib/budget/account-activity";
import { emptyData, type Transaction } from "../lib/budget/model";
import {
  accountBalance,
  type FinancialAccount,
  type AccountTransfer,
} from "../lib/budget/finance";
import { buildExchange } from "../lib/budget/exchange";
import { omrFromUsd, type FxQuote } from "../lib/budget/fx";
const bank: FinancialAccount = {
  id: "bank",
  name: "Banka",
  kind: "bank",
  currency: "TRY",
  openingBalance: 1000,
  openingDate: "2026-09-01",
  archived: false,
};
const usd: FxQuote = {
  currency: "USD",
  currencyName: "Dolar",
  date: "2026-10-01",
  unit: 1,
  forexBuying: 40,
  forexSelling: 41,
  banknoteBuying: null,
  banknoteSelling: null,
  bulletinNo: "synthetic",
};
const tx = (
  id: string,
  time: string | undefined,
  amount: number,
  type: "income" | "expense" = "expense",
): Transaction => ({
  id,
  date: "2026-10-01",
  time,
  amount,
  type,
  accountId: "bank",
  categoryId: type === "income" ? "salary" : "market",
  description: id,
});
const move = (
  id: string,
  time: string,
  amount: number,
  incoming = false,
): AccountTransfer => ({
  id,
  date: "2026-10-01",
  time,
  amount,
  fromId: incoming ? "cash" : "bank",
  toId: incoming ? "bank" : "cash",
  currency: "TRY",
  note: id,
});
function data() {
  const d = emptyData();
  d.financialAccounts = [
    bank,
    { ...bank, id: "cash", name: "Nakit", openingBalance: 100 },
    { ...bank, id: "usd", name: "Dolar", currency: "USD", openingBalance: 100 },
    {
      ...bank,
      id: "omr",
      name: "Riyal",
      currency: "OMR",
      openingBalance: 10.005,
    },
  ];
  return d;
}
describe("combined account ledger with post-transaction balances", () => {
  it("interleaves income, expense, transfers and FX by time and reconciles every post-balance", () => {
    const d = data();
    d.transactions = [
      { ...tx("previous", undefined, 100), date: "2026-09-30" },
      tx("unknown", undefined, 10, "income"),
      tx("midnight", "00:00", 5),
      tx("salary", "09:00", 100, "income"),
      tx("spend", "11:00", 30),
      { ...tx("future", "15:00", 100), date: "2026-10-24" },
      { ...tx("other", "16:00", 100), accountId: "cash" },
      { ...tx("unassigned", "17:00", 100), accountId: undefined },
    ];
    d.accountTransfers = [
      move("out", "10:00", 50),
      move("in", "12:00", 20, true),
      {
        ...move("fx", "13:00", 10, true),
        fromId: "usd",
        currency: "USD",
        exchange: buildExchange(10, "USD", "TRY", "2026-10-01", usd),
      },
    ];
    const r = accountMonthActivity(d, bank, "2026-10", "2026-10-23");
    expect(r.rows.map((x) => [x.value.id, x.amount, x.balanceAfter])).toEqual([
      ["fx", 400, 1345],
      ["in", 20, 945],
      ["spend", 30, 925],
      ["out", 50, 955],
      ["salary", 100, 1005],
      ["midnight", 5, 905],
      ["unknown", 10, 910],
    ]);
    expect(r).toMatchObject({
      opening: 900,
      closing: 1345,
      income: 110,
      expense: 35,
      transferIn: 420,
      transferOut: 50,
    });
    expect(r.rows[0].balanceAfter).toBe(accountBalance(d, bank, "2026-10-23"));
  });
  it("retains the full historical balance when the display is filtered to expenses or transfers", () => {
    const d = data();
    d.transactions = [
      tx("salary", "09:00", 200, "income"),
      tx("spend", "11:00", 10),
    ];
    d.accountTransfers = [move("out", "10:00", 50)];
    const r = accountMonthActivity(d, bank, "2026-10", "2026-10-23");
    expect(
      r.rows
        .filter((x) => x.kind === "transaction" && x.value.type === "expense")
        .map((x) => x.balanceAfter),
    ).toEqual([1140]);
    expect(
      r.rows.filter((x) => x.kind === "transfer").map((x) => x.balanceAfter),
    ).toEqual([1150]);
  });
  it("includes a mid-month opening exactly once before the first movement", () => {
    const a = { ...bank, openingDate: "2026-10-10", openingBalance: 500 };
    const d = data();
    d.financialAccounts![0] = a;
    d.transactions = [{ ...tx("spend", "09:00", 10), date: "2026-10-10" }];
    const r = accountMonthActivity(d, a, "2026-10", "2026-10-23");
    expect(r).toMatchObject({
      opening: 0,
      openingAdjustment: 500,
      closing: 490,
    });
    expect(r.rows[0].balanceAfter).toBe(490);
  });
  it("carries transfers and FX from previous months into the opening balance", () => {
    const d = data();
    d.accountTransfers = [
      { ...move("old-out", "10:00", 50), date: "2026-09-30" },
      {
        ...move("old-fx", "11:00", 10, true),
        date: "2026-09-30",
        fromId: "usd",
        currency: "USD",
        exchange: buildExchange(10, "USD", "TRY", "2026-09-30", {
          ...usd,
          date: "2026-09-30",
        }),
      },
    ];
    d.transactions = [tx("spend", "09:00", 20)];
    expect(
      accountMonthActivity(d, bank, "2026-10", "2026-10-23"),
    ).toMatchObject({
      opening: 1350,
      closing: 1330,
      rows: [{ balanceAfter: 1330 }],
    });
  });
  it("keeps baisa exact on each OMR row and uses the incoming conversion amount", () => {
    const d = data(),
      a = d.financialAccounts![3];
    d.transactions = [
      {
        ...tx("omr-spend", "09:00", 0.751),
        accountId: "omr",
        currency: "OMR",
        baseAmount: 75.1,
      },
    ];
    d.accountTransfers = [
      {
        ...move("omr-in", "10:00", 100),
        toId: "omr",
        exchange: buildExchange(
          100,
          "TRY",
          "OMR",
          "2026-10-01",
          undefined,
          omrFromUsd(usd),
        ),
      },
    ];
    const r = accountMonthActivity(d, a, "2026-10", "2026-10-23");
    expect(r.rows.map((x) => [x.amount, x.balanceAfter])).toEqual([
      [0.938, 10.192],
      [0.751, 9.254],
    ]);
    expect(r.closing).toBe(10.192);
  });
  it("subtracts the original foreign amount on the outgoing FX account", () => {
    const d = data();
    d.accountTransfers = [
      {
        ...move("fx", "10:00", 25),
        fromId: "usd",
        toId: "bank",
        currency: "USD",
        exchange: buildExchange(25, "USD", "TRY", "2026-10-01", usd),
      },
    ];
    const r = accountMonthActivity(
      d,
      d.financialAccounts![2],
      "2026-10",
      "2026-10-23",
    );
    expect(r.rows[0]).toMatchObject({
      direction: "out",
      amount: 25,
      balanceAfter: 75,
    });
  });
  it("shows negative card balances and credits card payments without a second expense", () => {
    const a: FinancialAccount = {
      ...bank,
      id: "card",
      kind: "card",
      openingBalance: -100,
      creditLimit: 5000,
      statementDay: 15,
      paymentDay: 25,
    };
    const d = data();
    d.financialAccounts!.push(a);
    d.transactions = [{ ...tx("card-spend", "09:00", 50), accountId: "card" }];
    d.accountTransfers = [{ ...move("card-pay", "10:00", 100), toId: "card" }];
    const r = accountMonthActivity(d, a, "2026-10", "2026-10-23");
    expect(r.rows.map((x) => x.balanceAfter)).toEqual([-50, -150]);
    expect(r).toMatchObject({ income: 0, expense: 50, closing: -50 });
  });
  it("has stable tie ordering and separate rows for colliding transaction/transfer IDs", () => {
    const d = data();
    d.transactions = [tx("same", "10:00", 10)];
    d.accountTransfers = [move("same", "10:00", 20)];
    const r = accountMonthActivity(d, bank, "2026-10", "2026-10-23");
    expect(r.rows.map((x) => [x.kind, x.balanceAfter])).toEqual([
      ["transaction", 970],
      ["transfer", 980],
    ]);
  });
  it("recomputes later balances after a historical edit or deletion without storing balances", () => {
    const d = data();
    d.transactions = [tx("first", "09:00", 10), tx("last", "11:00", 20)];
    expect(
      accountMonthActivity(d, bank, "2026-10", "2026-10-23").rows[0]
        .balanceAfter,
    ).toBe(970);
    d.transactions[0].amount = 100;
    expect(
      accountMonthActivity(d, bank, "2026-10", "2026-10-23").rows[0]
        .balanceAfter,
    ).toBe(880);
    d.transactions.shift();
    expect(
      accountMonthActivity(d, bank, "2026-10", "2026-10-23").rows[0]
        .balanceAfter,
    ).toBe(980);
    expect(d.transactions[0]).not.toHaveProperty("balanceAfter");
  });
  it("handles an empty or future month without creating artificial movements", () => {
    const d = data();
    expect(
      accountMonthActivity(d, bank, "2026-10", "2026-10-23"),
    ).toMatchObject({ rows: [], opening: 1000, closing: 1000 });
    d.transactions = [{ ...tx("future", "09:00", 10), date: "2026-11-05" }];
    expect(accountMonthActivity(d, bank, "2026-11", "2026-10-23").rows).toEqual(
      [],
    );
  });
  it("does not mutate the document or movement arrays when constructing the ledger", () => {
    const d = data();
    d.transactions = [tx("last", "11:00", 20), tx("first", "09:00", 10)];
    d.accountTransfers = [move("middle", "10:00", 30)];
    const before = structuredClone(d);
    accountMonthActivity(d, bank, "2026-10", "2026-10-23");
    expect(d).toEqual(before);
  });
});
