import type { BudgetData } from "./model";

/** Investment holdings are outside the operating budget; funding transfers remain traceable. */
export function isInvestmentAccount(data: BudgetData, accountId?: string) {
  return (
    !!accountId &&
    data.financialAccounts?.some(
      (a) => a.id === accountId && a.kind === "investment",
    ) === true
  );
}
export function budgetTransactions(data: BudgetData) {
  const excluded = new Set(
    (data.financialAccounts ?? [])
      .filter((a) => a.kind === "investment")
      .map((a) => a.id),
  );
  return data.transactions.filter(
    (t) => !t.accountId || !excluded.has(t.accountId),
  );
}
