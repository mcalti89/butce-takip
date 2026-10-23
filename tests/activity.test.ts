import { describe, expect, it } from "vitest";
import { activityRows, filterActivity } from "../lib/budget/activity";
import {
  emptyData,
  summarize,
  validateData,
  type Transaction,
} from "../lib/budget/model";
import {
  accountBalance,
  saveTransfer,
  type AccountTransfer,
} from "../lib/budget/finance";
import { dailyMonthReport } from "../lib/budget/reports";
const tx = (
  id: string,
  type: "income" | "expense",
  time?: string,
): Transaction => ({
  id,
  type,
  date: "2026-10-23",
  time,
  amount: 10,
  categoryId: type === "income" ? "salary" : "market",
  description: id,
});
const transfer: AccountTransfer = {
  id: "move",
  date: "2026-10-23",
  time: "14:30",
  fromId: "bank",
  toId: "card",
  currency: "TRY",
  amount: 100,
  note: "Kart borcu ödemem",
};
function data() {
  const d = emptyData();
  d.financialAccounts = [
    {
      id: "bank",
      name: "Maaş Bankası",
      kind: "bank",
      currency: "TRY",
      openingBalance: 1000,
      openingDate: "2026-10-01",
      archived: false,
    },
    {
      id: "card",
      name: "Kredi Kartım",
      kind: "card",
      currency: "TRY",
      openingBalance: -200,
      openingDate: "2026-10-01",
      creditLimit: 5000,
      statementDay: 15,
      paymentDay: 25,
      archived: false,
    },
  ];
  d.transactions = [
    tx("salary", "income", "09:00"),
    tx("shopping", "expense", "16:00"),
  ];
  d.accountTransfers = [{ ...transfer }];
  return d;
}
describe("combined transaction and transfer activity", () => {
  it("shows each transfer once alongside incomes and expenses", () => {
    const d = data(),
      r = filterActivity(d, "2026-10");
    expect(r.count).toBe(3);
    expect(
      activityRows(r.transactions, r.transfers).map((x) => [
        x.kind,
        x.value.id,
      ]),
    ).toEqual([
      ["transaction", "shopping"],
      ["transfer", "move"],
      ["transaction", "salary"],
    ]);
  });
  it("shows transfer-only months with no artificial income/expense entries", () => {
    const d = data();
    d.transactions = [];
    const r = filterActivity(d, "2026-10");
    expect(r.count).toBe(1);
    expect(r.transactions).toEqual([]);
  });
  it.each(["income", "expense"] as const)(
    "excludes transfers from the %s filter",
    (type) => {
      const r = filterActivity(data(), "2026-10", type);
      expect(r.transactions).toHaveLength(1);
      expect(r.transactions[0].type).toBe(type);
      expect(r.transfers).toHaveLength(0);
    },
  );
  it("transfer filter returns only the stored transfer", () => {
    const r = filterActivity(data(), "2026-10", "transfer");
    expect(r.transactions).toHaveLength(0);
    expect(r.transfers).toEqual([transfer]);
  });
  it("category filtering only applies to income/expense records", () => {
    const r = filterActivity(data(), "2026-10", "all", "market");
    expect(r.transactions.map((t) => t.id)).toEqual(["shopping"]);
    expect(r.transfers).toHaveLength(0);
  });
  it("filters calendar months without moving a record to the clock's timezone", () => {
    expect(filterActivity(data(), "2026-09").count).toBe(0);
  });
  it.each(["maaş bankası", "KREDİ KARTIM", "Kart borcu", "transfer"])(
    "searches transfer account names, notes or type: %s",
    (query) => {
      const r = filterActivity(data(), "2026-10", "transfer", "all", query);
      expect(r.transfers).toHaveLength(1);
    },
  );
  it("keeps old unknown-time transfers after known-time activity on the same day", () => {
    const old = { ...transfer, time: undefined };
    expect(
      activityRows([tx("midnight", "expense", "00:00")], [old]).map(
        (e) => e.value.id,
      ),
    ).toEqual(["midnight", "move"]);
  });
  it("sorts by date before time and keeps transaction/transfer ID collisions separate", () => {
    const older = {
      ...transfer,
      id: "same",
      date: "2026-10-22",
      time: "23:59",
    };
    const rows = activityRows([tx("same", "expense", "00:00")], [older]);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe("transaction");
  });
  it("never changes balances or realized totals by merely combining the list", () => {
    const d = data(),
      before = structuredClone(d);
    activityRows(d.transactions, d.accountTransfers);
    filterActivity(d, "2026-10");
    expect(d).toEqual(before);
    expect(summarize(d, "2026-10")).toMatchObject({
      income: 10,
      expense: 10,
      net: 0,
    });
  });
  it("transfer creation affects two account balances but not income, expense or daily reports", () => {
    const d = data();
    d.transactions = [];
    d.accountTransfers = [];
    const r = saveTransfer(d, transfer);
    expect(validateData(r)).toBe(true);
    expect(accountBalance(r, r.financialAccounts![0], "2026-10-23")).toBe(900);
    expect(accountBalance(r, r.financialAccounts![1], "2026-10-23")).toBe(-100);
    expect(summarize(r, "2026-10")).toMatchObject({
      income: 0,
      expense: 0,
      net: 0,
    });
    expect(dailyMonthReport(r, "2026-10", "2026-10-23").totals.net).toBe(0);
  });
  it("preserves valid transfer times in JSON and rejects invalid clocks", () => {
    const d = data();
    expect(validateData(d)).toBe(true);
    expect(JSON.parse(JSON.stringify(d)).accountTransfers[0].time).toBe(
      "14:30",
    );
    d.accountTransfers![0].time = "24:00";
    expect(validateData(d)).toBe(false);
    delete d.accountTransfers![0].time;
    expect(validateData(d)).toBe(true);
  });
});
