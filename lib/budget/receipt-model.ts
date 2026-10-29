export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
export const MAX_RECEIPTS_PER_ENTRY = 10;
export const MAX_RECEIPT_STORAGE = 3 * 1024 * 1024 * 1024;
// Keep the complete metadata response below Vercel's response size limit.
export const MAX_STORED_RECEIPTS = 5000;
export type ReceiptKind = "transaction" | "transfer";
export type Receipt = {
  storage?: "sql" | "pending" | "nas";
  id: string;
  kind: ReceiptKind;
  entryId: string;
  name: string;
  size: number;
  createdAt: number;
};
export type PickedReceipt = {
  id: string;
  name: string;
  size: number;
  base64: string;
};
export const receiptKey = (kind: ReceiptKind, entryId: string) =>
  `${kind}:${entryId}`;

export type ReceiptImportSource = {
  sha256: string;
  bank?: string;
  reference?: string;
};
export type ReceiptImportDraft = {
  attach?: boolean;
  file: PickedReceipt;
  source: ReceiptImportSource;
  warnings: string[];
};

export function validReceiptImport(value: unknown) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as ReceiptImportSource;
  return (
    typeof v.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(v.sha256) &&
    (v.bank === undefined ||
      (typeof v.bank === "string" && v.bank.length <= 80)) &&
    (v.reference === undefined ||
      (typeof v.reference === "string" && v.reference.length <= 120))
  );
}
