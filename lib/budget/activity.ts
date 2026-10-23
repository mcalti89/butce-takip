import { budgetTransactions } from "./account-scope";
import type { BudgetData, Transaction } from "./model";
import type { AccountTransfer } from "./finance";
import { compareDatedRecordsNewestFirst } from "./time";
export type ActivityFilter = "all" | "income" | "expense" | "transfer";
export type ActivityRow =
  | { kind: "transaction"; value: Transaction }
  | { kind: "transfer"; value: AccountTransfer };
export function activityRows(
  transactions: Transaction[],
  transfers: AccountTransfer[] = [],
): ActivityRow[] {
  return [
    ...transactions.map((value) => ({ kind: "transaction" as const, value })),
    ...transfers.map((value) => ({ kind: "transfer" as const, value })),
  ].sort((a, b) => compareDatedRecordsNewestFirst(a.value, b.value));
}
export function filterActivity(
  data: BudgetData,
  month: string,
  filter: ActivityFilter = "all",
  categoryId = "all",
  search = "",
) {
  const query = search.trim().toLocaleLowerCase("tr-TR");
  const matches = (text: string) =>
    text.toLocaleLowerCase("tr-TR").includes(query);
  const transactions = budgetTransactions(data).filter(
    (t) =>
      t.date.startsWith(month + "-") &&
      (filter === "all" || filter === t.type) &&
      (categoryId === "all" || categoryId === t.categoryId) &&
      matches(
        `${t.description} ${data.categories.find((c) => c.id === t.categoryId)?.name ?? ""} ${data.financialAccounts?.find((a) => a.id === t.accountId)?.name ?? ""}`,
      ),
  );
  const transfers = (data.accountTransfers ?? []).filter(
    (t) =>
      t.date.startsWith(month + "-") &&
      (filter === "all" || filter === "transfer") &&
      categoryId === "all" &&
      matches(
        `Transfer ${t.exchange ? "Döviz al sat " + t.exchange.toCurrency : ""} ${t.note} ${data.financialAccounts?.find((a) => a.id === t.fromId)?.name ?? ""} ${data.financialAccounts?.find((a) => a.id === t.toId)?.name ?? ""} ${t.currency} ${data.financialAccounts?.find((a) => a.id === t.toId)?.kind === "card" ? "Kart ödemesi" : ""}`,
      ),
  );
  return {
    transactions,
    transfers,
    count: transactions.length + transfers.length,
  };
}
