import { existsSync, readFileSync } from "fs";

import {
  buildManifest,
  createMcpConfig,
  getDefaultAuthorEmail,
  getDefaultAuthorName,
  getDefaultAuthorUrl,
  getDefaultEntryPoint,
  getDefaultRepositoryUrl,
  readPackageJson,
} from "../src/cli/init.js";

// Mock the fs module
jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe("init functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("readPackageJson", () => {
    it("should return empty object when package.json doesn't exist", () => {
      (existsSync as jest.Mock).mockReturnValue(false);
      const result = readPackageJson("/test/path");
      expect(result).toEqual({});
    });

    it("should parse package.json when it exists", () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      const mockPackageData = { name: "test-package", version: "1.0.0" };
      (readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(mockPackageData),
      );

      const result = readPackageJson("/test/path");
      expect(result).toEqual(mockPackageData);
    });

    it("should return empty object when package.json is invalid", () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockReturnValue("invalid json");

      const result = readPackageJson("/test/path");
      expect(result).toEqual({});
    });
  });

  describe("getDefaultAuthorName", () => {
    it("should return string author when author is string", () => {
      const result = getDefaultAuthorName({ author: "John Doe" });
      expect(result).toBe("John Doe");
    });

    it("should return author.name when author is object", () => {
      const result = getDefaultAuthorName({ author: { name: "John Doe" } });
      expect(result).toBe("John Doe");
    });

    it("should return empty string when no author", () => {
      const result = getDefaultAuthorName({});
      expect(result).toBe("");
    });
  });

  describe("getDefaultAuthorEmail", () => {
    it("should return author.email when author is object with email", () => {
      const result = getDefaultAuthorEmail({
        author: { email: "john@example.com" },
      });
      expect(result).toBe("john@example.com");
    });

    it("should return empty string when author is string", () => {
      const result = getDefaultAuthorEmail({ author: "John Doe" });
      expect(result).toBe("");
    });

    it("should return empty string when no email", () => {
      const result = getDefaultAuthorEmail({ author: { name: "John" } });
      expect(result).toBe("");
    });
  });

  describe("getDefaultAuthorUrl", () => {
    it("should return author.url when author is object with url", () => {
      const result = getDefaultAuthorUrl({
        author: { url: "https://example.com" },
      });
      expect(result).toBe("https://example.com");
    });

    it("should return empty string when author is string", () => {
      const result = getDefaultAuthorUrl({ author: "John Doe" });
      expect(result).toBe("");
    });

    it("should return empty string when no url", () => {
      const result = getDefaultAuthorUrl({ author: { name: "John" } });
      expect(result).toBe("");
    });
  });

  describe("getDefaultRepositoryUrl", () => {
    it("should return string repository when repository is string", () => {
      const result = getDefaultRepositoryUrl({
        repository: "https://github.com/user/repo",
      });
      expect(result).toBe("https://github.com/user/repo");
    });

    it("should return repository.url when repository is object", () => {
      const result = getDefaultRepositoryUrl({
        repository: { type: "git", url: "https://github.com/user/repo" },
      });
      expect(result).toBe("https://github.com/user/repo");
    });

    it("should return empty string when no repository", () => {
      const result = getDefaultRepositoryUrl({});
      expect(result).toBe("");
    });
  });

  describe("createMcpConfig", () => {
    it("should create node config", () => {
      const result = createMcpConfig("node", "server/index.js");
      expect(result).toEqual({
        command: "node",
        args: ["${__dirname}/server/index.js"],
        env: {},
      });
    });

    it("should create python config", () => {
      const result = createMcpConfig("python", "server/main.py");
      expect(result).toEqual({
        command: "python",
        args: ["${__dirname}/server/main.py"],
        env: {
          PYTHONPATH: "server/lib",
        },
      });
    });

    it("should create binary config", () => {
      const result = createMcpConfig("binary", "server/my-server");
      expect(result).toEqual({
        command: "${__dirname}/server/my-server",
        args: [],
        env: {},
      });
    });
  });

  describe("getDefaultEntryPoint", () => {
    it("should return node default", () => {
      expect(getDefaultEntryPoint("node")).toBe("server/index.js");
    });

    it("should return python default", () => {
      expect(getDefaultEntryPoint("python")).toBe("server/main.py");
    });

    it("should return binary default", () => {
      expect(getDefaultEntryPoint("binary")).toBe("server/my-server");
    });
  });

  describe("buildManifest", () => {
    it("should build minimal manifest", () => {
      const manifest = buildManifest(
        {
          name: "test-extension",
          displayName: "test-extension",
          version: "1.0.0",
          description: "Test description",
          authorName: "John Doe",
        },
        undefined, // longDescription
        {
          authorEmail: "",
          authorUrl: "",
        },
        {
          homepage: "",
          documentation: "",
          support: "",
        },
        {
          icon: "",
          screenshots: [],
        },
        {
          serverType: "node",
          entryPoint: "server/index.js",
          mcp_config: {
            command: "node",
            args: ["${__dirname}/server/index.js"],
            env: {},
          },
        },
        [], // tools
        false, // toolsGenerated
        [], // prompts
        false, // promptsGenerated
        undefined, // compatibility
        {}, // userConfig
        {
          keywords: "",
          license: "",
        },
      );

      expect(manifest).toEqual({
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        description: "Test description",
        author: {
          name: "John Doe",
        },
        server: {
          type: "node",
          entry_point: "server/index.js",
          mcp_config: {
            command: "node",
            args: ["${__dirname}/server/index.js"],
            env: {},
          },
        },
      });
    });

    it("should include optional fields when provided", () => {
      const manifest = buildManifest(
        {
          name: "test-extension",
          displayName: "Test Extension",
          version: "1.0.0",
          description: "Test description",
          authorName: "John Doe",
        },
        "This is a detailed long description with more information.", // longDescription
        {
          authorEmail: "john@example.com",
          authorUrl: "https://example.com",
        },
        {
          homepage: "https://homepage.example.com",
          documentation: "https://docs.example.com",
          support: "https://support.example.com",
        },
        {
          icon: "icon.png",
          screenshots: ["screen1.png", "screen2.png"],
        },
        {
          serverType: "python",
          entryPoint: "server/main.py",
          mcp_config: {
            command: "python",
            args: ["server/main.py"],
            env: { PYTHONPATH: "server/lib" },
          },
        },
        [
          { name: "tool1", description: "Tool 1 description" },
          { name: "tool2" },
        ], // tools
        false, // toolsGenerated
        [
          {
            name: "analyze_code",
            description: "Code analysis prompt",
            text: "Analyze the following code...",
          },
        ], // prompts
        false, // promptsGenerated
        {
          claude_desktop: ">=0.4.0",
          platforms: ["darwin", "linux"],
          runtimes: { python: ">=3.8,<4.0" },
        }, // compatibility
        {
          api_key: {
            type: "string",
            title: "API Key",
            description: "Your API key",
            required: true,
            sensitive: true,
          },
        }, // userConfig
        {
          keywords: "test, extension, mcp",
          license: "MIT",
          repository: { type: "git", url: "https://github.com/user/repo" },
        },
      );

      expect(manifest).toEqual({
        dxt_version: "0.1",
        name: "test-extension",
        display_name: "Test Extension",
        version: "1.0.0",
        description: "Test description",
        long_description:
          "This is a detailed long description with more information.",
        author: {
          name: "John Doe",
          email: "john@example.com",
          url: "https://example.com",
        },
        homepage: "https://homepage.example.com",
        documentation: "https://docs.example.com",
        support: "https://support.example.com",
        icon: "icon.png",
        screenshots: ["screen1.png", "screen2.png"],
        server: {
          type: "python",
          entry_point: "server/main.py",
          mcp_config: {
            command: "python",
            args: ["server/main.py"],
            env: { PYTHONPATH: "server/lib" },
          },
        },
        tools: [
          { name: "tool1", description: "Tool 1 description" },
          { name: "tool2" },
        ],
        prompts: [
          {
            name: "analyze_code",
            description: "Code analysis prompt",
            text: "Analyze the following code...",
          },
        ],
        compatibility: {
          claude_desktop: ">=0.4.0",
          platforms: ["darwin", "linux"],
          runtimes: { python: ">=3.8,<4.0" },
        },
        user_config: {
          api_key: {
            type: "string",
            title: "API Key",
            description: "Your API key",
            required: true,
            sensitive: true,
          },
        },
        keywords: ["test", "extension", "mcp"],
        license: "MIT",
        repository: { type: "git", url: "https://github.com/user/repo" },
      });
    });
  });
});
