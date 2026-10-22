import type { BudgetData } from "./model";
export async function downloadBackup(_data: BudgetData): Promise<void> {
  throw new Error("Tam JSON yedeği şu an web/PWA sürümünde indirilebilir.");
}
