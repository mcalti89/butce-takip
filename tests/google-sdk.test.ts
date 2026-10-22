import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleSdk } from "../lib/budget/googleSdk.web";
class FakeScript extends EventTarget {
  src = "";
  async = false;
  defer = false;
  dataset: Record<string, string> = {};
  isConnected = false;
  remove() {
    this.isConnected = false;
  }
}
let elements: FakeScript[];
let browser: EventTarget & { google?: GoogleSdk };
function sdk(): GoogleSdk {
  return {
    accounts: {
      id: { initialize: vi.fn(), renderButton: vi.fn(), cancel: vi.fn() },
    },
  };
}
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  elements = [];
  browser = new EventTarget();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    createElement: () => {
      const e = new FakeScript();
      elements.push(e);
      return e;
    },
    head: {
      appendChild: (e: FakeScript) => {
        e.isConnected = true;
      },
    },
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("Mobil Google SDK yükleme kurtarması", () => {
  it("20 saniyelik yavaş bağlantıyı eski 15 saniyelik hataya düşmeden tamamlar", async () => {
    const { loadGoogleSdk } = await import("../lib/budget/googleSdk.web");
    const pending = loadGoogleSdk();
    await vi.advanceTimersByTimeAsync(20000);
    expect(elements[0].isConnected).toBe(true);
    browser.google = sdk();
    elements[0].dispatchEvent(new Event("load"));
    await expect(pending).resolves.toBe(browser.google);
  });
  it("zaman aşımında indirmeyi iptal etmez ve geç yüklenince kurtarma olayı gönderir", async () => {
    const { loadGoogleSdk, GOOGLE_SDK_READY } =
      await import("../lib/budget/googleSdk.web");
    const ready = vi.fn();
    browser.addEventListener(GOOGLE_SDK_READY, ready);
    const pending = loadGoogleSdk();
    const rejected = expect(pending).rejects.toThrow("beklenenden uzun");
    await vi.advanceTimersByTimeAsync(45000);
    await rejected;
    expect(elements[0].isConnected).toBe(true);
    browser.google = sdk();
    elements[0].dispatchEvent(new Event("load"));
    expect(ready).toHaveBeenCalledOnce();
    await expect(loadGoogleSdk()).resolves.toBe(browser.google);
  });
  it("tekrar deneme devam eden fiziksel script isteğini paylaşır", async () => {
    const { loadGoogleSdk } = await import("../lib/budget/googleSdk.web");
    const first = loadGoogleSdk();
    expect(loadGoogleSdk()).toBe(first);
    const rejection = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(45000);
    await rejection;
    const second = loadGoogleSdk();
    expect(elements).toHaveLength(1);
    browser.google = sdk();
    elements[0].dispatchEvent(new Event("load"));
    await expect(second).resolves.toBe(browser.google);
  });
  it("kesilen ağ isteğinden sonra temiz bir istekle tekrar bağlanır", async () => {
    const { loadGoogleSdk } = await import("../lib/budget/googleSdk.web");
    const first = loadGoogleSdk();
    const rejection = expect(first).rejects.toThrow("Google’a ulaşılamadı");
    elements[0].dispatchEvent(new Event("error"));
    await rejection;
    const second = loadGoogleSdk();
    expect(elements).toHaveLength(2);
    expect(elements[0].isConnected).toBe(false);
    browser.google = sdk();
    elements[1].dispatchEvent(new Event("load"));
    await expect(second).resolves.toBe(browser.google);
  });
  it("hazır namespace varsa yeniden script indirmez", async () => {
    const { loadGoogleSdk } = await import("../lib/budget/googleSdk.web");
    browser.google = sdk();
    await expect(loadGoogleSdk()).resolves.toBe(browser.google);
    expect(elements).toHaveLength(0);
  });
  it("yarım yüklenmiş namespace girişe hazır sayılmaz; namespace sonradan tamamlanınca devam eder", async () => {
    const { loadGoogleSdk } = await import("../lib/budget/googleSdk.web");
    browser.google = { accounts: { id: {} } } as GoogleSdk;
    const pending = loadGoogleSdk();
    await vi.advanceTimersByTimeAsync(500);
    browser.google = sdk();
    await vi.advanceTimersByTimeAsync(250);
    await expect(pending).resolves.toBe(browser.google);
  });
});
