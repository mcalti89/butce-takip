import type { PhotoSelection, PreparedPhoto } from "./photo-types";
import { photoPdf } from "./photo-pdf";
import { MAX_RECEIPT_BYTES } from "./receipt-model";
export function pickExpensePhoto(
  source: "camera" | "library",
): Promise<PhotoSelection> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let settled = false;
    const finish = (result: PhotoSelection) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    };
    input.hidden = true;
    input.type = "file";
    input.accept = "image/*";
    if (source === "camera") input.setAttribute("capture", "environment");
    input.oncancel = () => finish(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      if (!file.size || file.size > 20 * 1024 * 1024)
        return finish({
          error: "En fazla 20 MB boyutunda bir fiş fotoğrafı seç.",
        });
      if (
        !/^image\//.test(file.type) &&
        !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
      )
        return finish({ error: "Bir fotoğraf dosyası seç." });
      finish({ photo: file, name: file.name });
    };
    try {
      document.body.appendChild(input);
      input.click();
    } catch {
      finish({
        error: "Kamera açılamadı. Galeriden bir fotoğraf seçebilirsin.",
      });
    }
  });
}
export async function prepareExpensePhoto(
  photo: Blob,
  name: string,
  signal: AbortSignal,
): Promise<PreparedPhoto> {
  const aborted = () => {
    if (signal.aborted) throw new DOMException("İptal edildi", "AbortError");
  };
  aborted();
  const raw = await photo.arrayBuffer();
  aborted();
  const digest = await crypto.subtle.digest("SHA-256", raw),
    sha256 = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  const url = URL.createObjectURL(photo),
    image = new Image();
  try {
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
      };
      const cancel = () => {
        cleanup();
        reject(new DOMException("İptal edildi", "AbortError"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error("Fotoğraf yüklenemedi. Daha küçük bir JPEG veya PNG seç."),
        );
      }, 20000);
      signal.addEventListener("abort", cancel, { once: true });
      image.decode().then(
        () => {
          cleanup();
          resolve();
        },
        () => {
          cleanup();
          reject(
            new Error(
              "Fotoğraf biçimi açılamadı. JPEG veya PNG olarak yeniden çek ya da seç.",
            ),
          );
        },
      );
    });
    aborted();
    const ow = image.naturalWidth,
      oh = image.naturalHeight;
    if (ow < 64 || oh < 64 || ow > 16000 || oh > 16000 || ow * oh > 50000000)
      throw new Error(
        "Fotoğraf boyutları uygun değil. Fişi daha yakın ve normal kamera çözünürlüğünde çek.",
      );
    const scale = Math.min(
      1,
      2600 / Math.max(ow, oh),
      Math.sqrt(3000000 / (ow * oh)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(ow * scale));
    canvas.height = Math.max(1, Math.round(oh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Fotoğraf işlenemedi.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let jpeg = canvas.toDataURL("image/jpeg", 0.85);
    if (jpeg.length * 0.75 > MAX_RECEIPT_BYTES - 2048)
      jpeg = canvas.toDataURL("image/jpeg", 0.6);
    const bytes = Uint8Array.from(atob(jpeg.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    const pdf = photoPdf(bytes, canvas.width, canvas.height);
    aborted();
    if (pdf.length > MAX_RECEIPT_BYTES)
      throw new Error(
        "Fotoğraf küçültülemedi. Daha düşük çözünürlükte yeniden çek.",
      );
    let binary = "";
    for (let i = 0; i < pdf.length; i += 16384)
      binary += String.fromCharCode(...pdf.subarray(i, i + 16384));
    const width = canvas.width,
      height = canvas.height;
    canvas.width = 0;
    canvas.height = 0;
    return {
      jpeg,
      sha256,
      width,
      height,
      file: {
        id: crypto.randomUUID(),
        name:
          (name
            .replace(/\.[^.]+$/, "")
            .replace(/[^\p{L}\p{N} _-]/gu, "")
            .slice(0, 100) || "Fis-fotografi") + ".pdf",
        size: pdf.length,
        base64: btoa(binary),
      },
    };
  } finally {
    URL.revokeObjectURL(url);
    image.removeAttribute("src");
  }
}
export function readExpensePhoto(
  photo: PreparedPhoto,
  signal: AbortSignal,
  onProgress: (s: string) => void,
): Promise<{ text: string; confidence: number }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("İptal edildi", "AbortError"));
    const nonce = crypto.randomUUID(),
      frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = "Fiş fotoğrafı okuyucu";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.referrerPolicy = "no-referrer";
    frame.src = `/photo-reader.html#${nonce}`;
    let finished = false;
    const cleanup = () => {
      finished = true;
      clearTimeout(timer);
      clearTimeout(readyTimer);
      window.removeEventListener("message", message);
      signal.removeEventListener("abort", cancel);
      frame.contentWindow?.postMessage(
        { type: "budget-photo-cancel", nonce },
        location.origin,
      );
      frame.remove();
    };
    const cancel = () => {
      if (finished) return;
      cleanup();
      reject(new DOMException("İptal edildi", "AbortError"));
    };
    const fail = (s: string) => {
      if (finished) return;
      cleanup();
      reject(new Error(s));
    };
    const message = (e: MessageEvent) => {
      if (
        e.origin !== location.origin ||
        e.source !== frame.contentWindow ||
        e.data?.nonce !== nonce ||
        finished
      )
        return;
      if (e.data.type === "budget-photo-ready") {
        clearTimeout(readyTimer);
        frame.contentWindow?.postMessage(
          { type: "budget-photo-document", nonce, image: photo.jpeg },
          location.origin,
        );
      }
      if (e.data.type === "budget-photo-progress") {
        const progress = Number(e.data.progress);
        onProgress(
          e.data.status === "recognizing text"
            ? `Fiş okunuyor… %${Math.round(Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * 100)}`
            : "Fotoğraf okuyucu hazırlanıyor…",
        );
      }
      if (
        e.data.type === "budget-photo-result" &&
        typeof e.data.text === "string"
      ) {
        const result = {
          text: e.data.text.slice(0, 100000),
          confidence: Number(e.data.confidence) || 0,
        };
        cleanup();
        resolve(result);
      }
      if (e.data.type === "budget-photo-error")
        fail(
          "Fotoğraf okunamadı. Daha net bir fotoğrafla tekrar deneyebilir veya bilgileri elle tamamlayabilirsin.",
        );
    };
    const timer = setTimeout(
      () =>
        fail(
          "Fotoğraf okuma süresi doldu. Daha yakın bir fotoğrafla yeniden dene veya bilgileri elle tamamla.",
        ),
      180000,
    );
    const readyTimer = setTimeout(
      () =>
        fail(
          "Fotoğraf okuyucu yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.",
        ),
      20000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    window.addEventListener("message", message);
    document.body.appendChild(frame);
  });
}
