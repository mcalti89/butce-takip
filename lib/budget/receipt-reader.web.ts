import type { PickedReceipt } from "./receipt-model";
export async function readReceipt(
  file: PickedReceipt,
): Promise<{ text: string; sha256: string }> {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const text = await new Promise<string>((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = "Dekont metin okuyucu";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.referrerPolicy = "no-referrer";
    frame.src = `/receipt-reader.html#${nonce}`;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", message);
      frame.remove();
    };
    const message = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.contentWindow ||
        event.data?.nonce !== nonce
      )
        return;
      if (event.data.type === "budget-read-ready") {
        const data = bytes.slice().buffer;
        frame.contentWindow?.postMessage(
          { type: "budget-read-document", nonce, data },
          location.origin,
          [data],
        );
      }
      if (
        event.data.type === "budget-read-result" &&
        typeof event.data.text === "string"
      ) {
        cleanup();
        resolve(event.data.text);
      }
      if (event.data.type === "budget-read-error") {
        cleanup();
        reject(new Error(event.data.message));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("PDF okuma süresi doldu. Dosyayı tekrar seç."));
    }, 45000);
    window.addEventListener("message", message);
    document.body.appendChild(frame);
  });
  return { text, sha256 };
}
