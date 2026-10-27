import { describe, expect, it } from "vitest";
import {
  compareAccountIban,
  saveAccountIdentity,
} from "../lib/budget/account-identity";
import { emptyData, validateData } from "../lib/budget/model";
const iban = "TR330006100519786457841326";
const fixture = () => ({
  ...emptyData(),
  financialAccounts: [
    {
      id: "bank",
      name: "Maaş hesabı",
      kind: "bank" as const,
      currency: "TRY",
      openingBalance: 1500,
      openingDate: "2026-01-01",
      archived: false,
    },
  ],
});
describe("Bank identity during receipt import", () => {
  it("compares normalized IBANs without claiming a match for missing information", () => {
    expect(compareAccountIban(iban, "tr33 0006 1005 1978 6457 8413 26")).toBe(
      "match",
    );
    expect(compareAccountIban(iban, "GB82WEST12345698765432")).toBe("mismatch");
    expect(compareAccountIban(undefined, iban)).toBe("missing");
    expect(compareAccountIban(iban, undefined)).toBe("unread");
  });
  it("saves normalized identity while preserving the latest balance and all other account fields", () => {
    const data = fixture();
    const saved = saveAccountIdentity(
      data,
      "bank",
      " Enpara ",
      "tr33 0006 1005 1978 6457 8413 26",
    );
    expect(saved.financialAccounts?.[0]).toEqual({
      ...data.financialAccounts[0],
      bankName: "Enpara",
      iban,
    });
    expect(data.financialAccounts[0]).not.toHaveProperty("iban");
    expect(validateData(saved)).toBe(true);
    expect(
      saveAccountIdentity(saved, "bank", "", "").financialAccounts?.[0].iban,
    ).toBeUndefined();
  });
  it("rejects invalid identifiers, missing accounts and archived accounts", () => {
    expect(() =>
      saveAccountIdentity(fixture(), "bank", "Test", "TR123"),
    ).toThrow("IBAN");
    expect(() =>
      saveAccountIdentity(fixture(), "bank", "a".repeat(81), ""),
    ).toThrow("80");
    expect(() =>
      saveAccountIdentity(fixture(), "missing", "Test", iban),
    ).toThrow("bulunamıyor");
    const data = fixture();
    data.financialAccounts[0].archived = true;
    expect(() => saveAccountIdentity(data, "bank", "Test", iban)).toThrow(
      "arşivden",
    );
  });
});
