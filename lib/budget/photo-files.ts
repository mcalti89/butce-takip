import type { PhotoSelection, PreparedPhoto } from "./photo-types";
const message =
  "Fotoğraftan eklemek için uygulamayı telefonundaki tarayıcıdan aç.";
export async function pickExpensePhoto(
  _source: "camera" | "library",
): Promise<PhotoSelection> {
  return { error: message };
}
export async function prepareExpensePhoto(
  _photo: Blob,
  _name: string,
  _signal: AbortSignal,
): Promise<PreparedPhoto> {
  throw new Error(message);
}
export async function readExpensePhoto(
  _photo: PreparedPhoto,
  _signal: AbortSignal,
  _onProgress: (s: string) => void,
): Promise<{ text: string; confidence: number }> {
  throw new Error(message);
}
