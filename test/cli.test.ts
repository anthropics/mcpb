import { execSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";

import { DEFAULT_MANIFEST_VERSION } from "../src/shared/constants";

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
    expect(result).toContain("Manifest schema validation passes!");
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
        "Usage: mcpb [options] [command]",
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

  describe("icon validation integration", () => {
    const testDir = join(__dirname, "icon-test");

    beforeAll(() => {
      // Create test directory
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      // Create a valid PNG file (1x1 transparent pixel)
      const validPngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      fs.writeFileSync(join(testDir, "icon.png"), validPngBuffer);
    });

    afterAll(() => {
      // Clean up test directory
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should pass validation with valid local icon", () => {
      const manifestWithIcon = join(testDir, "manifest-with-icon.json");
      fs.writeFileSync(
        manifestWithIcon,
        JSON.stringify({
          manifest_version: DEFAULT_MANIFEST_VERSION,
          name: "test-with-icon",
          version: "1.0.0",
          description: "Test with icon",
          author: { name: "Test" },
          icon: "icon.png",
          server: {
            type: "node",
            entry_point: "server/index.js",
            mcp_config: { command: "node" },
          },
        }),
      );

      const result = execSync(`node ${cliPath} validate ${manifestWithIcon}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).toContain("Icon validation");
    });

    it("should warn about manifest with remote icon URL but not fail", () => {
      const manifestWithUrl = join(testDir, "manifest-with-url.json");
      fs.writeFileSync(
        manifestWithUrl,
        JSON.stringify({
          manifest_version: DEFAULT_MANIFEST_VERSION,
          name: "test-with-url",
          version: "1.0.0",
          description: "Test with URL",
          author: { name: "Test" },
          icon: "https://example.com/icon.png",
          server: {
            type: "node",
            entry_point: "server/index.js",
            mcp_config: { command: "node" },
          },
        }),
      );

      const result = execSync(`node ${cliPath} validate ${manifestWithUrl}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).toContain("Icon validation warnings");
      expect(result).toContain("Icon path uses a remote URL");
    });
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
          manifest_version: DEFAULT_MANIFEST_VERSION,
          name: "Test Extension",
          version: "1.0.0",
          description: "A test extension",
          author: {
            name: "MCPB",
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

    it("should preserve executable file permissions after packing and unpacking", () => {
      // Skip this test on Windows since it doesn't support Unix permissions
      if (process.platform === "win32") {
        return;
      }

      const tempExecDir = join(__dirname, "temp-exec-test");
      const execPackedFilePath = join(__dirname, "test-exec-extension.dxt");
      const execUnpackedDir = join(__dirname, "temp-exec-unpack-test");

      try {
        // Create a temporary directory with an executable file
        fs.mkdirSync(tempExecDir, { recursive: true });
        fs.writeFileSync(
          join(tempExecDir, "manifest.json"),
          JSON.stringify({
            manifest_version: DEFAULT_MANIFEST_VERSION,
            name: "Test Executable Extension",
            version: "1.0.0",
            description: "A test extension with executable files",
            author: {
              name: "MCPB",
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

        // Create an executable script
        const executableScript = join(tempExecDir, "run-script.sh");
        fs.writeFileSync(
          executableScript,
          "#!/bin/bash\necho 'Hello from executable'",
        );
        fs.chmodSync(executableScript, 0o755); // Make it executable

        // Create a regular file for comparison
        const regularFile = join(tempExecDir, "regular-file.txt");
        fs.writeFileSync(regularFile, "regular content");
        fs.chmodSync(regularFile, 0o644); // Regular file permissions

        // Pack the extension
        execSync(`node ${cliPath} pack ${tempExecDir} ${execPackedFilePath}`, {
          encoding: "utf-8",
        });

        // Unpack the extension
        execSync(
          `node ${cliPath} unpack ${execPackedFilePath} ${execUnpackedDir}`,
          {
            encoding: "utf-8",
          },
        );

        // Check that the executable file preserved its permissions
        const originalStats = fs.statSync(executableScript);
        const unpackedStats = fs.statSync(
          join(execUnpackedDir, "run-script.sh"),
        );

        // Check that executable permissions are preserved (0o755)
        expect(unpackedStats.mode & 0o777).toBe(0o755);
        expect(originalStats.mode & 0o777).toBe(unpackedStats.mode & 0o777);

        // Check that regular file permissions are preserved (0o644)
        const originalRegularStats = fs.statSync(regularFile);
        const unpackedRegularStats = fs.statSync(
          join(execUnpackedDir, "regular-file.txt"),
        );

        expect(unpackedRegularStats.mode & 0o777).toBe(0o644);
        expect(originalRegularStats.mode & 0o777).toBe(
          unpackedRegularStats.mode & 0o777,
        );
      } finally {
        // Clean up
        fs.rmSync(tempExecDir, { recursive: true, force: true });
        fs.rmSync(execUnpackedDir, { recursive: true, force: true });
        if (fs.existsSync(execPackedFilePath)) {
          fs.unlinkSync(execPackedFilePath);
        }
      }
    });
  });
});
