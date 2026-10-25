import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM tooling scripts without type declarations
import { archiveName, releaseUrls, validateManifest } from "../tools/release-manifest.mjs";
// @ts-expect-error — plain ESM tooling scripts without type declarations
import { crc32, createZip } from "../tools/zip.mjs";

const REPO = "https://github.com/TacticalOtaku/Boss-Bars-5e";

/** Read a ZIP produced by createZip through its central directory. */
function readZip(zip: Buffer) {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let pos = zip.readUInt32LE(end + 16);
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(pos)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(pos + 16);
    const size = zip.readUInt32LE(pos + 20);
    const nameLength = zip.readUInt16LE(pos + 28);
    const offset = zip.readUInt32LE(pos + 42);
    const name = zip.toString("utf8", pos + 46, pos + 46 + nameLength);
    const localName = zip.readUInt16LE(offset + 26);
    const start = offset + 30 + localName;
    const data = inflateRawSync(zip.subarray(start, start + size));
    expect(crc32(data)).toBe(crc);
    files[name] = data.toString("utf8");
    pos += 46 + nameLength;
  }
  return files;
}

describe("createZip", () => {
  it("writes deflated entries that read back with matching checksums", () => {
    const zip = createZip([
      { name: "module.json", data: Buffer.from('{"id":"boss-bars-5e"}') },
      { name: "lang/ru.json", data: Buffer.from('{"Название":"Полосы боссов"}') },
    ]);
    expect(readZip(zip)).toEqual({
      "module.json": '{"id":"boss-bars-5e"}',
      "lang/ru.json": '{"Название":"Полосы боссов"}',
    });
  });

  it("is reproducible and refuses unsafe paths", () => {
    const entries = [{ name: "a.txt", data: Buffer.from("a") }];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
    for (const name of ["/abs.txt", "../up.txt", "dir\\file.txt"]) {
      expect(() => createZip([{ name, data: Buffer.from("x") }])).toThrow(/Unsafe/);
    }
  });

  it("computes the standard CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

describe("release manifest", () => {
  const manifest = JSON.parse(readFileSync("module.json", "utf8"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  it("points at the GitHub release of this version", () => {
    expect(archiveName("boss-bars-5e", "0.1.0")).toBe("boss-bars-5e-v0.1.0.zip");
    expect(releaseUrls(`${REPO}/`, "boss-bars-5e", "0.1.0")).toEqual({
      url: REPO,
      manifest: "https://raw.githubusercontent.com/TacticalOtaku/Boss-Bars-5e/main/module.json",
      download: `${REPO}/releases/download/v0.1.0/boss-bars-5e-v0.1.0.zip`,
    });
  });

  it("keeps module.json and package.json releasable together", () => {
    const repository = pkg.repository.url.replace(/\.git$/, "");
    expect(validateManifest(manifest, { version: pkg.version, repository, exists: () => true })).toEqual([]);
  });

  it("reports version drift, wrong URLs and missing files", () => {
    const problems = validateManifest(
      { ...manifest, version: "0.2.0", download: `${REPO}/old.zip` },
      { version: "0.1.0", repository: REPO, exists: (file: string) => file !== "styles/boss-bars-5e.css" },
    );
    expect(problems.join("\n")).toMatch(/version 0\.2\.0 differs/);
    expect(problems.join("\n")).toMatch(/download must be/);
    expect(problems.join("\n")).toMatch(/missing from the build: styles\/boss-bars-5e\.css/);
  });
});
