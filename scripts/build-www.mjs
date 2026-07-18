/**
 * Copy static web assets into www/ for Capacitor.
 * Run: npm run build
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");

const files = [
  "index.html",
  "app.js",
  "config.js",
  "styles.css",
  "privacy.html",
  "terms.html",
  "store.html",
  "store.css",
  "site.webmanifest",
  ".nojekyll",
];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

for (const f of files) {
  const src = join(root, f);
  if (!existsSync(src)) {
    console.warn("skip missing:", f);
    continue;
  }
  cpSync(src, join(www, f));
}

const assetsSrc = join(root, "assets");
if (existsSync(assetsSrc)) {
  cpSync(assetsSrc, join(www, "assets"), { recursive: true });
}

// Capacitor loads from local bundle — invite links still use publicBaseUrl from config.js.
// Soften cache-bust query on local assets (optional; harmless if left).
let index = readFileSync(join(www, "index.html"), "utf8");
index = index
  .replace(/styles\.css\?v=[^"]+/g, "styles.css")
  .replace(/config\.js\?v=[^"]+/g, "config.js")
  .replace(/app\.js\?v=[^"]+/g, "app.js");
writeFileSync(join(www, "index.html"), index);

writeFileSync(
  join(www, "version.json"),
  JSON.stringify({ name: "Push Thru", builtAt: new Date().toISOString() }, null, 2)
);

console.log("www/ ready for Capacitor (" + files.length + " assets)");
