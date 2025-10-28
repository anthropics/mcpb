import { readFileSync } from "fs";
import { join } from "path";

import { McpbManifestSchema, v0_2, v0_3 } from "../src/schemas/index.js";

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

  it("should accept a 0.2 manifest when upgraded to 0.3", () => {
    const manifestPath = join(__dirname, "valid-manifest-0.2.json");
    const manifestContent = readFileSync(manifestPath, "utf-8");
    const manifestData = JSON.parse(manifestContent);

    const legacyResult = v0_2.McpbManifestSchema.safeParse(manifestData);
    expect(legacyResult.success).toBe(true);

    const upgradedManifest = {
      ...manifestData,
      manifest_version: "0.3",
    };
    const upgradedResult = v0_3.McpbManifestSchema.safeParse(upgradedManifest);

    expect(upgradedResult.success).toBe(true);
  });

  it("should validate manifest with all optional fields", () => {
    const fullManifest = {
      manifest_version: "0.3",
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
      icons: [
        {
          src: "assets/icons/icon-16-light.png",
          sizes: "16x16",
          theme: "light",
        },
        {
          src: "assets/icons/icon-16-dark.png",
          sizes: "16x16",
          theme: "dark",
        },
      ],
      screenshots: ["screenshot1.png", "screenshot2.png"],
      localization: {
        resources: "resources/${locale}.json",
        default_locale: "en-US",
      },
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
      expect(result.data.icons).toHaveLength(2);
      expect(result.data.localization?.default_locale).toBe("en-US");
    }
  });

  it("should validate server types correctly", () => {
    const serverTypes = ["python", "node", "binary"];

    serverTypes.forEach((type) => {
      const manifest = {
        manifest_version: "0.3",
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

  describe("_meta", () => {
    const base = {
      manifest_version: "0.3",
      name: "client-ext-test",
      version: "1.0.0",
      description: "Test manifest",
      author: { name: "Author" },
      server: {
        type: "node" as const,
        entry_point: "server/index.js",
        mcp_config: { command: "node", args: ["server/index.js"] },
      },
    };

    it("accepts valid _meta object with nested dictionaries", () => {
      const manifest = {
        ...base,
        _meta: {
          "com.microsoft.windows": {
            package_family_name: "Pkg_123",
            channel: "stable",
          },
          "com.apple.darwin": { bundle_id: "com.example.app", notarized: true },
        },
      };
      const result = v0_3.McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });

    it("rejects primitive value in _meta entry", () => {
      const manifest = {
        ...base,
        _meta: {
          "com.microsoft.windows": "raw-string" as unknown as Record<
            string,
            unknown
          >,
        },
      };
      const result = v0_3.McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join("\n");
        expect(messages).toMatch(/Expected object/);
      }
    });

    it("rejects array value in _meta entry", () => {
      const manifest = {
        ...base,
        _meta: {
          "com.apple.darwin": [] as unknown as Record<string, unknown>,
        },
      };
      const result = v0_3.McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it("rejects null value in _meta entry", () => {
      const manifest = {
        ...base,
        _meta: {
          custom: null as unknown as Record<string, unknown>,
        },
      };
      const result = v0_3.McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it("allows empty object for _meta", () => {
      const manifest = { ...base, _meta: {} };
      const result = v0_3.McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });
  });

  describe("localization", () => {
    const base = {
      manifest_version: "0.3" as const,
      name: "loc-ext",
      version: "1.0.0",
      description: "Test manifest",
      author: { name: "Author" },
      server: {
        type: "node" as const,
        entry_point: "server/index.js",
        mcp_config: { command: "node", args: ["server/index.js"] },
      },
    };

    it("requires a ${locale} placeholder", () => {
      const manifest = {
        ...base,
        localization: {
          resources: "resources/fr.json",
          default_locale: "en-US",
        },
      };
      const result = McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((issue) => issue.message);
        expect(messages.join(" ")).toContain("${locale}");
      }
    });

    it("rejects invalid default locale", () => {
      const manifest = {
        ...base,
        localization: {
          resources: "resources/${locale}.json",
          default_locale: "en_us",
        },
      };
      const result = McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it("accepts valid localization settings", () => {
      const manifest = {
        ...base,
        localization: {
          resources: "resources/${locale}.json",
          default_locale: "en-US",
        },
      };
      const result = McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });
  });

  describe("icons", () => {
    const base = {
      manifest_version: "0.3" as const,
      name: "icon-ext",
      version: "1.0.0",
      description: "Test manifest",
      author: { name: "Author" },
      server: {
        type: "python" as const,
        entry_point: "main.py",
        mcp_config: { command: "python", args: ["main.py"] },
      },
    };

    it("rejects icons with invalid size format", () => {
      const manifest = {
        ...base,
        icons: [{ src: "assets/icon.png", sizes: "16", theme: "light" }],
      };
      const result = McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it("allows icons without theme", () => {
      const manifest = {
        ...base,
        icons: [{ src: "assets/icon.png", sizes: "128x128" }],
      };
      const result = McpbManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });
  });
});
