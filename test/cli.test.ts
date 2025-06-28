import { execSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";

interface ExecSyncError extends Error {
  stdout: Buffer;
  stderr: Buffer;
  status: number | null;
  signal: string | null;
}

describe("DXT CLI", () => {
  const cliPath = join(__dirname, "../dist/cli/cli.js");
  const validManifestPath = join(__dirname, "valid-manifest.json");
  const invalidManifestPath = join(__dirname, "invalid-manifest.json");

  beforeAll(() => {
    // Ensure the CLI is built
    execSync("yarn build", { cwd: join(__dirname, "..") });
  });

  it("should validate a valid manifest", () => {
    const result = execSync(`node ${cliPath} validate ${validManifestPath}`, {
      encoding: "utf-8",
    });
    expect(result).toContain("Manifest is valid!");
  });

  it("should reject an invalid manifest", () => {
    expect(() => {
      execSync(`node ${cliPath} validate ${invalidManifestPath}`, {
        encoding: "utf-8",
      });
    }).toThrow();
  });

  it("should show usage when no arguments provided", () => {
    try {
      execSync(`node ${cliPath}`, { encoding: "utf-8", stdio: "pipe" });
    } catch (error) {
      // Commander outputs help to stderr when no command is provided
      const execError = error as ExecSyncError;
      expect(execError.stderr.toString()).toContain(
        "Usage: dxt [options] [command]",
      );
    }
  });

  it("should handle non-existent files", () => {
    try {
      execSync(`node ${cliPath} validate /non/existent/file.json`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
      fail("Should have thrown an error");
    } catch (error) {
      const execError = error as ExecSyncError;
      expect(execError.stderr.toString()).toContain("ERROR: File not found");
    }
  });

  it("should handle invalid JSON", () => {
    const invalidJsonPath = join(__dirname, "invalid-json.json");
    fs.writeFileSync(invalidJsonPath, "{ invalid json }");

    try {
      execSync(`node ${cliPath} validate ${invalidJsonPath}`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
      fail("Should have thrown an error");
    } catch (error) {
      const execError = error as ExecSyncError;
      expect(execError.stderr.toString()).toContain("ERROR: Invalid JSON");
    }

    // Clean up
    fs.unlinkSync(invalidJsonPath);
  });

  describe("pack and unpack", () => {
    const tempDir = join(__dirname, "temp-pack-test");
    const packedFilePath = join(__dirname, "test-extension.dxt");
    const unpackedDir = join(__dirname, "temp-unpack-test");

    beforeAll(() => {
      // Ensure the CLI is built
      execSync("yarn build", { cwd: join(__dirname, "..") });
      // Create a temporary directory with some files
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(
        join(tempDir, "manifest.json"),
        JSON.stringify({
          dxt_version: "1.0",
          name: "Test Extension",
          version: "1.0.0",
          description: "A test extension",
          author: {
            name: "DXT",
          },
          server: {
            type: "node",
            entry_point: "server/index.js",
            mcp_config: {
              command: "node",
            },
          },
        }),
      );
      fs.writeFileSync(join(tempDir, "file1.txt"), "hello");
      fs.mkdirSync(join(tempDir, "subdir"));
      fs.writeFileSync(join(tempDir, "subdir", "file2.txt"), "world");
    });

    afterAll(() => {
      // Clean up temporary files and directories
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(unpackedDir, { recursive: true, force: true });
      if (fs.existsSync(packedFilePath)) {
        fs.unlinkSync(packedFilePath);
      }
    });

    it("should pack an extension", () => {
      execSync(`node ${cliPath} pack ${tempDir} ${packedFilePath}`, {
        encoding: "utf-8",
      });
      expect(fs.existsSync(packedFilePath)).toBe(true);
    });

    it("should unpack an extension", () => {
      execSync(`node ${cliPath} unpack ${packedFilePath} ${unpackedDir}`, {
        encoding: "utf-8",
      });
      expect(fs.existsSync(unpackedDir)).toBe(true);
      expect(fs.existsSync(join(unpackedDir, "manifest.json"))).toBe(true);
      expect(fs.existsSync(join(unpackedDir, "file1.txt"))).toBe(true);
      expect(fs.existsSync(join(unpackedDir, "subdir", "file2.txt"))).toBe(
        true,
      );
    });

    it("should have the same content after packing and unpacking", () => {
      const originalManifest = fs.readFileSync(
        join(tempDir, "manifest.json"),
        "utf-8",
      );
      const unpackedManifest = fs.readFileSync(
        join(unpackedDir, "manifest.json"),
        "utf-8",
      );
      expect(originalManifest).toEqual(unpackedManifest);

      const originalFile1 = fs.readFileSync(
        join(tempDir, "file1.txt"),
        "utf-8",
      );
      const unpackedFile1 = fs.readFileSync(
        join(unpackedDir, "file1.txt"),
        "utf-8",
      );
      expect(originalFile1).toEqual(unpackedFile1);

      const originalFile2 = fs.readFileSync(
        join(tempDir, "subdir", "file2.txt"),
        "utf-8",
      );
      const unpackedFile2 = fs.readFileSync(
        join(unpackedDir, "subdir", "file2.txt"),
        "utf-8",
      );
      expect(originalFile2).toEqual(unpackedFile2);
    });
  });
});
