export async function pickCSV(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error("CSV dosyası en fazla 5 MB olabilir."));
        return;
      }
      try {
        resolve(await file.text());
      } catch {
        reject(new Error("Dosya okunamadı."));
      }
    };
    input.click();
  });
}
export async function downloadCSV(
  text: string,
  filename: string,
): Promise<void> {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
