import {
  getMcpConfigForManifest,
  hasRequiredConfigMissing,
  replaceVariables,
} from "../src/shared/config";
import type { DxtManifest, Logger } from "../src/types";

describe("replaceVariables", () => {
  it("should replace variables in strings", () => {
    const result = replaceVariables("Hello ${name}!", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  it("should replace multiple variables in strings", () => {
    const result = replaceVariables("${greeting} ${name}!", {
      greeting: "Hello",
      name: "World",
    });
    expect(result).toBe("Hello World!");
  });

  it("should warn and not replace arrays in string context", () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    const result = replaceVariables("Hello ${names}!", {
      names: ["Alice", "Bob"],
    });
    expect(result).toBe("Hello ${names}!");
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it("should replace variables in objects", () => {
    const result = replaceVariables(
      { message: "Hello ${name}!" },
      { name: "World" },
    );
    expect(result).toEqual({ message: "Hello World!" });
  });

  it("should handle user config variables in arrays with string expansion", () => {
    const result = replaceVariables(["${user_config.path}"], {
      "user_config.path": "/some/path",
    });
    expect(result).toEqual(["/some/path"]);
  });

  it("should handle user config variables in arrays with array expansion", () => {
    const result = replaceVariables(["${user_config.paths}"], {
      "user_config.paths": ["/path1", "/path2"],
    });
    expect(result).toEqual(["/path1", "/path2"]);
  });

  it("should recursively process arrays", () => {
    const result = replaceVariables(["Hello ${name}!", "Goodbye ${name}!"], {
      name: "World",
    });
    expect(result).toEqual(["Hello World!", "Goodbye World!"]);
  });

  it("should handle mixed arrays with variable expansion", () => {
    const result = replaceVariables(["start", "${user_config.items}", "end"], {
      "user_config.items": ["item1", "item2"],
    });
    expect(result).toEqual(["start", "item1", "item2", "end"]);
  });

  it("should return primitive values unchanged", () => {
    expect(replaceVariables(42, {})).toBe(42);
    expect(replaceVariables(true, {})).toBe(true);
    expect(replaceVariables(null, {})).toBe(null);
  });

  it("should handle undefined variables by keeping them as-is", () => {
    const result = replaceVariables("Hello ${unknown}!", {});
    expect(result).toBe("Hello ${unknown}!");
  });
});

describe("getMcpConfigForManifest", () => {
  const mockLogger: Logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  const mockSystemDirs = {
    home: "/home/user",
    data: "/data",
  };

  const baseManifest: DxtManifest = {
    dxt_version: "1.0.0",
    name: "test-extension",
    version: "1.0.0",
    description: "Test extension",
    author: { name: "Test Author" },
    server: {
      type: "node",
      entry_point: "server.js",
      mcp_config: {
        command: "node",
        args: ["server.js", "${__dirname}"],
      },
    },
    compatibility: { claude_desktop: "0.1.0" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return undefined when manifest has no mcp_config", async () => {
    const manifest = {
      ...baseManifest,
      server: undefined,
    } as unknown as DxtManifest;

    const result = await getMcpConfigForManifest({
      manifest,
      extensionPath: "/ext/path",
      systemDirs: mockSystemDirs,
      userConfig: {},
      pathSeparator: "/",
      logger: mockLogger,
    });

    expect(result).toBeUndefined();
  });

  it("should return undefined when required config is missing", async () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        apiKey: {
          type: "string",
          title: "API Key",
          description: "API Key",
          required: true,
        },
      },
    };

    const result = await getMcpConfigForManifest({
      manifest,
      extensionPath: "/ext/path",
      systemDirs: mockSystemDirs,
      userConfig: {},
      pathSeparator: "/",
      logger: mockLogger,
    });

    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should replace variables in basic config", async () => {
    const result = await getMcpConfigForManifest({
      manifest: baseManifest,
      extensionPath: "/ext/path",
      systemDirs: mockSystemDirs,
      userConfig: {},
      pathSeparator: "/",
      logger: mockLogger,
    });

    expect(result).toEqual({
      command: "node",
      args: ["server.js", "/ext/path"],
    });
  });

  it("should apply platform overrides", async () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      server: {
        type: "node",
        entry_point: "server.js",
        mcp_config: {
          command: "default-command",
          args: ["default"],
          platform_overrides: {
            [process.platform]: {
              command: "platform-command",
              args: ["platform-specific"],
            },
          },
        },
      },
    };

    const result = await getMcpConfigForManifest({
      manifest,
      extensionPath: "/ext/path",
      systemDirs: mockSystemDirs,
      userConfig: {},
      pathSeparator: "/",
      logger: mockLogger,
    });

    expect(result?.command).toBe("platform-command");
    expect(result?.args).toEqual(["platform-specific"]);
  });

  it("should handle user config variable replacement with defaults", async () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        port: {
          type: "number",
          title: "Port Number",
          description: "Port number",
          default: 8080,
        },
      },
      server: {
        type: "node",
        entry_point: "server.js",
        mcp_config: {
          command: "node",
          args: ["server.js", "--port=${user_config.port}"],
        },
      },
    };

    const result = await getMcpConfigForManifest({
      manifest,
      extensionPath: "/ext/path",
      systemDirs: mockSystemDirs,
      userConfig: {},
      pathSeparator: "/",
      logger: mockLogger,
    });

    expect(result?.args).toEqual(["server.js", "--port=8080"]);
  });

  it("should handle user config variable replacement with user values", async () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        paths: {
          type: "string",
          title: "File Paths",
          description: "File paths",
          default: ["/default"],
          multiple: true,
        },
      },
      server: {
        type: "node",
        entry_point: "server.js",
        mcp_config: {
          command: "node",
          args: ["server.js", "${user_config.paths}"],
        },
      },
    };

    const result = await getMcpConfigForManifest({
      manifest,
      extensionPath: "/ext/path",
      systemDirs: mockSystemDirs,
      userConfig: { paths: ["/user/path1", "/user/path2"] },
      pathSeparator: "/",
      logger: mockLogger,
    });

    expect(result?.args).toEqual(["server.js", "/user/path1", "/user/path2"]);
  });

  it("should convert boolean user config values to strings", async () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        verbose: {
          type: "boolean",
          title: "Verbose Mode",
          description: "Verbose output",
          default: false,
        },
      },
      server: {
        type: "node",
        entry_point: "server.js",
        mcp_config: {
          command: "node",
          args: ["server.js", "--verbose=${user_config.verbose}"],
        },
      },
    };

    const result = await getMcpConfigForManifest({
      manifest,
      extensionPath: "/ext/path",
      systemDirs: mockSystemDirs,
      userConfig: { verbose: true },
      pathSeparator: "/",
      logger: mockLogger,
    });

    expect(result?.args).toEqual(["server.js", "--verbose=true"]);
  });
});

