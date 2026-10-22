import { BudgetData, parseAmount, summarize } from "./model";

export function savingsSummary(data: BudgetData, month: string) {
  const { income, expense, net } = summarize(data, month);
  const target = data.savingsGoals?.[month];
  const saved = Math.max(0, net);
  const remaining =
    target === undefined
      ? undefined
      : Math.round(Math.max(0, target - saved) * 100) / 100;
  const surplus =
    target === undefined
      ? 0
      : Math.round(Math.max(0, saved - target) * 100) / 100;
  const ratio = target ? saved / target : 0;
  return {
    income,
    expense,
    net,
    saved,
    target,
    remaining,
    surplus,
    ratio,
    achieved: target !== undefined && saved >= target,
  };
}

export function setSavingsGoal(
  data: BudgetData,
  month: string,
  input: string | null,
): BudgetData {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Geçerli bir ay seç.");
  const goals = { ...data.savingsGoals };
  if (input === null) delete goals[month];
  else {
    const amount = parseAmount(input);
    if (!Number.isFinite(amount))
      throw new Error(
        "0’dan büyük, en fazla iki ondalıklı bir hedef gir. Örnek: 5.000,00",
      );
    goals[month] = amount;
  }
  return { ...data, savingsGoals: goals };
}
