import { transferReceivedAmount } from "./exchange";
import { compareDatedRecordsNewestFirst } from "./time";
import type { BudgetData } from "./model";
import { compareTransactionsNewestFirst } from "./model";
import { minorUnits, currencyScale } from "./currency";
import { accountBalance, type FinancialAccount } from "./finance";
import { monthEnd } from "./reports";

/** Uses account currency, never the TRY reporting snapshot. Transfers remain separate. */
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
  const income = sum("income"),
    expense = sum("expense");
  const openingAdjustment =
    account.openingDate >= start && account.openingDate <= end
      ? account.openingBalance
      : 0;
  return {
    start,
    end,
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