describe("hasRequiredConfigMissing", () => {
  const baseManifest: DxtManifest = {
    dxt_version: "1.0.0",
    name: "test-extension",
    version: "1.0.0",
    description: "Test extension",
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

  it("should return false when manifest has no user_config", () => {
    const result = hasRequiredConfigMissing({
      manifest: baseManifest,
      userConfig: {},
    });
    expect(result).toBe(false);
  });

  it("should return false when no config fields are required", () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        port: {
          type: "number",
          title: "Port",
          description: "Port number",
          required: false,
        },
      },
    };

    const result = hasRequiredConfigMissing({
      manifest,
      userConfig: {},
    });
    expect(result).toBe(false);
  });

  it("should return false when required config is provided", () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        apiKey: {
          type: "string",
          title: "API Key",
          description: "API Key",
          required: true,
        },
      },
    };

    const result = hasRequiredConfigMissing({
      manifest,
      userConfig: { apiKey: "test-key" },
    });
    expect(result).toBe(false);
  });

  it("should return true when required config is undefined", () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        apiKey: {
          type: "string",
          title: "API Key",
          description: "API Key",
          required: true,
        },
      },
    };

    const result = hasRequiredConfigMissing({
      manifest,
      userConfig: {},
    });
    expect(result).toBe(true);
  });

  it("should return true when required config is empty string", () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        apiKey: {
          type: "string",
          title: "API Key",
          description: "API Key",
          required: true,
        },
      },
    };

    const result = hasRequiredConfigMissing({
      manifest,
      userConfig: { apiKey: "" },
    });
    expect(result).toBe(true);
  });

  it("should return true when required config is empty array", () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        paths: {
          type: "string",
          title: "Paths",
          description: "File paths",
          required: true,
          multiple: true,
        },
      },
    };

    const result = hasRequiredConfigMissing({
      manifest,
      userConfig: { paths: [] },
    });
    expect(result).toBe(true);
  });

  it("should return false when no user config is provided but nothing is required", () => {
    const result = hasRequiredConfigMissing({
      manifest: baseManifest,
      // userConfig not provided
    });
    expect(result).toBe(false);
  });

  it("should handle multiple required config fields", () => {
    const manifest: DxtManifest = {
      ...baseManifest,
      user_config: {
        apiKey: {
          type: "string",
          title: "API Key",
          description: "API Key",
          required: true,
        },
        database: {
          type: "string",
          title: "Database",
          description: "Database connection",
          required: true,
        },
        port: {
          type: "number",
          title: "Port",
          description: "Port number",
          required: false,
        },
      },
    };

    const resultMissingBoth = hasRequiredConfigMissing({
      manifest,
      userConfig: {},
    });
    expect(resultMissingBoth).toBe(true);

    const resultMissingOne = hasRequiredConfigMissing({
      manifest,
      userConfig: { apiKey: "test-key" },
    });
    expect(resultMissingOne).toBe(true);

    const resultHasBoth = hasRequiredConfigMissing({
      manifest,
      userConfig: { apiKey: "test-key", database: "test-db" },
    });
    expect(resultHasBoth).toBe(false);
  });
});
