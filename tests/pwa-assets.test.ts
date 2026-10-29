import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const project = resolve(import.meta.dirname, "..");

describe("Vercel PWA varlık yolları", () => {
  it("dependency fontlarını normal vendor dizinine alır, bundle hash'ini yeniler ve tüm referansları günceller", () => {
    const root = mkdtempSync(join(tmpdir(), "budget-pwa-assets-"));
    try {
      const asset = "assets/node_modules/@expo/icons/Feather.hash.ttf";
      const originalEntry = `entry-${"a".repeat(32)}.js`;
      const entryDir = join(root, "_expo/static/js/web");
      mkdirSync(join(root, "assets/node_modules/@expo/icons"), {
        recursive: true,
      });
      mkdirSync(entryDir, { recursive: true });
      writeFileSync(join(root, asset), "test-font-bytes");
      writeFileSync(
        join(root, "index.html"),
        `<link href="/manifest.webmanifest"><script src="/_expo/static/js/web/${originalEntry}"></script>`,
      );
      writeFileSync(join(root, "manifest.webmanifest"), '{"name":"Bütçe"}');
      writeFileSync(
        join(entryDir, originalEntry),
        'const uri="/' + asset + '";',
      );

      const runPackager = () =>
        execFileSync(process.execPath, ["scripts/prepare-pwa.mjs", root], {
          cwd: project,
        });
      runPackager();

      const vendor = "assets/vendor/@expo/icons/Feather.hash.ttf";
      expect(existsSync(join(root, vendor))).toBe(true);
      expect(existsSync(join(root, "assets/node_modules"))).toBe(false);
      const entries = readdirSync(entryDir).filter((name) =>
        name.endsWith(".js"),
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]).not.toBe(originalEntry);
      const entryPath = `/_expo/static/js/web/${entries[0]}`;
      expect(readFileSync(join(root, "index.html"), "utf8")).toContain(
        entryPath,
      );
      expect(readFileSync(join(entryDir, entries[0]), "utf8")).toContain(
        vendor,
      );

      const worker = readFileSync(join(root, "sw.js"), "utf8");
      expect(worker).toContain(vendor);
      expect(worker).toContain("/receipt-ocr-runtime.mjs");
      expect(worker).not.toContain(".traineddata.gz");
      expect(worker).toContain(entryPath);
      expect(worker).not.toContain("assets/node_modules");
      expect(worker).not.toContain("budget-pwa-unbuilt");

      // Reprocessing the same export is safe and retains its content version.
      runPackager();
      expect(
        readdirSync(entryDir).filter((name) => name.endsWith(".js")),
      ).toEqual(entries);
      expect(readFileSync(join(root, "sw.js"), "utf8")).toBe(worker);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
