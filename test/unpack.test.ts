import fs from "node:fs";
import { join } from "node:path";

import { zipSync } from "fflate";

import { unpackExtension } from "../src/cli/unpack";

describe("unpackExtension", () => {
  const tmpRoot = join(__dirname, "temp-unpack-dir-entries");
  const mcpbPath = join(tmpRoot, "demo.mcpb");
  const outDir = join(tmpRoot, "out");

  beforeEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("unpacks archives that contain explicit directory entries", () => {
    // Standard ZIP tooling emits directory entries (keys ending in "/").
    const archive = zipSync({
      "manifest.json": new TextEncoder().encode("{}"),
      "server/": new Uint8Array(0),
      "server/index.js": new TextEncoder().encode("console.log('hi');"),
    });
    fs.writeFileSync(mcpbPath, archive);

    const ok = unpackExtension({ mcpbPath, outputDir: outDir, silent: true });

    return Promise.resolve(ok).then((result) => {
      expect(result).toBe(true);
      expect(fs.existsSync(join(outDir, "manifest.json"))).toBe(true);
      expect(fs.existsSync(join(outDir, "server", "index.js"))).toBe(true);
      // The directory entry must not be written as a file.
      expect(fs.statSync(join(outDir, "server")).isDirectory()).toBe(true);
    });
  });
});
