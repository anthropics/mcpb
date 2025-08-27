import { readFileSync } from "fs";
import { join } from "path";

import { McpbManifestSchema } from "../src/schemas.js";

describe("McpbManifestSchema", () => {
  it("should validate a valid manifest", () => {
    const manifestPath = join(__dirname, "valid-manifest.json");
    const manifestContent = readFileSync(manifestPath, "utf-8");
    const manifestData = JSON.parse(manifestContent);

    const result = McpbManifestSchema.safeParse(manifestData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("test-extension");
      expect(result.data.server.type).toBe("node");
    }
  });

  it("should reject an invalid manifest", () => {
    const manifestPath = join(__dirname, "invalid-manifest.json");
    const manifestContent = readFileSync(manifestPath, "utf-8");
    const manifestData = JSON.parse(manifestContent);

    const result = McpbManifestSchema.safeParse(manifestData);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => issue.path.join("."));
      expect(errors).toContain("author.name");
      expect(errors).toContain("author.email");
      expect(errors).toContain("server.type");
      expect(errors).toContain("server.mcp_config");
    }
  });

  it("should validate manifest with all optional fields", () => {
    const fullManifest = {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-08-26/mcpb.manifest.schema.json",
      name: "full-extension",
      display_name: "Full Featured Extension",
      version: "2.0.0",
      description: "An extension with all features",
      long_description: "This is a detailed description of the extension",
      author: {
        name: "Test Author",
        email: "test@example.com",
        url: "https://example.com",
      },
      repository: {
        type: "git",
        url: "https://github.com/example/extension",
      },
      homepage: "https://example.com/extension",
      documentation: "https://docs.example.com",
      support: "https://support.example.com",
      icon: "icon.png",
      screenshots: ["screenshot1.png", "screenshot2.png"],
      server: {
        type: "python",
        entry_point: "main.py",
        mcp_config: {
          command: "python",
          args: ["main.py"],
          env: { PYTHONPATH: "." },
        },
      },
      tools: [
        {
          name: "my_tool",
          description: "A useful tool",
        },
      ],
      keywords: ["test", "example"],
      license: "MIT",
      compatibility: {
        claude_desktop: ">=1.0.0",
        platforms: ["darwin", "win32"],
        runtimes: {
          python: ">=3.8",
          node: ">=16.0.0",
        },
      },
      user_config: {
        api_key: {
          type: "string",
          title: "API Key",
          description: "Your API key",
          required: true,
          sensitive: true,
        },
        max_results: {
          type: "number",
          title: "Max Results",
          description: "Maximum number of results",
          default: 10,
          min: 1,
          max: 100,
        },
      },
    };

    const result = McpbManifestSchema.safeParse(fullManifest);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display_name).toBe("Full Featured Extension");
      expect(result.data.tools).toHaveLength(1);
      expect(result.data.compatibility?.platforms).toContain("darwin");
      expect(result.data.user_config?.api_key.type).toBe("string");
    }
  });

  it("should validate server types correctly", () => {
    const serverTypes = ["python", "node", "binary"];

    serverTypes.forEach((type) => {
      const manifest = {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-08-26/mcpb.manifest.schema.json",
        name: "test",
        version: "1.0.0",
        description: "Test",
        author: { name: "Test" },
        server: {
          type,
          entry_point: "main",
          mcp_config: {
            command: type === "binary" ? "./main" : type,
            args: ["main"],
          },
        },
      };

      const result = McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });
  });

  describe("backward compatibility", () => {
    it("should accept manifest with dxt_version instead of $schema", () => {
      const legacyManifest = {
        dxt_version: "0.1",
        name: "legacy-extension",
        version: "1.0.0",
        description: "Legacy extension",
        author: { name: "Test Author" },
        server: {
          type: "node",
          entry_point: "server.js",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
      };

      const result = McpbManifestSchema.safeParse(legacyManifest);
      expect(result.success).toBe(true);
    });

    it("should accept manifest with $schema", () => {
      const modernManifest = {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-08-26/mcpb.manifest.schema.json",
        name: "modern-extension",
        version: "1.0.0",
        description: "Modern extension",
        author: { name: "Test Author" },
        server: {
          type: "node",
          entry_point: "server.js",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
      };

      const result = McpbManifestSchema.safeParse(modernManifest);
      expect(result.success).toBe(true);
    });

    it("should reject manifest without $schema or dxt_version", () => {
      const invalidManifest = {
        name: "invalid-extension",
        version: "1.0.0",
        description: "Invalid extension",
        author: { name: "Test Author" },
        server: {
          type: "node",
          entry_point: "server.js",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
      };

      const result = McpbManifestSchema.safeParse(invalidManifest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Either '$schema' or 'dxt_version' (deprecated) must be provided"
        );
      }
    });
  });
});
