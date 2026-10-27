import { describe, it, expect } from "vitest";
import {
  analyzeReceipt,
  parseReceiptAmount,
  importedDuplicate,
} from "../lib/budget/receipt-import";
import { validIban } from "../lib/budget/bank-identity";
import { emptyData, validateData } from "../lib/budget/model";
import type { FinancialAccount } from "../lib/budget/finance";
const sender = "TR330006100519786457841326",
  recipient = "GB82WEST12345698765432";
const bank = (
  id: string,
  name = "Enpara TL",
  currency = "TRY",
  iban?: string,
): FinancialAccount => ({
  id,
  name,
  currency,
  iban,
  kind: "bank",
  openingBalance: 0,
  openingDate: "2026-01-01",
  archived: false,
});
const receipt = `Enpara\nGiden EFT\nGönderen IBAN: ${sender}\nAlıcı IBAN: ${recipient}\nİşlem Tutarı: 2.000,00 TL\nMasraf Tutarı: 5,00 TL\nBakiye: 90.000,00 TL\nİşlem Tarihi: 26.10.2026 14:43:22\nBasım Tarihi: 27.10.2026 09:00\nAçıklama: Ekim aidatı\nReferans: EFT-12345`;
describe("Receipt transaction extraction", () => {
  it("extracts operation amount/date/time and ignores bank fee, balance and print date", () => {
    expect(
      analyzeReceipt(receipt, [bank("own", undefined, undefined, sender)]),
    ).toMatchObject({
      bank: "Enpara",
      amount: 2000,
      currency: "TRY",
      date: "2026-10-26",
      time: "14:43",
      mode: "expense",
      accountId: "own",
      description: "Ekim aidatı",
      reference: "EFT-12345",
    });
  });
  it("identifies incoming credit using registered beneficiary IBAN", () => {
    expect(
      analyzeReceipt(receipt, [bank("own", "UK", "GBP", recipient)]),
    ).toMatchObject({ mode: "income", accountId: "own" });
  });
  it("identifies own-account transfers and cross currency exchange", () => {
    expect(
      analyzeReceipt(receipt, [
        bank("a", undefined, undefined, sender),
        bank("b", "Other", "TRY", recipient),
      ]),
    ).toMatchObject({ mode: "transfer", fromId: "a", toId: "b" });
    expect(
      analyzeReceipt(receipt, [
        bank("a", undefined, undefined, sender),
        bank("b", "UK", "GBP", recipient),
      ]),
    ).toMatchObject({ mode: "exchange" });
  });
  it("never picks one of multiple bank accounts or an arbitrary cash account", () => {
    expect(
      analyzeReceipt(receipt, [bank("a"), bank("b")]).accountId,
    ).toBeUndefined();
    expect(
      analyzeReceipt(receipt, [{ ...bank("cash"), kind: "cash" }]).accountId,
    ).toBeUndefined();
  });
  it("leaves conflicting amounts and unknown direction empty", () => {
    const result = analyzeReceipt(
      "Enpara\nİşlem tutarı: 50,00 TL\nİşlem tutarı: 60,00 TL",
      [],
    );
    expect(result.amount).toBeUndefined();
    expect(result.mode).toBeUndefined();
  });
  it("reads labels on separate rows and keeps OMR baisa precision", () => {
    expect(
      analyzeReceipt(
        "Bank Muscat\nOutgoing transfer\nTransaction Amount\n1,234.567 OMR\nTransaction Date\n2026-10-26\nTransaction Time\n12:34",
        [bank("om", "Bank Muscat", "OMR")],
      ),
    ).toMatchObject({
      amount: 1234.567,
      currency: "OMR",
      date: "2026-10-26",
      time: "12:34",
      mode: "expense",
      accountId: "om",
    });
  });
  it("treats image PDFs as manual input without fabricated dates or amounts", () => {
    expect(analyzeReceipt("", [])).toMatchObject({
      date: undefined,
      time: undefined,
      mode: undefined,
    });
    expect(analyzeReceipt("", []).amount).toBeUndefined();
    expect(analyzeReceipt("", []).warnings.join()).toContain("Taranmış");
  });
  it.each([
    ["2.000,50", "TRY", 2000.5],
    ["2,000.50", "USD", 2000.5],
    ["2.000", "TRY", 2000],
    ["2.001", "OMR", 2.001],
    ["0.001", "OMR", 0.001],
    ["12,3,4", "TRY", undefined],
    ["0", "TRY", undefined],
  ])("parses %s in %s", (value, currency, expected) =>
    expect(parseReceiptAmount(value as string, currency as string)).toBe(
      expected,
    ),
  );
  it("validates IBAN checksums", () => {
    expect(validIban(sender)).toBe(true);
    expect(validIban(recipient)).toBe(true);
    expect(validIban(sender.slice(0, -1) + "7")).toBe(false);
  });
  it("detects exact files across transactions and transfers and reference/date matches", () => {
    const data = emptyData();
    const source = {
      sha256: "a".repeat(64),
      bank: "Enpara",
      reference: "EFT-12345",
    };
    data.transactions = [
      {
        id: "t",
        type: "expense",
        categoryId: data.categories.find((c) => c.type === "expense")!.id,
        description: "",
        amount: 2000,
        date: "2026-10-26",
        receiptImport: source,
      },
    ];
    expect(importedDuplicate(data, source)?.value.id).toBe("t");
    expect(
      importedDuplicate(
        data,
        { ...source, sha256: "b".repeat(64) },
        "2026-10-26",
      )?.value.id,
    ).toBe("t");
    expect(
      importedDuplicate(
        data,
        { ...source, sha256: "b".repeat(64) },
        "2026-10-25",
      ),
    ).toBeUndefined();
    expect(validateData(data)).toBe(true);
    data.accountTransfers = [
      {
        id: "x",
        currency: "TRY",
        fromId: "a",
        toId: "b",
        amount: 1,
        date: "2026-10-26",
        note: "",
        receiptImport: { sha256: "c".repeat(64) },
      },
    ];
    expect(importedDuplicate(data, { sha256: "c".repeat(64) })?.kind).toBe(
      "transfer",
    );
  });
});
