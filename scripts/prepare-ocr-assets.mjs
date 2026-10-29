import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
export function prepareOcrAssets(root) {
  const packageRoot = (name) =>
    dirname(require.resolve(name + "/package.json"));
  const engine = packageRoot("tesseract.js"),
    core = packageRoot("tesseract.js-core");
  const version = JSON.parse(
    readFileSync(join(engine, "package.json")),
  ).version;
  const coreVersion = JSON.parse(
    readFileSync(join(core, "package.json")),
  ).version;
  const revision = `${version}-core${coreVersion}-data1.0.0`;
  const target = join(root, "assets/ocr", revision);
  mkdirSync(target, { recursive: true });
  mkdirSync(join(target, "models"), { recursive: true });
  for (const file of [
    "tesseract.esm.min.js",
    "worker.min.js",
    "worker.min.js.LICENSE.txt",
  ])
    cpSync(join(engine, "dist", file), join(target, file));
  cpSync(join(engine, "LICENSE.md"), join(target, "LICENSE.tesseract.md"));
  cpSync(join(core, "LICENSE"), join(target, "LICENSE.core"));
  for (const name of ["tesseract-core-lstm", "tesseract-core-simd-lstm"]) {
    // Use the external-WASM build under the loader's expected filename, so the
    // large WASM binary is loaded only when OCR is requested, outside shell precaching.
    cpSync(join(core, name + ".js"), join(target, name + ".wasm.js"));
    cpSync(join(core, name + ".wasm"), join(target, name + ".wasm"));
  }
  for (const lang of ["eng", "tur"]) {
    const source = packageRoot("@tesseract.js-data/" + lang);
    cpSync(
      join(source, "4.0.0_best_int", lang + ".traineddata.gz"),
      join(target, "models", lang + ".traineddata.gz"),
    );
    cpSync(
      join(source, "package.json"),
      join(target, `LICENSE.${lang}.package.json`),
    );
  }
  const base = `/assets/ocr/${revision}/`;
  writeFileSync(
    join(root, "receipt-ocr-runtime.mjs"),
    `import Tesseract from ${JSON.stringify(base + "tesseract.esm.min.js")};\nexport const createWorker=Tesseract.createWorker;\nexport const assetBase=${JSON.stringify(base)};\n`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  prepareOcrAssets(resolve(process.argv[2] || "public"));
