import {
  investmentCashEntries,
  type InvestmentEntry,
} from "./investment-portfolio";
import { activityRows, type ActivityRow } from "./activity";
import { transferReceivedAmount } from "./exchange";
import { compareDatedRecordsNewestFirst } from "./time";
import type { BudgetData } from "./model";
import { compareTransactionsNewestFirst } from "./model";
import { minorUnits, currencyScale } from "./currency";
import { accountBalance, type FinancialAccount } from "./finance";
import { monthEnd } from "./reports";

export type AccountActivityRow = (
  | ActivityRow
  | {
      kind: "investment";
      value: InvestmentEntry & { type: "income" | "expense" };
    }
) & {
  amount: number;
  direction: "in" | "out";
  balanceAfter: number;
};

/** One ledger in account currency; transfers do not become income or expense. */
export function accountMonthActivity(
  data: BudgetData,
  account: FinancialAccount,
  month: string,
  asOf: string,
) {
  const start = month + "-01",
    end = monthEnd(month) < asOf ? monthEnd(month) : asOf;
  const before = new Date(start + "T00:00:00Z");
  before.setUTCDate(before.getUTCDate() - 1);
  const opening = accountBalance(
    data,
    account,
    before.toISOString().slice(0, 10),
  );
  const transactions = data.transactions
    .filter(
      (t) => t.accountId === account.id && t.date >= start && t.date <= end,
    )
    .sort(compareTransactionsNewestFirst);
  const transfers = (data.accountTransfers ?? [])
    .filter(
      (t) =>
        (t.fromId === account.id || t.toId === account.id) &&
        t.date >= start &&
        t.date <= end,
    )
    .sort(compareDatedRecordsNewestFirst);
  const cashEntries = investmentCashEntries(data, account.id, end).filter(
    (e) => e.date >= start,
  );
  const scale = currencyScale(account.currency),
    units = (n: number) => minorUnits(n, account.currency);
  const sum = (type: "income" | "expense") =>
    transactions
      .filter((t) => t.type === type)
      .reduce((n, t) => n + units(t.amount), 0) / scale;
  const transferIn =
    transfers
      .filter((t) => t.toId === account.id)
      .reduce((n, t) => n + units(transferReceivedAmount(t)), 0) / scale;
  const transferOut =
    transfers
      .filter((t) => t.fromId === account.id)
      .reduce((n, t) => n + units(t.amount), 0) / scale;
  const income =
      (units(sum("income")) +
        cashEntries
          .filter((e) => e.type === "income")
          .reduce((n, e) => n + units(e.amount), 0)) /
      scale,
    expense =
      (units(sum("expense")) +
        cashEntries
          .filter((e) => e.type === "expense")
          .reduce((n, e) => n + units(e.amount), 0)) /
      scale;
  const openingAdjustment =
    account.openingDate >= start && account.openingDate <= end
      ? account.openingBalance
      : 0;
  // Calculate the complete ledger before any display filter is applied.
  let balance = units(opening) + units(openingAdjustment);
  const combined: (
    | ActivityRow
    | {
        kind: "investment";
        value: InvestmentEntry & { type: "income" | "expense" };
      }
  )[] = [
    ...activityRows(transactions, transfers),
    ...cashEntries.map((value) => ({ kind: "investment" as const, value })),
  ];
  const rows: AccountActivityRow[] = combined
    .sort((a, b) => compareDatedRecordsNewestFirst(a.value, b.value))
    .reverse()
    .map((entry) => {
      const incoming =
        entry.kind === "transfer"
          ? entry.value.toId === account.id
          : entry.value.type === "income";
      const amount =
        entry.kind === "transfer" && incoming
          ? transferReceivedAmount(entry.value)
          : entry.value.amount;
      balance += (incoming ? 1 : -1) * units(amount);
      return {
        ...entry,
        amount,
        direction: incoming ? ("in" as const) : ("out" as const),
        balanceAfter: balance / scale,
      };
    })
    .reverse();
  return {
    start,
    end,
    rows,
    transactions,
    transfers,
    income,
    expense,
    net: (units(income) - units(expense)) / scale,
    transferIn,
    transferOut,
    opening,
    openingAdjustment,
    closing: end < start ? opening : accountBalance(data, account, end),
  };
}
