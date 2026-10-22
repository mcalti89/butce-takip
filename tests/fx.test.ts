import { describe, expect, it } from "vitest";
import { emptyData, summarize, validateData } from "../lib/budget/model";
import {
  CURRENCY_NAMES,
  convertToTry,
  FxQuote,
  quoteForTransaction,
  TCMB_CURRENCY_CODES,
} from "../lib/budget/fx";
import { exportCSV, importCSV } from "../lib/budget/csv";

const quote: FxQuote = {
  date: "2026-10-21",
  currency: "USD",
  currencyName: "ABD doları",
  unit: 1,
  forexBuying: 49.5123,
  forexSelling: 49.6015,
  banknoteBuying: 49.4776,
  banknoteSelling: 49.6759,
  bulletinNo: "2026/199",
};

describe("TCMB döviz dönüşümü", () => {
  it("resmî kur listesinde XDR dahil tüm 22 kod için ad eşlemesi sunar", () => {
    expect(TCMB_CURRENCY_CODES).toHaveLength(22);
    expect(TCMB_CURRENCY_CODES).toContain("XDR");
    expect(CURRENCY_NAMES.XDR).toBe("Özel Çekme Hakkı (SDR)");
  });

  it("income işlemlerinde döviz alışını, expense işlemlerinde döviz satışını seçer", () => {
    expect(quoteForTransaction("income", quote)).toEqual({
      fxRate: 49.5123,
      fxUnit: 1,
      fxDate: "2026-10-21",
      fxSide: "buying",
    });
    expect(quoteForTransaction("expense", quote).fxSide).toBe("selling");
  });

  it("birim sayısını hesaba katar (JPY / 100)", () => {
    expect(
      convertToTry(
        1000,
        {
          ...quote,
          currency: "JPY",
          unit: 100,
          forexBuying: 31.244,
          forexSelling: 31.4509,
        },
        "selling",
      ),
    ).toBe(314.51);
  });

  it("döviz alış/satış değeri boş ise kur varmış gibi işlem yapmaz", () => {
    expect(() =>
      convertToTry(100, { ...quote, forexSelling: null }, "selling"),
    ).toThrow("geçerli TCMB kuru yok");
  });
});

describe("çoklu para birimi veri uyumluluğu", () => {
  it("önceki TRY işlemlerini ve aylık toplamları korur", () => {
    const data = emptyData();
    data.transactions.push({
      id: "old",
      type: "income",
      categoryId: "salary",
      amount: 32000,
      date: "2026-10-01",
      description: "Maaş",
    });
    expect(validateData(data)).toBe(true);
    expect(summarize(data, "2026-10").income).toBe(32000);
  });

  it("yabancı işlem için sabit TRY snapshot'ını toplamda kullanır", () => {
    const data = emptyData();
    data.transactions.push({
      id: "usd",
      type: "expense",
      categoryId: "market",
      amount: 10,
      currency: "USD",
      baseAmount: 496.02,
      fxRate: 49.6015,
      fxUnit: 1,
      fxDate: "2026-10-21",
      fxSide: "selling",
      date: "2026-10-21",
      description: "",
    });
    expect(validateData(data)).toBe(true);
    expect(summarize(data, "2026-10").expense).toBe(496.02);
    data.transactions[0].fxRate = 0;
    expect(validateData(data)).toBe(false);
  });

  it("kur yönünün işlem türüne, bülten tarihinin de işlem gününe uymasını ister", () => {
    const data = emptyData();
    const row = {
      id: "direction-date",
      type: "expense" as const,
      categoryId: "market",
      amount: 10,
      currency: "USD",
      baseAmount: 496.02,
      fxRate: 49.6015,
      fxUnit: 1,
      fxDate: "2026-10-21",
      fxSide: "selling" as "selling" | "buying",
      date: "2026-10-21",
      description: "",
    };
    data.transactions.push(row);
    expect(validateData(data)).toBe(true);
    row.fxSide = "buying";
    expect(validateData(data)).toBe(false);
    row.fxSide = "selling";
    row.fxDate = "2026-10-22";
    expect(validateData(data)).toBe(false);
  });

  it("döviz işlemi CSV dışa/içe aktarımında miktar ve kur snapshot'ını korur", () => {
    const data = emptyData();
    data.transactions.push({
      id: "usd-csv",
      type: "expense",
      categoryId: "market",
      amount: 10,
      currency: "USD",
      baseAmount: 496.02,
      fxRate: 49.6015,
      fxUnit: 1,
      fxDate: "2026-10-21",
      fxSide: "selling",
      date: "2026-10-21",
      description: "Abonelik",
    });
    const imported = importCSV(exportCSV(data), emptyData());
    expect(imported.errors).toEqual([]);
    expect(imported.transactions).toEqual(data.transactions);
  });

  it("eski kur snapshot'sız TRY CSV satırlarını ve şablonu kabul eder", () => {
    const result = importCSV(
      "date,type,category,amount,description\n2026-10-02,expense,Market,12.50,Market",
      emptyData(),
    );
    expect(result.errors).toEqual([]);
    expect(result.transactions[0].currency).toBeUndefined();
  });
});
