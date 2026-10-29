import { describe, it, expect } from "vitest";
import {
  analyzeExpensePhoto,
  photoCategory,
} from "../lib/budget/photo-expense";
import { photoPdf } from "../lib/budget/photo-pdf";
import { emptyData } from "../lib/budget/model";
const data = emptyData();
describe("Photo receipt extraction", () => {
  it("reads a Turkish merchant and total, excluding line items, VAT and change", () => {
    const text =
      "MIGROS TICARET A.S.\nTARIH: 29.10.2026 SAAT: 13:45\nEKMEK 30,00 TL\nSUT 45,50 TL\nARA TOPLAM 75,50 TL\nTOPLAM KDV 5,50 TL\nGENEL TOPLAM *75,50 TL\nNAKIT 100,00 TL\nPARA USTU 24,50 TL";
    expect(analyzeExpensePhoto(text, data)).toMatchObject({
      merchant: "MIGROS TICARET A.S.",
      amount: 75.5,
      currency: "TRY",
      date: "2026-10-29",
      time: "13:45",
      categoryId: "market",
    });
  });
  it("reads English OMR totals to three decimals", () => {
    expect(
      analyzeExpensePhoto(
        "LULU HYPERMARKET\nDATE: 2026-10-29 TIME: 09:30\nSUBTOTAL 10.000 OMR\nVAT 0.500 OMR\nTOTAL AMOUNT 10.500 OMR\nCHANGE 9.500 OMR",
        data,
      ),
    ).toMatchObject({
      merchant: "LULU HYPERMARKET",
      amount: 10.5,
      currency: "OMR",
      date: "2026-10-29",
      time: "09:30",
      categoryId: "market",
    });
  });
  it("recognizes a cafe and uses the food category instead of first arbitrary category", () => {
    expect(
      analyzeExpensePhoto("STARBUCKS COFFEE\nTOTAL 125.50 TL", data).categoryId,
    ).toBe("dining");
  });
  it("handles amount and date labels on separate rows", () => {
    expect(
      analyzeExpensePhoto(
        "YILDIZ ECZANE\nTARIH\n29/10/26\nGENEL TOPLAM\n250,00 TL",
        data,
      ),
    ).toMatchObject({
      merchant: "YILDIZ ECZANE",
      amount: 250,
      currency: "TRY",
      date: "2026-10-29",
      categoryId: "health",
    });
  });
  it("does not turn VAT, discounts, subtotals, or quantities into expenses", () => {
    expect(
      analyzeExpensePhoto(
        "MARKET\nARA TOPLAM 100 TL\nTOPLAM KDV 20 TL\nTOPLAM ADET 5\nTOTAL DISCOUNT 10 TL\nCHANGE 50 TL",
        data,
      ).amount,
    ).toBeUndefined();
  });
  it("leaves contradictory totals, dates and blank photos for manual review", () => {
    expect(
      analyzeExpensePhoto(
        "MARKET\nTOPLAM 100 TL\nTOPLAM 200 TL\nTARIH 29.10.2026\nTARIH 28.10.2026",
        data,
      ),
    ).toMatchObject({ amount: undefined, date: undefined });
    const s = analyzeExpensePhoto("", data);
    expect(s.amount).toBeUndefined();
    expect(s.date).toBeUndefined();
    expect(s.time).toBeUndefined();
    expect(s.warnings.join()).toContain("Okunabilir");
  });
  it("does not infer a currency from account balances or silently fabricate missing times", () => {
    const s = analyzeExpensePhoto("SOME SHOP\nTOTAL 15.50", data);
    expect(s.amount).toBe(15.5);
    expect(s.currency).toBeUndefined();
    expect(s.time).toBeUndefined();
    expect(s.warnings.join()).toContain("Para birimi");
  });
  it("leaves negative or ambiguous unlabelled three-decimal totals for manual review", () => {
    expect(
      analyzeExpensePhoto("SHOP\nTOTAL -50.00 TL", data).amount,
    ).toBeUndefined();
    expect(
      analyzeExpensePhoto("SHOP\nTOTAL 1.234", data).amount,
    ).toBeUndefined();
    expect(analyzeExpensePhoto("SHOP\nTOTAL 1.234 OMR", data).amount).toBe(
      1.234,
    );
  });
  it("does not salvage a partial OCR number as a smaller false total", () => {
    expect(
      analyzeExpensePhoto("SHOP\nTOTAL 75, 50 TL", data).amount,
    ).toBeUndefined();
    expect(
      analyzeExpensePhoto("SHOP\nTOTAL -75.50 1 TL", data).amount,
    ).toBeUndefined();
  });
  it("does not label arbitrary shops as groceries", () => {
    expect(photoCategory(data, "UNKNOWN SHOP", "TOTAL 25 TL")).toMatchObject({
      id: "other",
      guessed: false,
    });
  });
});
describe("Private photo PDF attachment", () => {
  it("creates binary-safe streams and accurate cross-reference offsets", () => {
    const jpg = Uint8Array.from([255, 216, 0, 200, 130, 255, 217]),
      bytes = photoPdf(jpg, 500, 1000),
      text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Width 500 /Height 1000");
    expect(text).toContain("/MediaBox [0 0 595 1190]");
    expect(text).toContain("/Length 7 >>");
    const xref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(new TextDecoder().decode(bytes.slice(xref, xref + 4))).toBe("xref");
    const rows = text.slice(xref).split("\n").slice(3, 8);
    for (let i = 0; i < 5; i++) {
      const offset = Number(rows[i].slice(0, 10));
      expect(new TextDecoder().decode(bytes.slice(offset, offset + 7))).toBe(
        `${i + 1} 0 obj`,
      );
    }
  });
  it("rejects invalid image dimensions and non-JPEG input", () => {
    expect(() => photoPdf(new Uint8Array(), 1, 1)).toThrow();
    expect(() => photoPdf(new Uint8Array([255, 216]), 0, 0)).toThrow();
  });
});
