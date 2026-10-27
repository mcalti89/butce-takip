import type { BudgetData } from "./model";
import { saveFinancialAccount } from "./finance";
import { normalizeIban, validIban } from "./bank-identity";

export function compareAccountIban(registered?: string, read?: string) {
  if (!read) return "unread";
  if (!registered) return "missing";
  return normalizeIban(registered) === normalizeIban(read)
    ? "match"
    : "mismatch";
}

export function saveAccountIdentity(
  data: BudgetData,
  accountId: string,
  bankName: string,
  iban: string,
) {
  const account = data.financialAccounts?.find((a) => a.id === accountId);
  if (!account) throw new Error("Hesap artık bulunamıyor. Hesabı yeniden seç.");
  if (bankName.trim().length > 80)
    throw new Error("Banka adı en fazla 80 karakter olabilir.");
  if (iban.trim() && !validIban(iban))
    throw new Error("Geçerli bir IBAN gir veya alanı boş bırak.");
  return saveFinancialAccount(data, {
    ...account,
    bankName: bankName.trim() || undefined,
    iban: iban.trim() ? normalizeIban(iban) : undefined,
  });
}
