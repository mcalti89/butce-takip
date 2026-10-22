import { describe, expect, it } from "vitest";
import {
  demoData,
  emptyData,
  insights,
  monthKey,
  parseAmount,
  shiftMonth,
  summarize,
  trend,
  validDate,
  validateData,
} from "../lib/budget/model";
import { exportCSV, importCSV } from "../lib/budget/csv";
describe("Bütçe hesaplamaları", () => {
  it("boş veri, sıfır bakiye ve boş trend", () => {
    const d = emptyData();
    expect(summarize(d, "2026-10").net).toBe(0);
    expect(trend(d, "2026-10")).toHaveLength(6);
    expect(trend(d, "2026-10").every((r) => r.expense === 0)).toBe(true);
    expect(insights(d, "2026-10")[0].title).toContain("kayıtlarınla");
  });
  it("örnek gelir, kategori gideri ve %32 bütçe aşımı gerçek kayıtlardan hesaplanır", () => {
    const d = demoData();
    const s = summarize(d, monthKey());
    expect(s.income).toBe(35500);
    expect(s.categories.find((c) => c.id === "dining")?.spent).toBe(2640);
    expect(s.categories.find((c) => c.id === "dining")?.remaining).toBe(-640);
    expect(
      insights(d, monthKey()).some(
        (i) => i.title === "Dışarıda yemek bütçeyi %32 aştı",
      ),
    ).toBe(true);
    expect(s.net).toBe(s.income - s.expense);
    expect(validateData(d)).toBe(true);
  });
  it("bütçeler aya özeldir", () => {
    const d = emptyData();
    d.budgets["2026-10"] = { market: 100 };
    expect(summarize(d, "2026-10").categories[0].budget).toBe(100);
    expect(summarize(d, "2026-11").categories[0].budget).toBeUndefined();
  });
  it("limiti olmayan gider kalan toplamdan düşmez", () => {
    const d = emptyData();
    d.budgets["2026-10"] = { market: 100 };
    d.transactions = [
      {
        id: "1",
        type: "expense",
        categoryId: "dining",
        amount: 50,
        date: "2026-10-02",
        description: "",
      },
    ];
    expect(summarize(d, "2026-10").budgetRemaining).toBe(100);
    expect(summarize(d, "2026-10").expense).toBe(50);
  });
  it("sıfır bütçe aşımında yüzde sonsuzluğu üretilmez", () => {
    const d = emptyData();
    d.budgets["2026-10"] = { dining: 0 };
    d.transactions = [
      {
        id: "1",
        type: "expense",
        categoryId: "dining",
        amount: 1,
        date: "2026-10-02",
        description: "",
      },
    ];
    expect(insights(d, "2026-10")[0].title).toBe(
      "Dışarıda yemek sıfır bütçeyi aştı",
    );
  });
  it("ay kaydırma yıl sınırlarını ve altı aylık aralığı korur", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(trend(emptyData(), "2026-01")[0].key).toBe("2025-08");
  });
  it.each(["2026-02-30", "2026-13-01", "2026-1-01", "oops"])(
    "geçersiz tarih %s",
    (v) => expect(validDate(v)).toBe(false),
  );
  it.each([
    ["450,50", 450.5],
    ["1.234,56", 1234.56],
    ["1234.56", 1234.56],
    ["1,234.56", 1234.56],
    ["₺ 500", 500],
  ])("tutar %s", (v, n) => expect(parseAmount(v)).toBe(n));
  it.each(["-10", "0", "abc", "Infinity", "4.555", "1e3", "9999999999"])(
    "geçersiz tutar %s",
    (v) => expect(parseAmount(v)).toBeNaN(),
  );
  it("bozuk yerel veri reddedilir", () => {
    expect(validateData({})).toBe(false);
    const d = emptyData();
    d.budgets["2026-10"] = { unknown: 3 };
    expect(validateData(d)).toBe(false);
  });
});
describe("CSV doğrulama ve taşınabilirlik", () => {
  it("UTF-8 BOM, Türkçe açıklama, tırnak, virgül ve çok satırlı alanlar kayıpsız taşınır", () => {
    const d = emptyData();
    d.transactions = [
      {
        id: "t1",
        type: "expense",
        categoryId: "market",
        amount: 124.56,
        date: "2026-10-16",
        description: 'İçecek, "meyve"\nİkinci satır',
      },
    ];
    const result = importCSV(exportCSV(d), emptyData());
    expect(result.errors).toEqual([]);
    expect(result.transactions).toEqual(d.transactions);
  });
  it("Türkçe başlıklar, noktalı virgül ve ondalık virgül desteklenir", () => {
    const r = importCSV(
      "tarih;tür;kategori;tutar;açıklama\n2026-10-01;gider;Market;42,50;Meyve",
      emptyData(),
    );
    expect(r.errors).toEqual([]);
    expect(r.transactions[0].amount).toBe(42.5);
  });
  it("yeni kategori otomatik oluşturulur", () => {
    const r = importCSV(
      "date,type,category,amount\n2026-10-01,expense,Eğitim,500",
      emptyData(),
    );
    expect(r.categories.some((c) => c.name === "Eğitim")).toBe(true);
    expect(r.transactions).toHaveLength(1);
  });
  it("tekrarlı aynı kimlikler ve aynı alanlar atlanır", () => {
    const d = demoData();
    const r = importCSV(exportCSV(d), d);
    expect(r.transactions).toHaveLength(0);
    expect(r.skipped).toBe(d.transactions.length);
  });
  it("dosya içindeki aynı işlemler atlanır", () => {
    const r = importCSV(
      "date,type,category,amount\n2026-10-01,expense,Market,50\n2026-10-01,expense,Market,50",
      emptyData(),
    );
    expect(r.transactions).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
  it("hatalı satırlar listelenir ve geçerli satırlar ayrı önizlenir", () => {
    const r = importCSV(
      "date,type,category,amount\n2026-02-30,expense,Market,50\n2026-10-01,expense,Market,-2\n2026-10-01,income,Maaş,200",
      emptyData(),
    );
    expect(r.errors).toHaveLength(2);
    expect(r.transactions).toHaveLength(1);
  });
  it("eksik başlık ve açık tırnak reddedilir", () => {
    expect(importCSV("a,b\n1,2", emptyData()).errors).toHaveLength(1);
    expect(
      importCSV('date,type,category,amount\n"oops', emptyData()).errors,
    ).toHaveLength(1);
  });
  it("elektronik tablo formül enjeksiyonu dışa aktarımda güvenli ve tekrar okunabilir", () => {
    const d = emptyData();
    d.transactions = [
      {
        id: "t1",
        type: "expense",
        categoryId: "market",
        amount: 5,
        date: "2026-10-01",
        description: "=SUM(1,2)",
      },
    ];
    const csv = exportCSV(d);
    expect(csv).toContain("'=SUM");
    expect(importCSV(csv, emptyData()).transactions[0].description).toBe(
      "=SUM(1,2)",
    );
  });
  it("10.000 satır sınırı aşımı reddedilir", () => {
    const text =
      "date,type,category,amount\n" +
      "2026-10-01,expense,Market,50\n".repeat(10001);
    expect(importCSV(text, emptyData()).errors[0]).toContain("10.000");
  });
});
