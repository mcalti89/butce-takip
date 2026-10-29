import { describe, expect, it } from "vitest";
import {
  categoryUsage,
  removeCategory,
  saveCategory,
} from "../lib/budget/categories";
import {
  emptyData,
  summarize,
  validateData,
  type Category,
} from "../lib/budget/model";
const custom: Category = {
  id: "school",
  name: "Eğitim",
  type: "expense",
  color: "#60A5FA",
  icon: "tag",
};
function usedData() {
  const d = emptyData();
  d.categories.push(custom);
  d.transactions = [
    {
      id: "omr",
      type: "expense",
      categoryId: "school",
      amount: 2.751,
      currency: "OMR",
      baseAmount: 277.85,
      fxRate: 101,
      fxUnit: 1,
      fxDate: "2026-10-01",
      fxSide: "selling",
      date: "2026-10-01",
      time: "14:30",
      description: "Kitap",
    },
  ];
  d.paymentPlans = [
    {
      id: "plan",
      title: "Okul",
      type: "expense",
      kind: "monthly",
      categoryId: "school",
      currency: "TRY",
      amount: 100,
      startDate: "2026-10-01",
      archived: false,
    },
    {
      id: "old",
      title: "Eski okul",
      type: "expense",
      kind: "once",
      categoryId: "school",
      currency: "TRY",
      amount: 50,
      startDate: "2026-09-01",
      archived: true,
    },
  ];
  d.budgets = {
    "2026-09": { school: 0 },
    "2026-10": { school: 100.1, market: 200.2 },
    "2026-11": { school: 400 },
  };
  return d;
}
describe("personal category management", () => {
  it("adds normalized personal categories without modifying default categories", () => {
    const d = emptyData();
    const r = saveCategory(d, { ...custom, name: "  Okul   masrafı  " });
    expect(r.categories.at(-1)?.name).toBe("Okul masrafı");
    expect(d.categories.some((c) => c.id === custom.id)).toBe(false);
    expect(validateData(r)).toBe(true);
  });
  it("rejects duplicates case-insensitively in Turkish within the same type", () => {
    const d = saveCategory(emptyData(), { ...custom, name: "EĞİTİM" });
    expect(() =>
      saveCategory(d, { ...custom, id: "second", name: "  eğitim " }),
    ).toThrow("zaten var");
  });
  it("allows the same name for separate income and expense types", () => {
    const d = saveCategory(emptyData(), custom);
    expect(() =>
      saveCategory(d, { ...custom, id: "income-school", type: "income" }),
    ).not.toThrow();
  });
  it.each(["", " ", "a".repeat(41)])(
    "rejects invalid category names",
    (name) => {
      expect(() => saveCategory(emptyData(), { ...custom, name })).toThrow();
    },
  );
  it("renames, recolors and changes the icon of an existing category without rewriting financial amounts or IDs", () => {
    const d = usedData();
    const r = saveCategory(d, {
      ...custom,
      name: "Çocukların eğitimi",
      color: "#22C55E",
      icon: "book-open",
    });
    expect(r.transactions).toEqual(d.transactions);
    expect(r.paymentPlans).toEqual(d.paymentPlans);
    expect(r.categories.find((c) => c.id === "school")).toMatchObject({
      name: "Çocukların eğitimi",
      color: "#22C55E",
      icon: "book-open",
    });
    expect(validateData(r)).toBe(true);
  });
  it("rejects unavailable icons instead of saving a broken glyph", () => {
    expect(() =>
      saveCategory(emptyData(), { ...custom, icon: "not-an-icon" }),
    ).toThrow("simge");
    expect(() =>
      saveCategory(usedData(), { ...custom, icon: "not-an-icon" }),
    ).toThrow("simge");
  });
  it("preserves an existing imported icon when only the name changes", () => {
    const d = usedData();
    d.categories.find((c) => c.id === custom.id)!.icon = "sparkles";
    const r = saveCategory(d, { ...custom, name: "Okul", icon: "sparkles" });
    expect(r.categories.find((c) => c.id === custom.id)?.icon).toBe("sparkles");
    expect(r.budgets).toEqual(d.budgets);
  });
  it("prevents changing the type of an existing category", () => {
    expect(() =>
      saveCategory(usedData(), { ...custom, type: "income" }),
    ).toThrow("türü değiştirilemez");
  });
  it("removes unused categories directly, including default categories", () => {
    const d = emptyData();
    const r = removeCategory(d, "health");
    expect(r.categories.some((c) => c.id === "health")).toBe(false);
    expect(r.transactions).toEqual(d.transactions);
    expect(validateData(r)).toBe(true);
  });
  it("requires an explicit same-type target for every referenced category", () => {
    expect(() => removeCategory(usedData(), "school")).toThrow(
      "taşıma kategorisi",
    );
    expect(() => removeCategory(usedData(), "school", "salary")).toThrow();
    expect(() => removeCategory(usedData(), "school", "school")).toThrow();
  });
  it("atomically moves all transactions, active/archived plans and limits while preserving totals", () => {
    const d = usedData(),
      before = structuredClone(d);
    const r = removeCategory(d, "school", "market");
    expect(r.transactions[0]).toEqual({
      ...d.transactions[0],
      categoryId: "market",
    });
    expect(r.paymentPlans?.every((p) => p.categoryId === "market")).toBe(true);
    expect(r.budgets).toEqual({
      "2026-09": { market: 0 },
      "2026-10": { market: 300.3 },
      "2026-11": { market: 400 },
    });
    expect(summarize(r, "2026-10").income).toBe(summarize(d, "2026-10").income);
    expect(summarize(r, "2026-10").expense).toBe(277.85);
    expect(summarize(r, "2026-10").budgetTotal).toBe(
      summarize(d, "2026-10").budgetTotal,
    );
    expect(validateData(r)).toBe(true);
    expect(d).toEqual(before);
  });
  it("treats a zero budget as a reference instead of discarding it", () => {
    const d = emptyData();
    d.budgets = { "2026-10": { health: 0 } };
    expect(categoryUsage(d, "health").budgetMonths).toBe(1);
    expect(() => removeCategory(d, "health")).toThrow();
    expect(
      removeCategory(d, "health", "market").budgets["2026-10"].market,
    ).toBe(0);
  });
  it("retains at least one category of each type", () => {
    const d = emptyData();
    d.categories = d.categories.filter(
      (c) => c.type === "expense" || c.id === "salary",
    );
    expect(() => removeCategory(d, "salary")).toThrow("en az bir");
  });
  it("rechecks current document references, rather than trusting an earlier usage count", () => {
    const d = emptyData();
    expect(categoryUsage(d, "health").transactions).toBe(0);
    d.transactions.push({
      id: "late",
      type: "expense",
      categoryId: "health",
      amount: 10,
      date: "2026-10-01",
      description: "Yeni kayıt",
    });
    expect(() => removeCategory(d, "health")).toThrow();
    expect(
      removeCategory(d, "health", "market").transactions[0].categoryId,
    ).toBe("market");
  });
  it("does not create optional plan arrays on legacy documents", () => {
    const d = emptyData();
    delete d.paymentPlans;
    expect(removeCategory(d, "health").paymentPlans).toBeUndefined();
  });
});
