import type { BudgetData } from "./model";
import type { Receipt } from "./receipt-model";
import { receiptKey } from "./receipt-model";
import type { ActivityRow } from "./activity";
import { compareDatedRecordsNewestFirst } from "./time";

export function monthlyReceipts(
  data: BudgetData,
  receipts: Receipt[],
  month: string,
) {
  const entries = new Map<string, ActivityRow>();
  for (const value of data.transactions)
    entries.set(receiptKey("transaction", value.id), {
      kind: "transaction",
      value,
    });
  for (const value of data.accountTransfers ?? [])
    entries.set(receiptKey("transfer", value.id), { kind: "transfer", value });
  return receipts
    .flatMap((receipt) => {
      const activity = entries.get(receiptKey(receipt.kind, receipt.entryId));
      return activity?.value.date.startsWith(month + "-")
        ? [{ receipt, activity }]
        : [];
    })
    .sort(
      (a, b) =>
        compareDatedRecordsNewestFirst(a.activity.value, b.activity.value) ||
        b.receipt.createdAt - a.receipt.createdAt ||
        a.receipt.id.localeCompare(b.receipt.id),
    );
}
