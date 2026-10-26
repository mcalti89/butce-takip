import { MAX_RECEIPT_BYTES, type PickedReceipt } from "./receipt-model";

export async function pickReceipt(): Promise<PickedReceipt | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (!/\.pdf$/i.test(file.name))
        return reject(new Error("PDF biçiminde bir dekont seç."));
      if (!file.size || file.size > MAX_RECEIPT_BYTES)
        return reject(
          new Error("Her PDF en fazla 3 MB olabilir; boş dosya yüklenemez."),
        );
      try {
        if (
          (await file.slice(0, 5).text()) !== "%PDF-" ||
          !(await file.slice(-1024).text()).includes("%%EOF")
        )
          throw new Error("PDF biçiminde ve eksiksiz bir dosya seç.");
        const base64 = await new Promise<string>((done, fail) => {
          const reader = new FileReader();
          reader.onerror = () => fail(new Error("PDF okunamadı."));
          reader.onload = () => done(String(reader.result).split(",")[1]);
          reader.readAsDataURL(file);
        });
        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          base64,
        });
      } catch (e) {
        reject(
          e instanceof Error
            ? e
            : new Error("PDF okunamadı. Dosyayı tekrar seç."),
        );
      }
    };
    input.click();
  });
}
export async function saveReceipt(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
