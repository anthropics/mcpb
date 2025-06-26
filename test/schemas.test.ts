import { readFileSync } from "fs";
import { join } from "path";

import { DxtManifestSchema } from "../src/schemas";

describe("DxtManifestSchema", () => {
  it("should validate a valid manifest", () => {
    const manifestPath = join(__dirname, "valid-manifest.json");
    const manifestContent = readFileSync(manifestPath, "utf-8");
    const manifestData = JSON.parse(manifestContent);

    const result = DxtManifestSchema.safeParse(manifestData);

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

    const result = DxtManifestSchema.safeParse(manifestData);

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
      dxt_version: "1.0",
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
        runtime_requirements: {
          python: ">=3.8",
        },
      },
      tools: [
        {
          name: "my_tool",
          description: "A useful tool",
          input_schema: { type: "object" },
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
      settings: {
        configurable: true,
        schema: {
          type: "object",
          properties: {},
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

    const result = DxtManifestSchema.safeParse(fullManifest);

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
        dxt_version: "1.0",
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

      const result = DxtManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });
  });
});
