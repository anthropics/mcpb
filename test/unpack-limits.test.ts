import fs from "node:fs";
import { join } from "node:path";

import { zipSync } from "fflate";

import { unpackExtension } from "../src/cli/unpack";

describe("unpackExtension decompression limits", () => {
  const tmpRoot = join(__dirname, "temp-unpack-limits");
  const mcpbPath = join(tmpRoot, "demo.mcpb");
  const outDir = join(tmpRoot, "out");

  beforeEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeArchive(files: Record<string, Uint8Array>): void {
    fs.writeFileSync(mcpbPath, zipSync(files));
  }

  it("unpacks a normal archive within the default limits", async () => {
    writeArchive({
      "manifest.json": new TextEncoder().encode("{}"),
      "index.js": new TextEncoder().encode("console.log(1);"),
    });

    const ok = await unpackExtension({
      mcpbPath,
      outputDir: outDir,
      silent: true,
    });

    expect(ok).toBe(true);
    expect(fs.existsSync(join(outDir, "index.js"))).toBe(true);
  });

  it("rejects an archive whose declared uncompressed size exceeds the limit", async () => {
    writeArchive({
      "big.bin": new Uint8Array(2000),
    });

    const ok = await unpackExtension({
      mcpbPath,
      outputDir: outDir,
      silent: true,
      maxUncompressedBytes: 100,
    });

    expect(ok).toBe(false);
    expect(fs.existsSync(join(outDir, "big.bin"))).toBe(false);
  });

  it("rejects an archive that declares more entries than the limit", async () => {
    writeArchive({
      "a.txt": new TextEncoder().encode("a"),
      "b.txt": new TextEncoder().encode("b"),
      "c.txt": new TextEncoder().encode("c"),
    });

    const ok = await unpackExtension({
      mcpbPath,
      outputDir: outDir,
      silent: true,
      maxEntries: 1,
    });

    expect(ok).toBe(false);
  });
});
