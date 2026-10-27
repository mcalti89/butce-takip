import { preparePdfAssets } from "./prepare-pdf-assets.mjs";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  renameSync,
} from "node:fs";
import { join, resolve, relative, sep, basename, dirname } from "node:path";

const root = resolve(process.argv[2] || "web-dist");
const textExtensions = /\.(html|mjs|js|css|json|webmanifest)$/i;
preparePdfAssets(root);

// Expo exports dependency fonts under assets/node_modules. Static hosts and
// upload tools may exclude that directory even though these are public assets.
// Move the public subtree to a normal path, then update bundle references.
const dependencyAssets = join(root, "assets", "node_modules");
const vendorAssets = join(root, "assets", "vendor");
if (existsSync(dependencyAssets)) {
  if (existsSync(vendorAssets))
    throw new Error("Vercel varlık taşıma hedefi zaten mevcut: assets/vendor");
  renameSync(dependencyAssets, vendorAssets);
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

const renamedAssets = [];
for (const file of walk(root)) {
  if (!textExtensions.test(file)) continue;
  const before = readFileSync(file, "utf8");
  const after = before
    .replaceAll("assets/node_modules/", "assets/vendor/")
    .replaceAll("assets\\/node_modules\\/", "assets\\/vendor\\/");
  if (before === after) continue;

  writeFileSync(file, after);
  const relativeFile = relative(root, file).split(sep).join("/");
  if (!/^_expo\/static\/(js|css)\//.test(relativeFile)) continue;

  // Expo names its static bundles by content hash. Rewriting an asset path also
  // changes bundle bytes, so derive a fresh filename to defeat immutable caches.
  const hash = digest(after).slice(0, 32);
  const currentName = basename(file);
  const hashPattern = /-[a-f0-9]{32}(?=\.(?:js|css)$)/i;
  const nextName = hashPattern.test(currentName)
    ? currentName.replace(hashPattern, `-${hash}`)
    : currentName.replace(/\.(js|css)$/i, `-${hash}.$1`);
  const nextFile = join(dirname(file), nextName);
  if (nextFile !== file) {
    if (existsSync(nextFile))
      throw new Error(`İçerik-hash'li dosya zaten mevcut: ${nextName}`);
    renameSync(file, nextFile);
    renamedAssets.push({
      from: "/" + relativeFile,
      to: "/" + relative(root, nextFile).split(sep).join("/"),
    });
  }
}

// Update HTML and any other emitted text that points to a bundle whose content
// hash changed in the post-export rewrite.
if (renamedAssets.length) {
  for (const file of walk(root)) {
    if (!textExtensions.test(file)) continue;
    let content = readFileSync(file, "utf8");
    for (const asset of renamedAssets) {
      const escapedFrom = asset.from.replaceAll("/", "\\/");
      const escapedTo = asset.to.replaceAll("/", "\\/");
      content = content
        .replaceAll(asset.from, asset.to)
        .replaceAll(escapedFrom, escapedTo);
    }
    writeFileSync(file, content);
  }
}

const index = join(root, "index.html");
const html = readFileSync(index, "utf8");
if (!html.includes("manifest.webmanifest"))
  throw new Error("Web çıktı manifest linki içermiyor.");

const files = walk(root);
const paths = ["/"];
const hash = createHash("sha256").update(readFileSync(index));
for (const file of files.sort()) {
  const path = "/" + relative(root, file).split(sep).join("/");
  const staticAsset =
    /^\/(assets|_expo\/static|icons)\//.test(path) &&
    /\.(mjs|js|css|ttf|otf|woff2?|png|jpe?g|webp|svg)$/i.test(path);
  if (
    !staticAsset &&
    ![
      "/manifest.webmanifest",
      "/receipt-viewer.html",
      "/receipt-viewer.js",
      "/receipt-pdf-runtime.mjs",
    ].includes(path)
  )
    continue;
  if (statSync(file).size > 8 * 1024 * 1024)
    throw new Error(`Statik varlık 8 MB sınırını aşıyor: ${path}`);
  paths.push(path);
  hash.update(path).update(readFileSync(file));
}

const staleDependencyReferences = files.filter((file) => {
  if (!textExtensions.test(file)) return false;
  const content = readFileSync(file, "utf8");
  return (
    content.includes("assets/node_modules/") ||
    content.includes("assets\\/node_modules\\/")
  );
});
if (staleDependencyReferences.length)
  throw new Error(
    `Düzeltilmemiş Expo dependency asset yolları: ${staleDependencyReferences.map((file) => relative(root, file)).join(", ")}`,
  );

const version = hash.digest("hex").slice(0, 16);
let worker = readFileSync(resolve("public/sw.js"), "utf8");
worker = worker
  .replace('"budget-pwa-unbuilt"', JSON.stringify("budget-pwa-" + version))
  .replace(
    "const PRECACHE = [];",
    "const PRECACHE = " + JSON.stringify(paths, null, 2) + ";",
  );
writeFileSync(join(root, "sw.js"), worker);
// Do not cache the worker; browsers must discover new content versions.
writeFileSync(
  join(root, "_headers"),
  "/sw.js\n  Cache-Control: no-cache\n/manifest.webmanifest\n  Cache-Control: no-cache\n",
);
console.log(
  `PWA hazır: ${paths.length} statik yol, kabuk sürümü ${version}. Finansal/API veriler önbelleğe alınmaz.`,
);
