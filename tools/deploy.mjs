/**
 * Copy the built module (dist/module/) into the local Foundry Data/modules/boss-bars-5e folder.
 * Target root: FOUNDRY_DATA env var, or %LOCALAPPDATA%/FoundryVTT/Data.
 */
import { cp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const MODULE_ID = "boss-bars-5e";
const dist = resolve("dist", "module");

async function readManifestId(dir) {
  const manifest = join(dir, "module.json");
  if (!existsSync(manifest)) return null;
  return JSON.parse(await readFile(manifest, "utf8")).id ?? null;
}

const dataRoot =
  process.env.FOUNDRY_DATA ??
  (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "FoundryVTT", "Data") : null);
if (!dataRoot || !existsSync(join(dataRoot, "modules"))) {
  console.error(`Foundry Data folder not found (${dataRoot}). Set FOUNDRY_DATA.`);
  process.exit(1);
}

if ((await readManifestId(dist)) !== MODULE_ID) {
  console.error("dist/module/module.json is missing — run `npm run build` first.");
  process.exit(1);
}

const target = join(dataRoot, "modules", MODULE_ID);
if (existsSync(target)) {
  const existing = await readManifestId(target);
  if (existing !== MODULE_ID) {
    console.error(`Refusing to overwrite ${target}: it is not a ${MODULE_ID} install.`);
    process.exit(1);
  }
  await rm(target, { recursive: true });
}

await cp(dist, target, { recursive: true });
console.log(`Deployed ${MODULE_ID} → ${target}`);
