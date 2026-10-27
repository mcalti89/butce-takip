import type { PickedReceipt } from "./receipt-model";
export async function readReceipt(
  _file: PickedReceipt,
): Promise<{ text: string; sha256: string }> {
  throw new Error("Dekont okuma için uygulamayı tarayıcıdan aç.");
}
