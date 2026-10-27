import {
  getDocument,
  GlobalWorkerOptions,
  assetBase,
} from "/receipt-pdf-runtime.mjs";
GlobalWorkerOptions.workerSrc = assetBase + "pdf.worker.mjs";
const nonce = location.hash.slice(1);
const send = (type, extra = {}) =>
  parent.postMessage({ type, nonce, ...extra }, location.origin);
let task,
  started = false;
addEventListener("pagehide", () => {
  void task?.destroy();
});
addEventListener("message", async (event) => {
  if (
    started ||
    event.origin !== location.origin ||
    event.source !== parent ||
    event.data?.nonce !== nonce ||
    event.data?.type !== "budget-read-document"
  )
    return;
  started = true;
  try {
    const data = event.data.data;
    if (!(data instanceof ArrayBuffer) || data.byteLength > 3 * 1024 * 1024)
      throw new Error();
    task = getDocument({
      data,
      cMapUrl: assetBase + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: assetBase + "standard_fonts/",
      wasmUrl: assetBase + "wasm/",
      isEvalSupported: false,
      enableXfa: false,
      useSystemFonts: false,
      maxImageSize: 16777216,
    });
    task.onPassword = () => {
      send("budget-read-error", {
        message: "Şifreli PDF okunamıyor. Bankandan şifresiz bir dekont indir.",
      });
      void task.destroy();
    };
    const pdf = await task.promise;
    if (pdf.numPages > 20) {
      send("budget-read-error", {
        message: "Tek bir işlem için en fazla 20 sayfalık dekont seç.",
      });
      return;
    }
    let text = "";
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // Preserve visual rows: bank receipts often place labels and values in separate text objects.
      const rows = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5],
          x = item.transform[4];
        let row = rows.find((r) => Math.abs(r.y - y) < 2);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push({ x, text: item.str });
      }
      rows.sort((a, b) => b.y - a.y);
      text +=
        rows
          .map((r) =>
            r.items
              .sort((a, b) => a.x - b.x)
              .map((i) => i.text)
              .join(" "),
          )
          .join("\n") + "\n";
      page.cleanup();
      if (text.length > 200000) {
        send("budget-read-error", {
          message:
            "Dekont çok fazla metin içeriyor. Tek işleme ait bir PDF seç.",
        });
        return;
      }
    }
    send("budget-read-result", { text });
  } catch {
    send("budget-read-error", {
      message: "PDF okunamadı. Eksiksiz ve şifresiz bir banka dekontu seç.",
    });
  } finally {
    await task?.destroy();
  }
});
send("budget-read-ready");
