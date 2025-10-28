import { execSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import path from "node:path";

describe("Icon Validation", () => {
  const cliPath = join(__dirname, "../dist/cli/cli.js");
  const testFixturesDir = join(__dirname, "fixtures", "icon-validation");

  beforeAll(() => {
    // Ensure the CLI is built
    execSync("yarn build", { cwd: join(__dirname, "..") });

    // Create test fixtures directory
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }

    // Create a valid PNG file (1x1 transparent pixel)
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);
    fs.writeFileSync(join(testFixturesDir, "valid-icon.png"), validPngBuffer);

    // Create an invalid (non-PNG) file
    fs.writeFileSync(join(testFixturesDir, "invalid-icon.jpg"), "Not a PNG file");

    // Create test manifests
    createTestManifest("valid-local-icon.json", {
      icon: "valid-icon.png",
    });

    createTestManifest("invalid-remote-url.json", {
      icon: "https://example.com/icon.png",
    });

    createTestManifest("invalid-dirname-variable.json", {
      icon: "${__dirname}/icon.png",
    });

    createTestManifest("invalid-absolute-path.json", {
      icon: "/absolute/path/to/icon.png",
    });

    createTestManifest("invalid-missing-file.json", {
      icon: "missing-icon.png",
    });

    createTestManifest("invalid-non-png.json", {
      icon: "invalid-icon.jpg",
    });

    createTestManifest("no-icon.json", {
      // No icon field
    });
  });

  afterAll(() => {
    // Clean up test fixtures
    if (fs.existsSync(testFixturesDir)) {
      fs.rmSync(testFixturesDir, { recursive: true, force: true });
    }
  });

  function createTestManifest(filename: string, iconConfig: { icon?: string }) {
    const manifest = {
      manifest_version: "0.3",
      name: "test-extension",
      version: "1.0.0",
      description: "Test extension for icon validation",
      author: {
        name: "Test Author",
      },
      server: {
        type: "node",
        entry_point: "server/index.js",
        mcp_config: {
          command: "node",
          args: ["${__dirname}/server/index.js"],
        },
      },
      ...iconConfig,
    };

    fs.writeFileSync(
      join(testFixturesDir, filename),
      JSON.stringify(manifest, null, 2)
    );
  }

  describe("Valid icon configurations", () => {
    it("should pass validation with a valid local PNG icon", () => {
      const manifestPath = join(testFixturesDir, "valid-local-icon.json");
      const result = execSync(`node ${cliPath} validate ${manifestPath}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).toContain("Icon validation passed");
    });

    it("should pass validation when no icon is specified", () => {
      const manifestPath = join(testFixturesDir, "no-icon.json");
      const result = execSync(`node ${cliPath} validate ${manifestPath}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).not.toContain("Icon validation");
    });
  });

  describe("Invalid icon configurations", () => {
    it("should warn about remote URL icons but not fail", () => {
      const manifestPath = join(testFixturesDir, "invalid-remote-url.json");

      const result = execSync(`node ${cliPath} validate ${manifestPath}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).toContain("Icon validation warnings");
      expect(result).toContain("Icon path uses a remote URL");
      expect(result).toContain("Best practice for local MCP servers");
      expect(result).toContain("Claude Desktop currently only supports local");
      expect(result).not.toContain("ERROR");
    });

    it("should reject icons with ${__dirname} variable", () => {
      const manifestPath = join(testFixturesDir, "invalid-dirname-variable.json");

      expect(() => {
        execSync(`node ${cliPath} validate ${manifestPath}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${manifestPath}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: any) {
        const output = error.stdout?.toString() || "";
        expect(output).toContain("Icon validation failed");
        expect(output).toContain("${__dirname}");
        expect(output).toContain("simple relative path");
      }
    });

    it("should reject absolute paths", () => {
      const manifestPath = join(testFixturesDir, "invalid-absolute-path.json");

      expect(() => {
        execSync(`node ${cliPath} validate ${manifestPath}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${manifestPath}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: any) {
        const output = error.stdout?.toString() || "";
        expect(output).toContain("Icon validation failed");
        expect(output).toContain("relative to the bundle root");
      }
    });

    it("should reject missing icon files", () => {
      const manifestPath = join(testFixturesDir, "invalid-missing-file.json");

      expect(() => {
        execSync(`node ${cliPath} validate ${manifestPath}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${manifestPath}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: any) {
        const output = error.stdout?.toString() || "";
        expect(output).toContain("Icon validation failed");
        expect(output).toContain("not found");
      }
    });

    it("should reject non-PNG files", () => {
      const manifestPath = join(testFixturesDir, "invalid-non-png.json");

      expect(() => {
        execSync(`node ${cliPath} validate ${manifestPath}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      }).toThrow();

      try {
        execSync(`node ${cliPath} validate ${manifestPath}`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error: any) {
        const output = error.stdout?.toString() || "";
        expect(output).toContain("Icon validation failed");
        expect(output).toContain("PNG format");
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle icons in subdirectories", () => {
      // Create subdirectory and icon
      const assetsDir = join(testFixturesDir, "assets");
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir);
      }

      const validPngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
        0x42, 0x60, 0x82,
      ]);
      fs.writeFileSync(join(assetsDir, "icon.png"), validPngBuffer);

      createTestManifest("valid-subdirectory-icon.json", {
        icon: "assets/icon.png",
      });

      const manifestPath = join(testFixturesDir, "valid-subdirectory-icon.json");
      const result = execSync(`node ${cliPath} validate ${manifestPath}`, {
        encoding: "utf-8",
      });

      expect(result).toContain("Manifest schema validation passes!");
      expect(result).toContain("Icon validation passed");
    });
  });

});

