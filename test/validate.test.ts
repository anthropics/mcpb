import { execSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";

import { DEFAULT_MANIFEST_VERSION } from "../src/shared/constants";

interface ExecSyncError extends Error {
  stdout: Buffer;
  stderr: Buffer;
  status: number | null;
}

describe("Enhanced Validation", () => {
  const cliPath = join(__dirname, "../dist/cli/cli.js");
  const fixturesDir = join(__dirname, "fixtures", "validate");

  function createManifest(
    dir: string,
    overrides: Record<string, unknown> = {},
  ) {
    const manifest = {
      manifest_version: DEFAULT_MANIFEST_VERSION,
      name: "test-extension",
      version: "1.0.0",
      description: "Test extension for validation",
      author: { name: "Test Author" },
      server: {
        type: "node",
        entry_point: "server/index.js",
        mcp_config: {
          command: "node",
          args: ["${__dirname}/server/index.js"],
        },
      },
      ...overrides,
    };

    fs.writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
  }

  beforeAll(() => {
    execSync("yarn build", { cwd: join(__dirname, "..") });

    if (fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(fixturesDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  describe("entry point validation", () => {
    it("should fail when entry_point file is missing", () => {
      const dir = join(fixturesDir, "missing-entry");
      fs.mkdirSync(dir, { recursive: true });
      createManifest(dir);
      // Deliberately NOT creating server/index.js

      expect(() => {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: unknown) {
        const execError = error as ExecSyncError;
        const output = execError.stdout?.toString() || "";
        expect(output).toContain("Entry point file not found");
      }
    });

    it("should warn about extension mismatch (node type with .py file)", () => {
      const dir = join(fixturesDir, "ext-mismatch");
      fs.mkdirSync(join(dir, "server"), { recursive: true });
      fs.writeFileSync(join(dir, "server", "main.py"), "print('hello')");
      createManifest(dir, {
        server: {
          type: "node",
          entry_point: "server/main.py",
          mcp_config: { command: "node" },
        },
      });

      const result = execSync(`node ${cliPath} validate ${dir}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).toContain("Unusual entry point extension");
    });

    it("should fail when binary entry_point is not executable (Unix only)", () => {
      if (process.platform === "win32") {
        return;
      }

      const dir = join(fixturesDir, "binary-not-exec");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(join(dir, "myserver"), "#!/bin/sh\necho hi");
      fs.chmodSync(join(dir, "myserver"), 0o644);
      createManifest(dir, {
        server: {
          type: "binary",
          entry_point: "myserver",
          mcp_config: { command: "./myserver" },
        },
      });

      expect(() => {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: unknown) {
        const execError = error as ExecSyncError;
        const output = execError.stdout?.toString() || "";
        expect(output).toContain("not executable");
      }
    });

    it("should pass when binary entry_point is executable (Unix only)", () => {
      if (process.platform === "win32") {
        return;
      }

      const dir = join(fixturesDir, "binary-exec");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(join(dir, "myserver"), "#!/bin/sh\necho hi");
      fs.chmodSync(join(dir, "myserver"), 0o755);
      createManifest(dir, {
        server: {
          type: "binary",
          entry_point: "myserver",
          mcp_config: { command: "./myserver" },
        },
      });

      const result = execSync(`node ${cliPath} validate ${dir}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
    });
  });

  describe("command variable validation", () => {
    it("should fail on invalid variables like ${BUNDLE_ROOT}", () => {
      const dir = join(fixturesDir, "invalid-var");
      fs.mkdirSync(join(dir, "server"), { recursive: true });
      fs.writeFileSync(join(dir, "server", "index.js"), "// fixture");
      createManifest(dir, {
        server: {
          type: "node",
          entry_point: "server/index.js",
          mcp_config: {
            command: "node",
            args: ["${BUNDLE_ROOT}/server/index.js"],
          },
        },
      });

      expect(() => {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: unknown) {
        const execError = error as ExecSyncError;
        const output = execError.stdout?.toString() || "";
        expect(output).toContain("Invalid variable");
        expect(output).toContain("${BUNDLE_ROOT}");
      }
    });

    it("should fail on invalid variables in env values", () => {
      const dir = join(fixturesDir, "invalid-env-var");
      fs.mkdirSync(join(dir, "server"), { recursive: true });
      fs.writeFileSync(join(dir, "server", "index.js"), "// fixture");
      createManifest(dir, {
        server: {
          type: "node",
          entry_point: "server/index.js",
          mcp_config: {
            command: "node",
            args: ["${__dirname}/server/index.js"],
            env: { PATH: "${HOME}/bin" },
          },
        },
      });

      expect(() => {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: unknown) {
        const execError = error as ExecSyncError;
        const output = execError.stdout?.toString() || "";
        expect(output).toContain("Invalid variable");
        expect(output).toContain("${HOME}");
      }
    });

    it("should pass with valid variables: ${__dirname} and ${user_config.*}", () => {
      const dir = join(fixturesDir, "valid-vars");
      fs.mkdirSync(join(dir, "server"), { recursive: true });
      fs.writeFileSync(join(dir, "server", "index.js"), "// fixture");
      createManifest(dir, {
        server: {
          type: "node",
          entry_point: "server/index.js",
          mcp_config: {
            command: "node",
            args: [
              "${__dirname}/server/index.js",
              "--key",
              "${user_config.api_key}",
            ],
            env: { SEP: "${pathSeparator}" },
          },
        },
      });

      const result = execSync(`node ${cliPath} validate ${dir}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).not.toContain("Invalid variable");
    });

    it("should fail on invalid variables in platform_overrides", () => {
      const dir = join(fixturesDir, "invalid-platform-var");
      fs.mkdirSync(join(dir, "server"), { recursive: true });
      fs.writeFileSync(join(dir, "server", "index.js"), "// fixture");

      const manifest = {
        manifest_version: "0.3",
        name: "test-extension",
        version: "1.0.0",
        description: "Test",
        author: { name: "Test" },
        server: {
          type: "node",
          entry_point: "server/index.js",
          mcp_config: {
            command: "node",
            args: ["${__dirname}/server/index.js"],
            platform_overrides: {
              win32: {
                args: ["${APPDATA}/server/index.js"],
              },
            },
          },
        },
      };

      fs.writeFileSync(
        join(dir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
      );

      expect(() => {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${dir}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: unknown) {
        const execError = error as ExecSyncError;
        const output = execError.stdout?.toString() || "";
        expect(output).toContain("Invalid variable");
        expect(output).toContain("${APPDATA}");
      }
    });
  });

  describe("sensitive file detection", () => {
    it("should warn about credentials.json in project directory", () => {
      const dir = join(fixturesDir, "sensitive-files");
      fs.mkdirSync(join(dir, "server"), { recursive: true });
      fs.writeFileSync(join(dir, "server", "index.js"), "// fixture");
      fs.writeFileSync(join(dir, "credentials.json"), '{"secret": "value"}');
      createManifest(dir);

      const result = execSync(`node ${cliPath} validate ${dir}`, {
        encoding: "utf-8",
      });

      // Should pass (warnings only) but show the warning
      expect(result).toContain("Manifest schema validation passes!");
      expect(result).toContain("Potentially sensitive file");
      expect(result).toContain("credentials.json");
    });

    it("should warn about .pem files in project directory", () => {
      const dir = join(fixturesDir, "sensitive-pem");
      fs.mkdirSync(join(dir, "server"), { recursive: true });
      fs.writeFileSync(join(dir, "server", "index.js"), "// fixture");
      fs.writeFileSync(join(dir, "server.pem"), "--- CERT ---");
      createManifest(dir);

      const result = execSync(`node ${cliPath} validate ${dir}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).toContain("Potentially sensitive file");
      expect(result).toContain("server.pem");
    });
  });

  describe("happy path", () => {
    it("should pass with all files present and correct types", () => {
      const dir = join(fixturesDir, "happy-path");
      fs.mkdirSync(join(dir, "server"), { recursive: true });
      fs.writeFileSync(join(dir, "server", "index.js"), "// server code");
      createManifest(dir);

      const result = execSync(`node ${cliPath} validate ${dir}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).not.toContain("ERROR");
      expect(result).not.toContain("sensitive");
    });
  });
});
