// Load the official Google SDK once. A slow network must not cancel the script
// or leave the page permanently stuck after the SDK eventually arrives.
export type GoogleSdk = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        nonce: string;
        auto_select: boolean;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => void;
      cancel: () => void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleSdk;
  }
}
export const GOOGLE_SDK_READY = "budget-google-sdk-ready";
let script: HTMLScriptElement | undefined;
let pending: Promise<GoogleSdk> | undefined;
export function loadedGoogleSdk() {
  const sdk = window.google;
  return typeof sdk?.accounts?.id?.initialize === "function" &&
    typeof sdk.accounts.id.renderButton === "function"
    ? sdk
    : undefined;
}
export function loadGoogleSdk(): Promise<GoogleSdk> {
  const sdk = loadedGoogleSdk();
  if (sdk) return Promise.resolve(sdk);
  if (pending) return pending;
  if (!script?.isConnected) {
    const element = document.createElement("script");
    element.src = "https://accounts.google.com/gsi/client";
    element.async = true;
    element.defer = true;
    element.dataset.budgetGoogleSdk = "true";
    element.addEventListener("load", () => {
      element.dataset.loaded = "true";
      if (loadedGoogleSdk()) window.dispatchEvent(new Event(GOOGLE_SDK_READY));
    });
    element.addEventListener("error", () => {
      element.remove();
      if (script === element) script = undefined;
    });
    script = element;
  }
  const element = script;
  const request = new Promise<GoogleSdk>((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(poll);
      element.removeEventListener("load", check);
      element.removeEventListener("error", fail);
    };
    const check = () => {
      const sdk = loadedGoogleSdk();
      if (!finished && sdk) {
        finished = true;
        cleanup();
        resolve(sdk);
      }
    };
    const fail = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(
        new Error(
          "Google’a ulaşılamadı. Bağlantını veya içerik engelleyicini kontrol et.",
        ),
      );
    };
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      // Keep a still-loading script connected: mobile browsers may finish it
      // after this waiting period. The ready event will recover the UI.
      if (element.dataset.loaded && !loadedGoogleSdk()) {
        element.remove();
        if (script === element) script = undefined;
      }
      reject(
        new Error(
          "Google bağlantısı beklenenden uzun sürdü. Yeniden deneyebilirsin; bağlantı tamamlandığında giriş düğmesi otomatik açılacak.",
        ),
      );
    }, 45000);
    const poll = setInterval(check, 250);
    element.addEventListener("load", check);
    element.addEventListener("error", fail);
    if (!element.isConnected) document.head.appendChild(element);
  });
  pending = request;
  const release = () => {
    if (pending === request) pending = undefined;
  };
  void request.then(release, release);
  return request;
}
