import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
export async function pickCSV(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "text/comma-separated-values",
      "application/csv",
      "text/plain",
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  if (file.size > 5 * 1024 * 1024)
    throw new Error("CSV dosyası en fazla 5 MB olabilir.");
  return file.text();
}
export async function downloadCSV(
  text: string,
  filename: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "Bu cihazda dosya paylaşımı kullanılamıyor. Web önizlemesini kullanabilirsin.",
    );
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(text);
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    dialogTitle: "Bütçe CSV dışa aktar",
    UTI: "public.comma-separated-values-text",
  });
}
