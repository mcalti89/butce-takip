import { describe, expect, it } from "vitest";
import { emptyData } from "../lib/budget/model";
import { monthlyReceipts } from "../lib/budget/receipt-list";
import type { Receipt } from "../lib/budget/receipt-model";
const file = (
  id: string,
  entryId: string,
  kind: Receipt["kind"] = "transaction",
  createdAt = Date.UTC(2026, 10, 15),
): Receipt => ({ id, entryId, kind, createdAt, name: id + ".pdf", size: 123 });
function fixture() {
  const data = emptyData();
  data.transactions = [
    {
      id: "expense",
      type: "expense",
      categoryId: "market",
      amount: 1.001,
      currency: "OMR",
      date: "2026-10-27",
      time: "09:30",
      description: "Market",
    },
    {
      id: "income",
      type: "income",
      categoryId: "salary",
      amount: 100,
      date: "2026-10-27",
      time: "15:00",
      description: "Maaş",
    },
    {
      id: "previous",
      type: "expense",
      categoryId: "market",
      amount: 10,
      date: "2026-09-30",
      description: "Geçen ay",
    },
  ];
  data.accountTransfers = [
    {
      id: "expense",
      fromId: "bank",
      toId: "investment",
      amount: 20,
      currency: "USD",
      date: "2026-10-28",
      time: "12:00",
      note: "Yatırım transferi",
    },
  ];
  return data;
}
describe("Monthly receipt library", () => {
  it("uses the operation month even when the PDF was uploaded the following month", () => {
    const data = fixture();
    const receipts = [file("current", "expense"), file("prior", "previous")];
    expect(
      monthlyReceipts(data, receipts, "2026-10").map((r) => r.receipt.id),
    ).toEqual(["current"]);
    expect(
      monthlyReceipts(data, receipts, "2026-09").map((r) => r.receipt.id),
    ).toEqual(["prior"]);
    expect(monthlyReceipts(data, receipts, "2026-11")).toEqual([]);
  });
  it("includes income and transfers, preserves currencies, and separates equal IDs across entry types", () => {
    const rows = monthlyReceipts(
      fixture(),
      [
        file("transfer", "expense", "transfer"),
        file("expense", "expense"),
        file("income", "income"),
      ],
      "2026-10",
    );
    expect(rows.map((r) => r.receipt.id)).toEqual([
      "transfer",
      "income",
      "expense",
    ]);
    expect(rows[2].activity.value).toMatchObject({
      amount: 1.001,
      currency: "OMR",
    });
    expect(rows[0].activity.kind).toBe("transfer");
  });
  it("keeps every attachment, newest first within the same operation", () => {
    const rows = monthlyReceipts(
      fixture(),
      [
        file("old", "expense", "transaction", 1),
        file("new", "expense", "transaction", 2),
      ],
      "2026-10",
    );
    expect(rows.map((r) => r.receipt.id)).toEqual(["new", "old"]);
  });
  it("hides deleted or missing parent entries and handles empty budgets", () => {
    expect(
      monthlyReceipts(fixture(), [file("orphan", "deleted")], "2026-10"),
    ).toEqual([]);
    expect(
      monthlyReceipts(emptyData(), [file("old-account", "expense")], "2026-10"),
    ).toEqual([]);
  });
});
