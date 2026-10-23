import { describe, expect, it } from "vitest";
import {
  buildManualExchange,
  parseExchangeRate,
  exchangeRateInput,
} from "../lib/budget/exchange";
import {
  accountBalance,
  saveExchange,
  deleteTransfer,
  type FinancialAccount,
  type AccountTransfer,
} from "../lib/budget/finance";
import { emptyData, validateData, summarize } from "../lib/budget/model";
import { accountMonthActivity } from "../lib/budget/account-activity";
const date = "2026-10-23";
const account = (
  id: string,
  currency: string,
  openingBalance: number,
): FinancialAccount => ({
  id,
  name: id,
  kind: "bank",
  currency,
  openingBalance,
  openingDate: "2026-10-01",
  archived: false,
});
function data() {
  const d = emptyData();
  d.financialAccounts = [
    account("usd", "USD", 100),
    account("try", "TRY", 1000),
    account("omr", "OMR", 10.005),
  ];
  return d;
}
function transfer(rate = 40.25): AccountTransfer {
  return {
    id: "manual",
    fromId: "usd",
    toId: "try",
    currency: "USD",
    amount: 25,
    date,
    note: "Bank exchange",
    exchange: buildManualExchange(25, "USD", "TRY", date, rate),
  };
}
describe("manually entered bank exchange rates", () => {
  it.each(["40,25", "40.25", " 40,25 "])(
    "accepts a plain comma or decimal rate: %s",
    (text) => expect(parseExchangeRate(text)).toBe(40.25),
  );
  it.each([
    "",
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e2",
    "1.234,56",
    "1,234.56",
    "40.123456789",
    "0.000000001",
    "1000000001",
  ])("rejects ambiguous or invalid manual rates: %s", (text) =>
    expect(parseExchangeRate(text)).toBeNaN(),
  );
  it("uses the bank's USD/TRY rate when selling, without any TCMB snapshot", () => {
    const x = buildManualExchange(25, "USD", "TRY", date, 40.25);
    expect(x).toEqual({
      source: "MANUAL",
      manualRate: 40.25,
      rateDirection: "multiply",
      rate: 40.25,
      toCurrency: "TRY",
      toAmount: 1006.25,
    });
  });
  it("uses the same familiar USD/TRY input when buying USD with TRY", () => {
    const x = buildManualExchange(402.5, "TRY", "USD", date, 40.25);
    expect(x).toMatchObject({
      source: "MANUAL",
      manualRate: 40.25,
      rateDirection: "divide",
      toAmount: 10,
    });
    expect(exchangeRateInput(x, "TRY")).toBe("40,25");
  });
  it("preserves an eight-decimal cross rate and rounds only the target amount", () => {
    const x = buildManualExchange(123.45, "USD", "OMR", date, 0.38451234);
    expect(x.toAmount).toBe(47.468);
    expect(exchangeRateInput(x, "USD")).toBe("0,38451234");
    expect(
      exchangeRateInput(
        buildManualExchange(1000000, "USD", "TRY", date, 0.00000001),
        "USD",
      ),
    ).toBe("0,00000001");
  });
  it("does not strip integer zeros when reopening an entered rate", () =>
    expect(
      exchangeRateInput(buildManualExchange(1, "USD", "TRY", date, 40), "USD"),
    ).toBe("40"));
  it("roundtrips the entered rate in the existing SQL/JSON document format", () => {
    const d = saveExchange(data(), transfer());
    const restored = JSON.parse(JSON.stringify(d));
    expect(validateData(restored)).toBe(true);
    expect(restored.accountTransfers[0].exchange.manualRate).toBe(40.25);
    expect(accountBalance(restored, restored.financialAccounts[0], date)).toBe(
      75,
    );
    expect(accountBalance(restored, restored.financialAccounts[1], date)).toBe(
      2006.25,
    );
    expect(summarize(restored, "2026-10")).toMatchObject({
      income: 0,
      expense: 0,
    });
  });
  it("updates both account history and the receiving balance when the saved bank rate is edited", () => {
    let d = saveExchange(data(), transfer());
    d = saveExchange(d, transfer(41.1));
    expect(d.accountTransfers).toHaveLength(1);
    expect(accountBalance(d, d.financialAccounts![0], date)).toBe(75);
    expect(accountBalance(d, d.financialAccounts![1], date)).toBe(2027.5);
    expect(
      accountMonthActivity(d, d.financialAccounts![1], "2026-10", date).rows[0],
    ).toMatchObject({ amount: 1027.5, balanceAfter: 2027.5 });
    d = deleteTransfer(d, "manual");
    expect(accountBalance(d, d.financialAccounts![1], date)).toBe(1000);
  });
  it.each([
    "zero",
    "negative",
    "infinite",
    "precision",
    "direction",
    "normalised rate",
    "receipt",
    "TCMB quote",
    "unknown source",
  ])("rejects inconsistent manual records at the API validator: %s", (kind) => {
    const t = transfer();
    const x = t.exchange! as any;
    if (kind === "zero") x.manualRate = 0;
    if (kind === "negative") x.manualRate = -1;
    if (kind === "infinite") x.manualRate = Infinity;
    if (kind === "precision") x.manualRate = 40.123456789;
    if (kind === "direction") x.rateDirection = "divide";
    if (kind === "normalised rate") x.rate = 41;
    if (kind === "receipt") x.toAmount = 1;
    if (kind === "TCMB quote")
      x.fromQuote = {
        currency: "USD",
        date,
        unit: 1,
        rate: 40.25,
        side: "buying",
      };
    if (kind === "unknown source") x.source = "BANK";
    expect(validateData({ ...data(), accountTransfers: [t] })).toBe(false);
    expect(() => saveExchange(data(), t)).toThrow();
  });
  it("rejects same-currency conversions and a result rounded to zero", () => {
    expect(() => buildManualExchange(1, "TRY", "TRY", date, 1)).toThrow();
    expect(() => buildManualExchange(0.01, "TRY", "USD", date, 1000)).toThrow();
  });
});
