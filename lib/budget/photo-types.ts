import type { PickedReceipt } from "./receipt-model";
export type PhotoSelection = {
  photo?: Blob;
  name?: string;
  error?: string;
} | null;
export type PreparedPhoto = {
  jpeg: string;
  sha256: string;
  file: PickedReceipt;
  width: number;
  height: number;
};
