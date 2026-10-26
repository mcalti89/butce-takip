export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
export const MAX_RECEIPTS_PER_ENTRY = 10;
export const MAX_RECEIPT_STORAGE = 3 * 1024 * 1024 * 1024;
// Keep the complete metadata response below Vercel's response size limit.
export const MAX_STORED_RECEIPTS = 5000;
export type ReceiptKind = "transaction" | "transfer";
export type Receipt = {
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
