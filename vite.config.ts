import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Static module files that Foundry loads directly from the package root. */
const STATIC_ENTRIES = ["module.json", "lang", "templates", "assets", "LICENSE", "README.md", "CHANGELOG.md"];

function copyStaticFiles(outDir: string): Plugin {
  return {
    name: "boss-bars-5e-copy-static",
    apply: "build",
    async closeBundle() {
      for (const entry of STATIC_ENTRIES) {
        const source = resolve(entry);
        if (!existsSync(source)) continue;
        const target = resolve(outDir, entry);
        await rm(target, { recursive: true, force: true });
        await cp(source, target, { recursive: true });
      }
    },
  };
}

/** The package itself; release archives are written next to it, in dist/. */
const outDir = "dist/module";

export default defineConfig(({ command }) =>
  // `npm run stand` serves the fixture stand; it is never part of the package.
  command === "serve"
    ? { root: "stand" }
    : {
        publicDir: false,
        build: {
          outDir,
          emptyOutDir: true,
          sourcemap: true,
          minify: false,
          target: "es2023",
          lib: {
            entry: resolve("src/main.ts"),
            formats: ["es"],
            fileName: () => "scripts/boss-bars-5e.js",
            cssFileName: "styles/boss-bars-5e",
          },
          // GM windows load through import(); hashed names keep a stale cached chunk from surviving an update.
          rollupOptions: { output: { chunkFileNames: "scripts/[name]-[hash].js" } },
        },
        plugins: [copyStaticFiles(outDir)],
      },
);
