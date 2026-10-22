import { emptyData, type BudgetData } from "./model";
/** A legacy import must never replace user changes, including category-only edits. */
export function isPristineBudget(data: BudgetData) {
  const defaults = emptyData();
  return (
    !data.demo &&
    data.transactions.length === 0 &&
    Object.keys(data.budgets).length === 0 &&
    Object.keys(data.savingsGoals ?? {}).length === 0 &&
    (data.fxRates?.length ?? 0) === 0 &&
    JSON.stringify(data.trackedCurrencies ?? defaults.trackedCurrencies) ===
      JSON.stringify(defaults.trackedCurrencies) &&
    data.categories.length === defaults.categories.length &&
    defaults.categories.every((expected) =>
      data.categories.some(
        (actual) =>
          actual.id === expected.id &&
          actual.name === expected.name &&
          actual.type === expected.type &&
          actual.icon === expected.icon &&
          actual.color === expected.color,
      ),
    )
  );
}
