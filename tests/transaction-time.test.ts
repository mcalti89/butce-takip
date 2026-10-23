import { describe, expect, it } from "vitest";
import {
  compareTransactionsNewestFirst,
  emptyData,
  localTime,
  validTime,
  validateData,
  type Transaction,
} from "../lib/budget/model";
import { CSV_TEMPLATE, exportCSV, importCSV } from "../lib/budget/csv";
const entry = (
  id: string,
  date = "2026-10-23",
  time?: string,
): Transaction => ({
  id,
  date,
  ...(time === undefined ? {} : { time }),
  type: "expense",
  categoryId: "market",
  amount: 10,
  description: "Alışveriş",
});
describe("transaction time", () => {
  it.each(["00:00", "09:05", "14:30", "23:59"])(
    "accepts 24-hour time %s",
    (time) => {
      expect(validTime(time)).toBe(true);
      expect(
        validateData({
          ...emptyData(),
          transactions: [entry("id", undefined, time)],
        }),
      ).toBe(true);
    },
  );
  it.each(["24:00", "12:60", "9:05", "12:30:00", "", null, 1430])(
    "rejects malformed or non-string time %s",
    (time) => {
      expect(validTime(time)).toBe(false);
      expect(
        validateData({
          ...emptyData(),
          transactions: [{ ...entry("id"), time }],
        }),
      ).toBe(false);
    },
  );
  it("retains old records with unknown times, without inventing midnight", () => {
    const transaction = entry("legacy");
    const data = { ...emptyData(), transactions: [transaction] };
    expect(validateData(data)).toBe(true);
    expect(
      JSON.parse(JSON.stringify(data)).transactions[0].time,
    ).toBeUndefined();
  });
  it("sorts by calendar date first and by time second, newest first", () => {
    const rows = [
      entry("z", "2026-10-22", "23:59"),
      entry("a", "2026-10-23", "00:00"),
      entry("b", "2026-10-23", "14:30"),
      entry("c", "2026-10-23", "09:05"),
    ];
    expect(
      [...rows].sort(compareTransactionsNewestFirst).map((t) => t.id),
    ).toEqual(["b", "c", "a", "z"]);
  });
  it("puts unknown times after known times on the same day and keeps stable ties", () => {
    const rows = [
      entry("z"),
      entry("a", undefined, "00:00"),
      entry("b", undefined, "00:00"),
      entry("older", "2026-10-22", "23:59"),
    ];
    expect(rows.sort(compareTransactionsNewestFirst).map((t) => t.id)).toEqual([
      "b",
      "a",
      "z",
      "older",
    ]);
  });
  it("formats the local clock with zero-padded hours and minutes", () => {
    expect(localTime(new Date(2026, 9, 23, 9, 5))).toBe("09:05");
  });
  it("round trips timed and legacy records through CSV without making up times", () => {
    const data = {
      ...emptyData(),
      transactions: [
        entry("late", undefined, "14:30"),
        entry("legacy"),
        entry("early", undefined, "09:05"),
      ],
    };
    const restored = importCSV(exportCSV(data), emptyData());
    expect(restored.errors).toEqual([]);
    expect(restored.transactions.find((t) => t.id === "late")?.time).toBe(
      "14:30",
    );
    expect(
      restored.transactions.find((t) => t.id === "legacy")?.time,
    ).toBeUndefined();
  });
  it("imports old CSV files and the updated sample template", () => {
    expect(
      importCSV(
        "date,type,category,amount,description\n2026-10-23,expense,Market,10,Alışveriş",
        emptyData(),
      ).transactions[0].time,
    ).toBeUndefined();
    const result = importCSV(CSV_TEMPLATE, emptyData());
    expect(result.errors).toEqual([]);
    expect(result.transactions.map((t) => t.time)).toEqual(["09:00", "14:30"]);
  });
  it("keeps otherwise identical transactions at different times and skips exact duplicates", () => {
    const text =
      "date,type,category,amount,description,saat\n2026-10-23,expense,Market,10,Alışveriş,09:05\n2026-10-23,expense,Market,10,Alışveriş,14:30\n2026-10-23,expense,Market,10,Alışveriş,14:30";
    const result = importCSV(text, emptyData());
    expect(result.transactions).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });
  it("does not quietly import invalid times as unknown", () => {
    const result = importCSV(
      "date,type,category,amount,time\n2026-10-23,expense,Market,10,25:00",
      emptyData(),
    );
    expect(result.transactions).toHaveLength(0);
    expect(result.errors[0]).toContain("saat");
  });
});
