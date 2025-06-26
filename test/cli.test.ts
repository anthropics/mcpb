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
});
