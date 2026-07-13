import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getAllFiles, getAllFilesWithCount } from "../src/node/files.js";

// Creating symlinks on Windows requires elevated privileges or Developer
// Mode; junctions do not, and Node ignores the type argument elsewhere.
function trySymlinkDir(target: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(target, linkPath, "junction");
    return true;
  } catch {
    return false;
  }
}

describe("Symlink cycle handling", () => {
  let tempDir: string;
  let extensionDir: string;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpb-symlink-test-"));
    extensionDir = path.join(tempDir, "extension");
    fs.mkdirSync(extensionDir);
    fs.writeFileSync(path.join(extensionDir, "manifest.json"), "{}");
    fs.writeFileSync(path.join(extensionDir, "index.js"), "console.log('hi')");
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should skip a self-referential symlink instead of failing with ELOOP", () => {
    if (!trySymlinkDir(extensionDir, path.join(extensionDir, "selfloop"))) {
      return; // symlinks not supported in this environment
    }

    const { files } = getAllFilesWithCount(extensionDir);

    expect(Object.keys(files).sort()).toEqual(["index.js", "manifest.json"]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("selfloop"));
  });

  it("should skip mutually recursive symlinks instead of failing with ELOOP", () => {
    const dirA = path.join(extensionDir, "a");
    const dirB = path.join(extensionDir, "b");
    fs.mkdirSync(dirA);
    fs.mkdirSync(dirB);
    fs.writeFileSync(path.join(dirA, "a.txt"), "a");
    fs.writeFileSync(path.join(dirB, "b.txt"), "b");
    if (
      !trySymlinkDir(dirB, path.join(dirA, "to-b")) ||
      !trySymlinkDir(dirA, path.join(dirB, "to-a"))
    ) {
      return; // symlinks not supported in this environment
    }

    const { files } = getAllFilesWithCount(extensionDir);
    const packedPaths = Object.keys(files).sort();

    // Real files are packed; the walk terminates instead of raising ELOOP.
    expect(packedPaths).toContain("a/a.txt");
    expect(packedPaths).toContain("b/b.txt");
    expect(packedPaths).toContain("index.js");
    expect(packedPaths).toContain("manifest.json");
  });

  it("should still follow symlinks that do not form a cycle", () => {
    const sharedDir = path.join(tempDir, "shared");
    fs.mkdirSync(sharedDir);
    fs.writeFileSync(path.join(sharedDir, "shared.txt"), "shared");
    if (!trySymlinkDir(sharedDir, path.join(extensionDir, "linked"))) {
      return; // symlinks not supported in this environment
    }

    const { files } = getAllFilesWithCount(extensionDir);

    expect(Object.keys(files).sort()).toEqual([
      "index.js",
      "linked/shared.txt",
      "manifest.json",
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("getAllFiles should also skip symlink cycles", () => {
    if (!trySymlinkDir(extensionDir, path.join(extensionDir, "selfloop"))) {
      return; // symlinks not supported in this environment
    }

    const files = getAllFiles(extensionDir);

    expect(Object.keys(files).sort()).toEqual(["index.js", "manifest.json"]);
  });
});
