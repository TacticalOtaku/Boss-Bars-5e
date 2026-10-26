// Spec §12 budget: the JS every client loads for the HUD (the entry and its static imports) stays under ~100 kB
// gzip. GM windows are dynamic imports and fonts separate files, so neither counts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const LIMIT = 100 * 1024;
const dir = fileURLToPath(new URL("../dist/module/scripts/", import.meta.url));
const STATIC = /(?:^|[;\n])\s*(?:import|export)\s*(?:[^"';]*?\s*from\s*)?"\.\/([^"]+\.js)"/g;

const seen = new Set();
const queue = ["boss-bars-5e.js"];
let total = 0;
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const code = readFileSync(join(dir, file));
  total += gzipSync(code).length;
  for (const [, next] of code.toString().matchAll(STATIC)) queue.push(next);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
console.log(`HUD JS: ${kb(total)} gzip in ${seen.size} files (limit ${kb(LIMIT)})`);
if (total > LIMIT) process.exit(1);
