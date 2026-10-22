import { describe, expect, it } from "vitest";
import { emptyData, validateData } from "../lib/budget/model";
import { savingsSummary, setSavingsGoal } from "../lib/budget/savings";
import { exportCSV, importCSV } from "../lib/budget/csv";

function fixture(income = 1000, expense = 600) {
  const d = setSavingsGoal(emptyData(), "2026-10", "500");
  if (income)
    d.transactions.push({
      id: "income",
      type: "income",
      categoryId: "salary",
      amount: income,
      date: "2026-10-01",
      description: "",
    });
  if (expense)
    d.transactions.push({
      id: "expense",
      type: "expense",
      categoryId: "market",
      amount: expense,
      date: "2026-10-02",
      description: "",
    });
  return d;
}

describe("Aylık tasarruf hedefi", () => {
  it("eski v1 belge hedef alanı olmadan kabul edilir, hedef icat edilmez", () => {
    const d = fixture();
    delete d.savingsGoals;
    expect(validateData(JSON.parse(JSON.stringify(d)))).toBe(true);
    expect(savingsSummary(d, "2026-10")).toMatchObject({
      target: undefined,
      saved: 400,
      ratio: 0,
      remaining: undefined,
      achieved: false,
    });
  });
  it("pozitif net bakiye ilerleme ve kalan hedefi hesaplar", () => {
    expect(savingsSummary(fixture(), "2026-10")).toMatchObject({
      target: 500,
      saved: 400,
      ratio: 0.8,
      remaining: 100,
      surplus: 0,
      achieved: false,
    });
  });
  it("net eksi olduğunda sıfır ilerleme ve net açık korunur", () => {
    expect(savingsSummary(fixture(600, 1000), "2026-10")).toMatchObject({
      net: -400,
      saved: 0,
      ratio: 0,
      remaining: 500,
      achieved: false,
    });
  });
  it("tam hedefte kalan sıfır ve hedef tamamlandı", () => {
    expect(savingsSummary(fixture(1000, 500), "2026-10")).toMatchObject({
      saved: 500,
      ratio: 1,
      remaining: 0,
      surplus: 0,
      achieved: true,
    });
  });
  it("hedef aşıldığında kalan negatif olmaz; aşan tutar ve yüzde korunur", () => {
    expect(savingsSummary(fixture(1000, 200), "2026-10")).toMatchObject({
      saved: 800,
      ratio: 1.6,
      remaining: 0,
      surplus: 300,
      achieved: true,
    });
  });
  it("hedef ve işlemler aya özeldir", () => {
    const d = fixture();
    expect(savingsSummary(d, "2026-11")).toMatchObject({
      target: undefined,
      saved: 0,
    });
    const next = setSavingsGoal(d, "2026-11", "150");
    expect(next.savingsGoals).toEqual({ "2026-10": 500, "2026-11": 150 });
    expect(savingsSummary(next, "2026-11")).toMatchObject({
      saved: 0,
      remaining: 150,
    });
  });
  it("kuruşları kayıpsız gösterir ve hedef güncellemesi işlemleri/bütçeleri değiştirmez", () => {
    const d = fixture(10.2, 5.15);
    d.budgets["2026-10"] = { market: 7 };
    const next = setSavingsGoal(d, "2026-10", "5,10");
    expect(savingsSummary(next, "2026-10")).toMatchObject({
      saved: 5.05,
      remaining: 0.05,
    });
    expect(next.transactions).toBe(d.transactions);
    expect(next.budgets).toBe(d.budgets);
    expect(d.savingsGoals?.["2026-10"]).toBe(500);
  });
  it("yalnızca seçili hedefi kaldırır", () => {
    const d = setSavingsGoal(fixture(), "2026-11", "600");
    const next = setSavingsGoal(d, "2026-10", null);
    expect(next.savingsGoals).toEqual({ "2026-11": 600 });
    expect(next.transactions).toBe(d.transactions);
  });
  it.each(["", "0", "-1", "abc", "Infinity", "1.234", "1e3", "9999999999"])(
    "hatalı %s hedefi kaydedilmez",
    (input) => {
      const d = fixture();
      expect(() => setSavingsGoal(d, "2026-10", input)).toThrow();
      expect(d.savingsGoals?.["2026-10"]).toBe(500);
    },
  );
  it.each(["2026-13", "2026-00", "2026-1", "oops"])(
    "geçersiz ay %s reddedilir",
    (month) => expect(() => setSavingsGoal(emptyData(), month, "10")).toThrow(),
  );
  it.each([
    null,
    [],
    { "2026-13": 1 },
    { "2026-10": 0 },
    { "2026-10": -1 },
    { "2026-10": Infinity },
    { "2026-10": "10" },
    { "2026-10": 1.234 },
  ])("hatalı hedef haritası doğrulanmaz: %j", (value) =>
    expect(validateData({ ...emptyData(), savingsGoals: value })).toBe(false),
  );
  it("yerel JSON yazma/okumada hedeflerle önceki işlemler korunur", () => {
    const d = fixture();
    const reloaded = JSON.parse(JSON.stringify(d));
    expect(validateData(reloaded)).toBe(true);
    expect(reloaded).toEqual(d);
    expect(savingsSummary(reloaded, "2026-10").remaining).toBe(100);
  });
  it("CSV dışa aktarma hedef alanı içermez ve mevcut hedefi değiştirmez", () => {
    const d = fixture();
    const csv = exportCSV(d);
    const result = importCSV(csv, d);
    expect(csv).not.toContain("savingsGoals");
    expect(result.errors).toEqual([]);
    expect(d.savingsGoals).toEqual({ "2026-10": 500 });
  });
});
