import { isDeepStrictEqual } from "node:util";
import type { BudgetData } from "../../lib/budget/model";
import { isInvestmentAccount } from "../../lib/budget/account-scope";

/** Preserve history on reclassification, while investment accounts accept only new transfers. */
export function validInvestmentChanges(
  previous: BudgetData | null,
  next: BudgetData,
) {
  // An empty budget may restore a full backup, including reclassified historical records.
  if (
    !previous ||
    !(
      previous.financialAccounts?.length ||
      previous.transactions.length ||
      previous.paymentPlans?.length
    )
  )
    return true;
  const sameFields = (
    a: object | undefined,
    b: object,
    fields: readonly string[],
  ) =>
    !!a &&
    fields.every((key) =>
      isDeepStrictEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  const transactions = new Map(previous.transactions.map((t) => [t.id, t]));
  const plans = new Map((previous.paymentPlans ?? []).map((p) => [p.id, p]));
  const transfers = new Map(
    (previous.accountTransfers ?? []).map((t) => [t.id, t]),
  );
  for (const t of next.transactions) {
    if (!isInvestmentAccount(next, t.accountId)) continue;
    if (
      !sameFields(transactions.get(t.id), t, [
        "accountId",
        "amount",
        "currency",
        "baseAmount",
        "type",
        "date",
        "planId",
        "planIndex",
        "fxRate",
        "fxUnit",
        "fxDate",
        "fxSide",
      ])
    )
      return false;
  }
  for (const p of next.paymentPlans ?? []) {
    if (!isInvestmentAccount(next, p.accountId)) continue;
    if (
      !sameFields(plans.get(p.id), p, [
        "accountId",
        "kind",
        "amount",
        "currency",
        "type",
        "startDate",
        "endDate",
        "count",
      ])
    )
      return false;
  }
  for (const t of next.accountTransfers ?? []) {
    if (
      !t.exchange ||
      (!isInvestmentAccount(next, t.fromId) &&
        !isInvestmentAccount(next, t.toId))
    )
      continue;
    if (
      !sameFields(transfers.get(t.id), t, [
        "fromId",
        "toId",
        "amount",
        "currency",
        "date",
        "exchange",
      ])
    )
      return false;
  }
  return true;
}
