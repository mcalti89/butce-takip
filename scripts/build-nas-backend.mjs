import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
const directory = new URL("../database/budget/", import.meta.url);
const schemas = await Promise.all(
  (await readdir(directory))
    .filter((name) => /^\d+-.*\.sql$/.test(name))
    .sort()
    .map((name) => readFile(new URL(name, directory), "utf8")),
);
await build({
  entryPoints: ["scripts/run-nas-backend.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "deploy/qnap-mysql/backend.cjs",
  define: { NAS_SCHEMA: JSON.stringify(schemas) },
  minify: true,
  legalComments: "eof",
});
