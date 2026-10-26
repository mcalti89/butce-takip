import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { MAX_RECEIPT_BYTES, type PickedReceipt } from "./receipt-model";
export async function pickReceipt(): Promise<PickedReceipt | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0],
    file = new File(asset.uri);
  if (
    !/\.pdf$/i.test(asset.name) ||
    !file.size ||
    file.size > MAX_RECEIPT_BYTES
  )
    throw new Error("En fazla 3 MB boyutunda bir PDF dekont seç.");
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === "x" ? n : (n & 3) | 8).toString(16);
  });
  return {
    id: uuid,
    name: asset.name,
    size: file.size,
    base64: await file.base64(),
  };
}
export async function saveReceipt(bytes: Uint8Array, name: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Bu cihazda dosya paylaşımı kullanılamıyor.");
  const safeName = name.replace(/[/\\\x00-\x1f]/g, "_");
  const file = new File(Paths.cache, safeName);
  file.create({ overwrite: true });
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    dialogTitle: "Banka dekontu",
    UTI: "com.adobe.pdf",
  });
}
