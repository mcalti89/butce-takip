import { describe, expect, it } from "vitest";
import {
  emptyData,
  summarize,
  validateData,
  type Transaction,
  type BudgetData,
} from "../lib/budget/model";
import { isPristineBudget } from "../lib/budget/account";
import {
  accountBalance,
  cardDates,
  deleteTransfer,
  installmentAmount,
  monthlyDate,
  paymentOccurrences,
  pendingInstallments,
  saveFinancialAccount,
  saveTransfer,
  setAccountArchived,
  type FinancialAccount,
  type PaymentPlan,
} from "../lib/budget/finance";
const bank: FinancialAccount = {
  id: "bank",
  name: "Banka",
  kind: "bank",
  currency: "TRY",
  openingBalance: 1000,
  openingDate: "2026-01-01",
  archived: false,
};
const cash: FinancialAccount = {
  ...bank,
  id: "cash",
  name: "Nakit",
  kind: "cash",
  openingBalance: 0,
};
const card: FinancialAccount = {
  ...bank,
  id: "card",
  name: "Kart",
  kind: "card",
  openingBalance: 0,
  creditLimit: 10000,
  statementDay: 15,
  paymentDay: 25,
};
const transaction: Transaction = {
  id: "spend",
  type: "expense",
  categoryId: "market",
  amount: 300,
  date: "2026-01-20",
  description: "Test",
  currency: "TRY",
  baseAmount: 300,
};
function data() {
  return {
    ...emptyData(),
    financialAccounts: [{ ...bank }, { ...cash }, { ...card }],
  };
}
function plan(overrides: Partial<PaymentPlan> = {}): PaymentPlan {
  return {
    id: "plan",
    title: "Plan",
    kind: "monthly",
    type: "expense",
    amount: 100,
    currency: "TRY",
    categoryId: "housing",
    startDate: "2026-01-31",
    archived: false,
    ...overrides,
  };
}
describe("Hesaplar, transferler ve plan muhasebesi", () => {
  it("arşivlenmiş planın gerçekleşmiş dönemi takvimde korunur", () => {
    const p = plan({ archived: true });
    const d = {
      ...data(),
      paymentPlans: [p],
      transactions: [
        { ...transaction, categoryId: "housing", planId: "plan", planIndex: 0 },
      ],
    };
    const periods = paymentOccurrences(d, "2026-01-01", "2026-03-31");
    expect(periods).toHaveLength(1);
    expect(periods[0].transaction?.id).toBe("spend");
  });
  it("arşivli hesabın bakiyesini değiştiren eski transfer silme API'de de reddedilir", () => {
    let d = saveTransfer(data(), {
      id: "out",
      fromId: "bank",
      toId: "cash",
      amount: 10,
      currency: "TRY",
      date: "2026-01-10",
      note: "",
    });
    d = saveTransfer(d, {
      id: "back",
      fromId: "cash",
      toId: "bank",
      amount: 10,
      currency: "TRY",
      date: "2026-01-11",
      note: "",
    });
    d = setAccountArchived(d, "cash", true, "2026-02-01");
    expect(validateData(d)).toBe(true);
    expect(() => deleteTransfer(d, "out")).toThrow();
    expect(
      validateData({
        ...d,
        accountTransfers: d.accountTransfers!.filter((t) => t.id !== "out"),
      }),
    ).toBe(false);
  });

  it("eski sürüm belgesi hesap atamadan geçerli kalır ve raporu değişmez", () => {
    const d = emptyData();
    delete d.financialAccounts;
    delete d.accountTransfers;
    delete d.paymentPlans;
    d.transactions = [transaction];
    expect(validateData(d)).toBe(true);
    expect(summarize(d, "2026-01").expense).toBe(300);
  });
  it("yeni hesaplar açılış bakiyesini gelir olarak raporlamaz; hesapsız eski işlemler bakiyeye eklenmez", () => {
    const d = { ...data(), transactions: [transaction] };
    expect(accountBalance(d, bank, "2026-02-01")).toBe(1000);
    expect(summarize(d, "2026-01").income).toBe(0);
    expect(summarize(d, "2026-01").expense).toBe(300);
  });
  it("hesaba atanmış gelir ve gider doğru tarihte bakiyeye yansır", () => {
    const d = {
      ...data(),
      transactions: [
        { ...transaction, accountId: "bank" },
        {
          ...transaction,
          id: "income",
          type: "income" as const,
          categoryId: "salary",
          amount: 500,
          accountId: "bank",
          date: "2026-02-01",
        },
      ],
    };
    expect(accountBalance(d, bank, "2025-12-31")).toBe(0);
    expect(accountBalance(d, bank, "2026-01-31")).toBe(700);
    expect(accountBalance(d, bank, "2026-02-01")).toBe(1200);
  });
  it("transfer iki bakiyeyi dengeli etkiler, gelir/gider veya net varlık oluşturmaz", () => {
    const d = saveTransfer(data(), {
      id: "transfer",
      fromId: "bank",
      toId: "cash",
      amount: 250,
      currency: "TRY",
      date: "2026-01-10",
      note: "",
    });
    expect(validateData(d)).toBe(true);
    expect(accountBalance(d, bank, "2026-01-31")).toBe(750);
    expect(accountBalance(d, cash, "2026-01-31")).toBe(250);
    expect(summarize(d, "2026-01").expense).toBe(0);
    expect(summarize(d, "2026-01").income).toBe(0);
  });
  it("kart harcaması bir giderdir, kart ödeme transferi ikinci gider değildir", () => {
    let d: BudgetData = {
      ...data(),
      transactions: [{ ...transaction, accountId: "card" }],
    };
    d = saveTransfer(d, {
      id: "pay",
      fromId: "bank",
      toId: "card",
      amount: 300,
      currency: "TRY",
      date: "2026-01-22",
      note: "",
    });
    expect(accountBalance(d, card, "2026-01-21")).toBe(-300);
    expect(accountBalance(d, card, "2026-01-22")).toBe(0);
    expect(accountBalance(d, bank, "2026-01-22")).toBe(700);
    expect(summarize(d, "2026-01").expense).toBe(300);
  });
  it("transfer düzeltme ve silme hareketi çoğaltmadan bakiyeyi düzeltir", () => {
    let d = saveTransfer(data(), {
      id: "t",
      fromId: "bank",
      toId: "cash",
      amount: 10,
      currency: "TRY",
      date: "2026-01-10",
      note: "",
    });
    d = saveTransfer(d, { ...d.accountTransfers![0], amount: 20 });
    expect(d.accountTransfers).toHaveLength(1);
    expect(accountBalance(d, cash, "2026-01-31")).toBe(20);
    expect(
      accountBalance({ ...d, accountTransfers: [] }, cash, "2026-01-31"),
    ).toBe(0);
  });
  it("döviz hesabı orijinal para biriminde hareket eder, TRY rapor kurunu tekrar uygulamaz", () => {
    const usd = { ...bank, currency: "USD", openingBalance: 100 };
    const d = {
      ...emptyData(),
      financialAccounts: [usd],
      transactions: [
        {
          ...transaction,
          accountId: "bank",
          amount: 10,
          currency: "USD",
          baseAmount: 500,
          fxRate: 50,
          fxUnit: 1,
          fxDate: "2026-01-20",
          fxSide: "selling" as const,
        },
      ],
    };
    expect(validateData(d)).toBe(true);
    expect(accountBalance(d, usd, "2026-01-31")).toBe(90);
    expect(summarize(d, "2026-01").expense).toBe(500);
  });
  it("farklı para birimleri ve aynı hesap arasında transfer reddedilir", () => {
    const d = {
      ...data(),
      financialAccounts: [bank, { ...cash, currency: "USD" }],
    };
    expect(() =>
      saveTransfer(d, {
        id: "t",
        fromId: "bank",
        toId: "cash",
        amount: 10,
        currency: "TRY",
        date: "2026-01-10",
        note: "",
      }),
    ).toThrow();
    expect(() =>
      saveTransfer(data(), {
        id: "t",
        fromId: "bank",
        toId: "bank",
        amount: 10,
        currency: "TRY",
        date: "2026-01-10",
        note: "",
      }),
    ).toThrow();
  });
  it("hareket bağlı hesabın türü/para birimi değiştirilmez", () => {
    const d = {
      ...data(),
      transactions: [{ ...transaction, accountId: "bank" }],
    };
    expect(() =>
      saveFinancialAccount(d, { ...bank, currency: "USD" }),
    ).toThrow();
    expect(() => saveFinancialAccount(d, { ...bank, kind: "cash" })).toThrow();
  });
  it("bakiye veya açık plan varken arşivlenmez; sıfır hesap geri açılabilir", () => {
    expect(() =>
      setAccountArchived(data(), "bank", true, "2026-02-01"),
    ).toThrow();
    const d = setAccountArchived(data(), "cash", true, "2026-02-01");
    expect(d.financialAccounts?.find((a) => a.id === "cash")?.archived).toBe(
      true,
    );
    expect(
      setAccountArchived(
        d,
        "cash",
        false,
        "2026-02-01",
      ).financialAccounts?.find((a) => a.id === "cash")?.archived,
    ).toBe(false);
    expect(() =>
      setAccountArchived(
        { ...data(), paymentPlans: [plan({ accountId: "cash" })] },
        "cash",
        true,
        "2026-02-01",
      ),
    ).toThrow();
  });
  it("hesap veya plan eklemek eski verinin üzerine aktarma hakkını kapatır", () => {
    expect(isPristineBudget(data())).toBe(false);
    expect(isPristineBudget({ ...emptyData(), paymentPlans: [plan()] })).toBe(
      false,
    );
    expect(isPristineBudget(emptyData())).toBe(true);
  });
  it("31 Ocak aylık planı Şubat sonuna sıkışır ancak Mart 31 tarihine geri döner", () => {
    expect(monthlyDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(monthlyDate("2026-01-31", 2)).toBe("2026-03-31");
    expect(monthlyDate("2024-01-31", 1)).toBe("2024-02-29");
  });
  it("ay başı/yıl geçişi ve kesim sonrası yakın son ödeme günü doğru seçilir", () => {
    expect(cardDates(card, "2026-10-22")).toEqual({
      closing: "2026-11-15",
      payment: "2026-10-25",
    });
    expect(
      cardDates({ ...card, statementDay: 20, paymentDay: 10 }, "2026-12-22"),
    ).toEqual({ closing: "2027-01-20", payment: "2027-01-10" });
    expect(
      cardDates({ ...card, statementDay: 31, paymentDay: 31 }, "2026-02-10"),
    ).toEqual({ closing: "2026-02-28", payment: "2026-02-28" });
  });
  it("kuruş yuvarlamasıyla taksitlerin toplamı her zaman alışveriş toplamıdır", () => {
    expect([0, 1, 2].map((i) => installmentAmount(1000, 3, i))).toEqual([
      333.34, 333.33, 333.33,
    ]);
    for (const n of [0.03, 1, 1000.01, 999999999])
      for (const count of [2, 3, 7, 12])
        if (Math.round(n * 100) >= count)
          expect(
            Array.from({ length: count }, (_, i) =>
              Math.round(installmentAmount(n, count, i) * 100),
            ).reduce((a, b) => a + b, 0),
          ).toBe(Math.round(n * 100));
  });
  it("plan oluşturmak işlem veya gider üretmez; sadece seçilen ayın dönemleri gelir", () => {
    const d = { ...data(), paymentPlans: [plan()] };
    expect(validateData(d)).toBe(true);
    expect(summarize(d, "2026-01").expense).toBe(0);
    expect(
      paymentOccurrences(d, "2026-02-01", "2026-03-31").map((o) => o.date),
    ).toEqual(["2026-02-28", "2026-03-31"]);
  });
  it("gerçekleşen dönem ödenmiş görünür; işlem silinirse yeniden bekler", () => {
    const p = plan();
    const d = {
      ...data(),
      paymentPlans: [p],
      transactions: [
        { ...transaction, categoryId: "housing", planId: "plan", planIndex: 0 },
      ],
    };
    expect(validateData(d)).toBe(true);
    expect(
      paymentOccurrences(d, "2026-01-01", "2026-01-31")[0].transaction?.id,
    ).toBe("spend");
    expect(
      paymentOccurrences(
        { ...d, transactions: [] },
        "2026-01-01",
        "2026-01-31",
      )[0].transaction,
    ).toBeUndefined();
  });
  it("taksit planının yalnızca işlenmemiş bölümü kartın gelecek yükümlülüğüdür", () => {
    const p = plan({
      kind: "installment",
      amount: 1000,
      count: 3,
      accountId: "card",
    });
    const d = {
      ...data(),
      paymentPlans: [p],
      transactions: [
        {
          ...transaction,
          categoryId: "housing",
          amount: 333.34,
          accountId: "card",
          planId: "plan",
          planIndex: 0,
        },
      ],
    };
    expect(validateData(d)).toBe(true);
    expect(pendingInstallments(d, "card")).toBe(666.66);
    expect(paymentOccurrences(d, "2026-01-01", "2026-12-31")).toHaveLength(3);
    expect(
      pendingInstallments(
        { ...d, paymentPlans: [{ ...p, archived: true }] },
        "card",
      ),
    ).toBe(0);
  });
  it("bitiş tarihi ve tek seferlik planlar ek dönem oluşturmaz; arşivdeki işlemler korunur", () => {
    const d = {
      ...data(),
      paymentPlans: [
        plan({ endDate: "2026-02-28" }),
        plan({ id: "once", kind: "once", startDate: "2026-02-10" }),
      ],
    };
    expect(paymentOccurrences(d, "2026-01-01", "2026-12-31")).toHaveLength(3);
    expect(
      paymentOccurrences(
        {
          ...d,
          paymentPlans: d.paymentPlans.map((p) => ({ ...p, archived: true })),
        },
        "2026-01-01",
        "2026-12-31",
      ),
    ).toHaveLength(0);
  });
  it.each([
    ["yinelenen hesap", { ...data(), financialAccounts: [bank, bank] }],
    [
      "yanlış para birimindeki hesap işlemi",
      {
        ...data(),
        transactions: [
          {
            ...transaction,
            accountId: "bank",
            currency: "USD",
            baseAmount: 15000,
            fxRate: 50,
            fxUnit: 1,
            fxDate: "2026-01-20",
            fxSide: "selling",
          },
        ],
      },
    ],
    [
      "hesap öncesi işlem",
      {
        ...data(),
        transactions: [
          { ...transaction, accountId: "bank", date: "2025-12-31" },
        ],
      },
    ],
    [
      "olmayan hesap",
      { ...data(), transactions: [{ ...transaction, accountId: "other" }] },
    ],
    [
      "geçersiz kesim günü",
      { ...data(), financialAccounts: [{ ...card, statementDay: 32 }] },
    ],
    [
      "olmayan plan",
      {
        ...data(),
        transactions: [{ ...transaction, planId: "missing", planIndex: 0 }],
      },
    ],
    [
      "tek başına dönem indeksi",
      { ...data(), transactions: [{ ...transaction, planIndex: 0 }] },
    ],
    [
      "sıfır taksit",
      {
        ...data(),
        paymentPlans: [
          plan({ kind: "installment", count: 0, accountId: "card" }),
        ],
      },
    ],
    [
      "taksit için nakit hesabı",
      {
        ...data(),
        paymentPlans: [
          plan({ kind: "installment", count: 3, accountId: "cash" }),
        ],
      },
    ],
    [
      "farklı kartta işlenen taksit",
      {
        ...data(),
        paymentPlans: [
          plan({ kind: "installment", count: 3, accountId: "card" }),
        ],
        transactions: [
          {
            ...transaction,
            accountId: "cash",
            categoryId: "housing",
            planId: "plan",
            planIndex: 0,
          },
        ],
      },
    ],
    [
      "aynı dönemin ikinci kez işlenmesi",
      {
        ...data(),
        paymentPlans: [plan()],
        transactions: [
          {
            ...transaction,
            categoryId: "housing",
            planId: "plan",
            planIndex: 0,
          },
          {
            ...transaction,
            id: "duplicate",
            categoryId: "housing",
            planId: "plan",
            planIndex: 0,
          },
        ],
      },
    ],
    [
      "geçersiz nullable hesap alanı",
      { ...emptyData(), financialAccounts: null },
    ],
  ])("%s tüm belge kaydını reddeder", (_, v) =>
    expect(validateData(v)).toBe(false),
  );
  it("hesap ve planlar JSON yedeğinde kayıpsız kalır", () => {
    const d = { ...data(), paymentPlans: [plan()] };
    const copy = JSON.parse(JSON.stringify(d));
    expect(validateData(copy)).toBe(true);
    expect(copy).toEqual(d);
  });
});
