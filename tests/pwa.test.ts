import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
const root = resolve(import.meta.dirname, "..");
function harness(built = true) {
  const handlers: Record<string, (e: Record<string, unknown>) => void> = {};
  const deleted: string[] = [];
  const added: string[][] = [];
  let offline = false;
  let skipped = false;
  let claimed = false;
  const calls: string[] = [];
  const template = readFileSync(resolve(root, "public/sw.js"), "utf8");
  const source = built
    ? template
        .replace('"budget-pwa-unbuilt"', '"budget-pwa-test"')
        .replace(
          "const PRECACHE = [];",
          'const PRECACHE = ["/", "/icons/budget-192.png", "/_expo/static/js/web/entry-test.js"];',
        )
    : template;
  runInNewContext(source, {
    URL,
    Response,
    self: {
      location: { origin: "https://budget.example" },
      addEventListener: (
        name: string,
        cb: (e: Record<string, unknown>) => void,
      ) => {
        handlers[name] = cb;
      },
      clients: {
        claim: async () => {
          claimed = true;
        },
      },
      skipWaiting: () => {
        skipped = true;
      },
    },
    caches: {
      open: async () => ({
        addAll: async (paths: string[]) => {
          added.push(paths);
        },
      }),
      keys: async () => [
        "budget-pwa-old",
        "budget-pwa-test",
        "unrelated-cache",
      ],
      delete: async (key: string) => {
        deleted.push(key);
      },
      match: async (path: string) =>
        new Response(path === "/" ? "offline-shell" : "cached-asset"),
    },
    fetch: async (request: { url: string }) => {
      calls.push(request.url);
      if (offline) throw new Error("offline");
      return new Response("online-shell");
    },
  });
  const request = (path: string, mode = "cors", method = "GET") => {
    let response: Promise<Response> | undefined;
    handlers.fetch({
      request: {
        url: path.startsWith("http") ? path : "https://budget.example" + path,
        method,
        mode,
      },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    return response;
  };
  const lifecycle = async (name: string) => {
    let promise: Promise<void> | undefined;
    handlers[name]({
      waitUntil: (p: Promise<void>) => {
        promise = p;
      },
    });
    await promise;
  };
  return {
    handlers,
    request,
    lifecycle,
    deleted,
    added,
    calls,
    setOffline: () => {
      offline = true;
    },
    didSkip: () => skipped,
    didClaim: () => claimed,
  };
}
describe("Windows PWA", () => {
  it("manifest bağımsız pencere, Türkçe ve kare native ikonlarını tanımlar", () => {
    const m = JSON.parse(
      readFileSync(resolve(root, "public/manifest.webmanifest"), "utf8"),
    );
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("tr");
    expect(m.start_url).toBe("/");
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual([
      "192x192",
      "512x512",
    ]);
    for (const i of m.icons)
      expect(existsSync(resolve(root, "public" + i.src))).toBe(true);
    expect(readFileSync(resolve(root, "app/+html.tsx"), "utf8")).toContain(
      'href="/manifest.webmanifest"',
    );
  });
  it("geliştirme çalışanı boş varlık listesini önbelleğe almaz veya istek yakalamaz", async () => {
    const h = harness(false);
    await h.lifecycle("install");
    expect(h.added).toHaveLength(0);
    expect(h.request("/", "navigate")).toBeUndefined();
  });
  it("yayın çalışanı yalnızca exact statik kabuğu yükler", async () => {
    const h = harness();
    await h.lifecycle("install");
    expect(h.added[0]).toEqual([
      "/",
      "/icons/budget-192.png",
      "/_expo/static/js/web/entry-test.js",
    ]);
  });
  it("API, auth, depolama, POST ve başka site yanıtlarını yakalamaz", () => {
    const h = harness();
    for (const path of [
      "/api/health",
      "/api/budget",
      "/oauth/callback",
      "/manus-oauth/callback",
      "/manus-storage/user.csv",
      "/__manus/pwa/manifest.webmanifest",
    ])
      expect(h.request(path, "navigate")).toBeUndefined();
    expect(h.request("/", "cors", "POST")).toBeUndefined();
    expect(
      h.request("https://other.example/icons/budget-192.png"),
    ).toBeUndefined();
    expect(h.request("/private-data.json")).toBeUndefined();
    expect(h.request("/icons/budget-192.png?personal=1")).toBeUndefined();
  });
  it("çevrim içi kök gezinmesini ağdan alır", async () => {
    const h = harness();
    expect(await (await h.request("/", "navigate"))?.text()).toBe(
      "online-shell",
    );
    expect(h.calls).toHaveLength(1);
  });
  it("çevrim dışı durumda kök gezinmesi kabuğa döner", async () => {
    const h = harness();
    h.setOffline();
    expect(await (await h.request("/", "navigate"))?.text()).toBe(
      "offline-shell",
    );
    expect(h.request("/oauth/callback", "navigate")).toBeUndefined();
  });
  it("statik varlıklar cache-first alınır", async () => {
    const h = harness();
    expect(
      await (await h.request("/_expo/static/js/web/entry-test.js"))?.text(),
    ).toBe("cached-asset");
    expect(h.calls).toHaveLength(0);
  });
  it("aktivasyon yalnızca eski bütçe kabuklarını siler, localStorage ve başka cache etkilenmez", async () => {
    const h = harness();
    await h.lifecycle("activate");
    expect(h.deleted).toEqual(["budget-pwa-old"]);
    expect(h.didClaim()).toBe(true);
  });
  it("güncelleme yalnızca açık kullanıcı mesajıyla aktive edilir", () => {
    const h = harness();
    expect(h.didSkip()).toBe(false);
    h.handlers.message({ data: { type: "unrelated" } });
    expect(h.didSkip()).toBe(false);
    h.handlers.message({ data: { type: "SKIP_WAITING" } });
    expect(h.didSkip()).toBe(true);
  });
});
