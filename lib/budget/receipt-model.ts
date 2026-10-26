export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
export const MAX_RECEIPTS_PER_ENTRY = 10;
export const MAX_RECEIPT_STORAGE = 100 * 1024 * 1024;
export const MAX_STORED_RECEIPTS = 1000;
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
