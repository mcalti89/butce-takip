import { expect, it } from "vitest";
import { emptyData } from "../lib/budget/model";
import { importCSV } from "../lib/budget/csv";
it("aynı ID ile atlanan CSV satırı yeni kategori oluşturmaz", () => {
  const d = emptyData();
  d.transactions = [
    {
      id: "same",
      type: "expense",
      categoryId: "market",
      amount: 50,
      date: "2026-10-01",
      description: "",
    },
  ];
  const result = importCSV(
    "id,date,type,category,amount\nsame,2026-10-02,expense,Yetim kategori,60\nnew,2026-10-03,expense,Market,70",
    d,
  );
  expect(result.transactions).toHaveLength(1);
  expect(result.skipped).toBe(1);
  expect(result.categories).toHaveLength(d.categories.length);
  expect(result.categories.some((c) => c.name === "Yetim kategori")).toBe(
    false,
  );
});
