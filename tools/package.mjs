/**
 * Build a Foundry release from dist/module/: validates module.json, then writes dist/<id>-v<version>.zip
 * (module.json at the archive root, as Foundry expects), where the other TacticalOtaku modules keep their archives.
 * Foundry reads the manifest from the repository's main branch, so only the archive is attached to the release.
 * Run through `npm run release`, which checks and builds first.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { archiveName, validateManifest } from "./release-manifest.mjs";
import { createZip } from "./zip.mjs";

const root = resolve(".");
const out = join(root, "dist");
const dist = join(out, "module");
/** Source maps are left out: they double the download and are only useful with the repository at hand. */
const EXCLUDED = [/\.map$/];

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
if (!repository) fail("package.json needs a repository URL");

if (!existsSync(join(dist, "module.json")))
  fail("dist/module/module.json is missing — run `npm run build` first");
const manifest = JSON.parse(await readFile(join(dist, "module.json"), "utf8"));
const problems = validateManifest(manifest, {
  version: pkg.version,
  repository: repository.replace(/\.git$/, ""),
  exists: (file) => existsSync(join(dist, file)),
});
if (problems.length) fail(`module.json is not releasable:\n  - ${problems.join("\n  - ")}`);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    ),
  );
  return files.flat();
}

const files = (await listFiles(dist))
  .map((file) => relative(dist, file).split(sep).join("/"))
  .filter((name) => !EXCLUDED.some((pattern) => pattern.test(name)))
  .sort();
const entries = await Promise.all(
  files.map(async (name) => {
    const data = await readFile(join(dist, name));
    // Maps are not shipped, so the scripts must not point at them.
    return { name, data: name.endsWith(".js") ? stripSourceMapUrl(data) : data };
  }),
);

const target = join(out, archiveName(manifest.id, manifest.version));
// A released archive is a record of what users downloaded: never replace it by accident.
if (existsSync(target) && !process.argv.includes("--force")) {
  fail(`${target} already exists. Bump the version, or pass --force to replace an unreleased archive.`);
}
const zip = createZip(entries);
await writeFile(target, zip);

console.log(
  `Packaged ${manifest.id} ${manifest.version}: ${files.length} files, ${(zip.length / 1024).toFixed(1)} KiB`,
);
console.log(`  ${target}`);
console.log(`Push module.json to main and attach the archive to the GitHub release v${manifest.version}.`);

function stripSourceMapUrl(data) {
  return Buffer.from(data.toString("utf8").replace(/\n\/\/# sourceMappingURL=\S+\s*$/, "\n"), "utf8");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
