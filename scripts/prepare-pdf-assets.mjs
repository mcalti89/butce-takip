import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
export function preparePdfAssets(root) {
  const source = dirname(require.resolve("pdfjs-dist/package.json"));
  const version = JSON.parse(
    readFileSync(join(source, "package.json")),
  ).version;
  const target = join(root, "assets/pdfjs", version);
  mkdirSync(target, { recursive: true });
  cpSync(join(source, "legacy/build/pdf.min.mjs"), join(target, "pdf.mjs"));
  cpSync(
    join(source, "legacy/build/pdf.worker.min.mjs"),
    join(target, "pdf.worker.mjs"),
  );
  for (const folder of ["cmaps", "standard_fonts", "wasm"])
    cpSync(join(source, folder), join(target, folder), { recursive: true });
  cpSync(join(source, "LICENSE"), join(target, "LICENSE"));
  const base = `/assets/pdfjs/${version}/`;
  writeFileSync(
    join(root, "receipt-pdf-runtime.mjs"),
    `export * from ${JSON.stringify(base + "pdf.mjs")};\nexport const assetBase = ${JSON.stringify(base)};\n`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  preparePdfAssets(resolve(process.argv[2] || "public"));
