import { createWorker, assetBase } from "/receipt-ocr-runtime.mjs";
// Keep ownership of the underlying worker even if language initialization fails
// before Tesseract's createWorker promise can return its public handle.
const activeWorkers = new Set();
const NativeWorker = globalThis.Worker;
globalThis.Worker = class extends NativeWorker {
  constructor(...args) {
    super(...args);
    activeWorkers.add(this);
  }
  terminate() {
    activeWorkers.delete(this);
    super.terminate();
  }
};
const nonce = location.hash.slice(1),
  send = (type, extra = {}) =>
    parent.postMessage({ type, nonce, ...extra }, location.origin);
let worker,
  started = false,
  disposed = false;
const dispose = () => {
  disposed = true;
  for (const running of activeWorkers) running.terminate();
  void worker?.terminate();
};
addEventListener("pagehide", dispose);
addEventListener("message", async (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== parent ||
    event.data?.nonce !== nonce
  )
    return;
  if (event.data.type === "budget-photo-cancel") {
    dispose();
    return;
  }
  if (started || event.data.type !== "budget-photo-document") return;
  started = true;
  try {
    const image = event.data.image;
    if (
      typeof image !== "string" ||
      image.length > 5 * 1024 * 1024 ||
      !image.startsWith("data:image/jpeg;base64,")
    )
      throw new Error();
    worker = await createWorker(["eng", "tur"], 1, {
      workerPath: assetBase + "worker.min.js",
      workerBlobURL: false,
      corePath: assetBase,
      langPath: assetBase + "models",
      cacheMethod: "none",
      gzip: true,
      errorHandler: () => {
        if (!disposed) send("budget-photo-error");
        dispose();
      },
      logger: (m) => {
        if (!disposed)
          send("budget-photo-progress", {
            status: m.status,
            progress: m.progress,
          });
      },
    });
    if (disposed) {
      await worker.terminate();
      return;
    }
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const result = await worker.recognize(image, {}, { text: true });
    if (!disposed)
      send("budget-photo-result", {
        text: result.data.text.slice(0, 100000),
        confidence: result.data.confidence,
      });
  } catch {
    if (!disposed) send("budget-photo-error");
  } finally {
    await worker?.terminate();
    worker = null;
  }
});
send("budget-photo-ready");
