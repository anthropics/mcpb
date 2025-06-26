import { confirm, input, select } from "@inquirer/prompts";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";

import type { DxtManifest } from "../types.js";

interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  author?: string | { name?: string; email?: string; url?: string };
  repository?: string | { type?: string; url?: string };
  license?: string;
}

export function readPackageJson(dirPath: string): PackageJson {
  const packageJsonPath = join(dirPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    } catch (e) {
      // Ignore package.json parsing errors
    }
  }
  return {};
}

export function getDefaultAuthorName(packageData: PackageJson): string {
  if (typeof packageData.author === "string") {
    return packageData.author;
  }
  return packageData.author?.name || "";
}

export function getDefaultAuthorEmail(packageData: PackageJson): string {
  if (typeof packageData.author === "object") {
    return packageData.author?.email || "";
  }
  return "";
}

export function getDefaultAuthorUrl(packageData: PackageJson): string {
  if (typeof packageData.author === "object") {
    return packageData.author?.url || "";
  }
  return "";
}

export function getDefaultRepositoryUrl(packageData: PackageJson): string {
  if (typeof packageData.repository === "string") {
    return packageData.repository;
  }
  return packageData.repository?.url || "";
}

export function getDefaultBasicInfo(
  packageData: PackageJson,
  resolvedPath: string,
) {
  const name = packageData.name || basename(resolvedPath);
  const authorName = getDefaultAuthorName(packageData) || "Unknown Author";
  const displayName = name;
  const version = packageData.version || "1.0.0";
  const description = packageData.description || "A DXT extension";

  return { name, authorName, displayName, version, description };
}

export function getDefaultAuthorInfo(packageData: PackageJson) {
  return {
    authorEmail: getDefaultAuthorEmail(packageData),
    authorUrl: getDefaultAuthorUrl(packageData),
  };
}

export function getDefaultServerConfig(packageData?: PackageJson) {
  const serverType = "node" as const;
  const entryPoint = getDefaultEntryPoint(serverType, packageData);
  const mcp_config = createMcpConfig(serverType, entryPoint);

  return { serverType, entryPoint, mcp_config };
}

export function getDefaultOptionalFields(packageData: PackageJson) {
  return {
    keywords: "",
    license: packageData.license || "MIT",
    repository: undefined,
  };
}

export function createMcpConfig(
  serverType: "node" | "python" | "binary",
  entryPoint: string,
): {
  command: string;
  args: string[];
  env?: Record<string, string>;
} {
  switch (serverType) {
    case "node":
      return {
        command: "node",
        args: ["${__dirname}/" + entryPoint],
        env: {},
      };
    case "python":
      return {
        command: "python",
        args: ["${__dirname}/" + entryPoint],
        env: {
          PYTHONPATH: "server/lib",
        },
      };
    case "binary":
      return {
        command: "${__dirname}/" + entryPoint,
        args: [],
        env: {},
      };
  }
}

export function getDefaultEntryPoint(
  serverType: "node" | "python" | "binary",
  packageData?: PackageJson,
): string {
  switch (serverType) {
    case "node":
      return packageData?.main || "server/index.js";
    case "python":
      return "server/main.py";
    case "binary":
      return "server/my-server";
  }
}

export async function promptBasicInfo(
  packageData: PackageJson,
  resolvedPath: string,
) {
  const defaultName = packageData.name || basename(resolvedPath);

  const name = await input({
    message: "Extension name:",
    default: defaultName,
    validate: (value) => value.trim().length > 0 || "Name is required",
  });

  const authorName = await input({
    message: "Author name:",
    default: getDefaultAuthorName(packageData),
    validate: (value) => value.trim().length > 0 || "Author name is required",
  });

  const displayName = await input({
    message: "Display name (optional):",
    default: name,
  });

  const version = await input({
    message: "Version:",
    default: packageData.version || "1.0.0",
    validate: (value) => {
      if (!value.trim()) return "Version is required";
      if (!/^\d+\.\d+\.\d+/.test(value)) {
        return "Version must follow semantic versioning (e.g., 1.0.0)";
      }
      return true;
    },
  });

  const description = await input({
    message: "Description:",
    default: packageData.description || "",
    validate: (value) => value.trim().length > 0 || "Description is required",
  });

  return { name, authorName, displayName, version, description };
}

export async function promptAuthorInfo(packageData: PackageJson) {
  const authorEmail = await input({
    message: "Author email (optional):",
    default: getDefaultAuthorEmail(packageData),
  });

  const authorUrl = await input({
    message: "Author URL (optional):",
    default: getDefaultAuthorUrl(packageData),
  });

  return { authorEmail, authorUrl };
}

export async function promptServerConfig(packageData?: PackageJson) {
  const serverType = (await select({
    message: "Server type:",
    choices: [
      { name: "Node.js", value: "node" },
      { name: "Python", value: "python" },
      { name: "Binary", value: "binary" },
    ],
    default: "node",
  })) as "node" | "python" | "binary";

  const entryPoint = await input({
    message: "Entry point:",
    default: getDefaultEntryPoint(serverType, packageData),
  });

  const mcp_config = createMcpConfig(serverType, entryPoint);

  return { serverType, entryPoint, mcp_config };
}

export async function promptTools() {
  const addTools = await confirm({
    message:
      "Does your MCP Server provide tools you want to advertise (optional)?",
    default: true,
  });

  const tools: Array<{ name: string; description?: string }> = [];
  let toolsGenerated = false;

  if (addTools) {
    let addMore = true;
    while (addMore) {
      const toolName = await input({
        message: "Tool name:",
        validate: (value) => value.trim().length > 0 || "Tool name is required",
      });
      const toolDescription = await input({
        message: "Tool description (optional):",
      });

      tools.push({
        name: toolName,
        ...(toolDescription ? { description: toolDescription } : {}),
      });

      addMore = await confirm({
        message: "Add another tool?",
        default: false,
      });
    }

    // Ask about generated tools
    toolsGenerated = await confirm({
      message: "Does your server generate additional tools at runtime?",
      default: false,
    });
  }

  return { tools, toolsGenerated };
}

export async function promptPrompts() {
  const addPrompts = await confirm({
    message:
      "Does your MCP Server provide prompts you want to advertise (optional)?",
    default: false,
  });

  const prompts: Array<{
    name: string;
    description?: string;
    arguments?: string[];
    text: string;
  }> = [];
  let promptsGenerated = false;

  if (addPrompts) {
    let addMore = true;
    while (addMore) {
      const promptName = await input({
        message: "Prompt name:",
        validate: (value) =>
          value.trim().length > 0 || "Prompt name is required",
      });
      const promptDescription = await input({
        message: "Prompt description (optional):",
      });

      // Ask about arguments
      const hasArguments = await confirm({
        message: "Does this prompt have arguments?",
        default: false,
      });

      const argumentNames: string[] = [];
      if (hasArguments) {
        let addMoreArgs = true;
        while (addMoreArgs) {
          const argName = await input({
            message: "Argument name:",
            validate: (value) => {
              if (!value.trim()) return "Argument name is required";
              if (argumentNames.includes(value)) {
                return "Argument names must be unique";
              }
              return true;
            },
          });
          argumentNames.push(argName);

          addMoreArgs = await confirm({
            message: "Add another argument?",
            default: false,
          });
        }
      }

      // Prompt for the text template
      const promptText = await input({
        message: hasArguments
          ? `Prompt text (use \${arguments.name} for arguments: ${argumentNames.join(", ")}):`
          : "Prompt text:",
        validate: (value) =>
          value.trim().length > 0 || "Prompt text is required",
      });

      prompts.push({
        name: promptName,
        ...(promptDescription ? { description: promptDescription } : {}),
        ...(argumentNames.length > 0 ? { arguments: argumentNames } : {}),
        text: promptText,
      });

      addMore = await confirm({
        message: "Add another prompt?",
        default: false,
      });
    }

    // Ask about generated prompts
    promptsGenerated = await confirm({
      message: "Does your server generate additional prompts at runtime?",
      default: false,
    });
  }

  return { prompts, promptsGenerated };
}

export async function promptOptionalFields(packageData: PackageJson) {
  const keywords = await input({
    message: "Keywords (comma-separated, optional):",
    default: "",
  });

  const license = await input({
    message: "License:",
    default: packageData.license || "MIT",
  });

  const addRepository = await confirm({
    message: "Add repository information?",
    default: !!packageData.repository,
  });

  let repository: { type: string; url: string } | undefined;
  if (addRepository) {
    const repoUrl = await input({
      message: "Repository URL:",
      default: getDefaultRepositoryUrl(packageData),
    });
    if (repoUrl) {
      repository = {
        type: "git",
        url: repoUrl,
      };
    }
  }

  return { keywords, license, repository };
}

export async function promptLongDescription(description: string) {
  const hasLongDescription = await confirm({
    message: "Add a detailed long description?",
    default: false,
  });

  if (hasLongDescription) {
    const longDescription = await input({
      message: "Long description (supports basic markdown):",
      default: description,
    });
    return longDescription;
  }

  return undefined;
}

export async function promptUrls() {
  const homepage = await input({
    message: "Homepage URL (optional):",
    validate: (value) => {
      if (!value.trim()) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return "Must be a valid URL (e.g., https://example.com)";
      }
    },
  });

  const documentation = await input({
    message: "Documentation URL (optional):",
    validate: (value) => {
      if (!value.trim()) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return "Must be a valid URL";
      }
    },
  });

  const support = await input({
    message: "Support URL (optional):",
    validate: (value) => {
      if (!value.trim()) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return "Must be a valid URL";
      }
    },
  });

  return { homepage, documentation, support };
}

export async function promptVisualAssets() {
  const icon = await input({
    message: "Icon file path (optional, relative to manifest):",
    validate: (value) => {
      if (!value.trim()) return true;
      if (value.includes("..")) return "Relative paths cannot include '..'";
      return true;
    },
  });

  const addScreenshots = await confirm({
    message: "Add screenshots?",
    default: false,
  });

  const screenshots: string[] = [];
  if (addScreenshots) {
    let addMore = true;
    while (addMore) {
      const screenshot = await input({
        message: "Screenshot file path (relative to manifest):",
        validate: (value) => {
          if (!value.trim()) return "Screenshot path is required";
          if (value.includes("..")) return "Relative paths cannot include '..'";
          return true;
        },
      });
      screenshots.push(screenshot);

      addMore = await confirm({
        message: "Add another screenshot?",
        default: false,
      });
    }
  }

  return { icon, screenshots };
}

export async function promptCompatibility(
  serverType: "node" | "python" | "binary",
) {
  const addCompatibility = await confirm({
    message: "Add compatibility constraints?",
    default: false,
  });

  if (!addCompatibility) {
    return undefined;
  }

  const addPlatforms = await confirm({
    message: "Specify supported platforms?",
    default: false,
  });

  let platforms: ("darwin" | "win32" | "linux")[] | undefined;
  if (addPlatforms) {
    const selectedPlatforms: ("darwin" | "win32" | "linux")[] = [];

    const supportsDarwin = await confirm({
      message: "Support macOS (darwin)?",
      default: true,
    });
    if (supportsDarwin) selectedPlatforms.push("darwin");

    const supportsWin32 = await confirm({
      message: "Support Windows (win32)?",
      default: true,
    });
    if (supportsWin32) selectedPlatforms.push("win32");

    const supportsLinux = await confirm({
      message: "Support Linux?",
      default: true,
    });
    if (supportsLinux) selectedPlatforms.push("linux");

    platforms = selectedPlatforms.length > 0 ? selectedPlatforms : undefined;
  }

  let runtimes: { python?: string; node?: string } | undefined;
  if (serverType !== "binary") {
    const addRuntimes = await confirm({
      message: "Specify runtime version constraints?",
      default: false,
    });

    if (addRuntimes) {
      if (serverType === "python") {
        const pythonVersion = await input({
          message: "Python version constraint (e.g., >=3.8,<4.0):",
          validate: (value) =>
            value.trim().length > 0 || "Python version constraint is required",
        });
        runtimes = { python: pythonVersion };
      } else if (serverType === "node") {
        const nodeVersion = await input({
          message: "Node.js version constraint (e.g., >=16.0.0):",
          validate: (value) =>
            value.trim().length > 0 || "Node.js version constraint is required",
        });
        runtimes = { node: nodeVersion };
      }
    }
  }

  return {
    ...(platforms ? { platforms } : {}),
    ...(runtimes ? { runtimes } : {}),
  };
}

export async function promptUserConfig() {
  const addUserConfig = await confirm({
    message: "Add user-configurable options?",
    default: false,
  });

  if (!addUserConfig) {
    return {};
  }

  const userConfig: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "directory" | "file";
      title: string;
      description: string;
      required?: boolean;
      default?: string | number | boolean | string[];
      multiple?: boolean;
      sensitive?: boolean;
      min?: number;
      max?: number;
    }
  > = {};

  let addMore = true;
  while (addMore) {
    const optionKey = await input({
      message: "Configuration option key (unique identifier):",
      validate: (value) => {
        if (!value.trim()) return "Key is required";
        if (userConfig[value]) return "Key must be unique";
        return true;
      },
    });

    const optionType = (await select({
      message: "Option type:",
      choices: [
        { name: "String", value: "string" },
        { name: "Number", value: "number" },
        { name: "Boolean", value: "boolean" },
        { name: "Directory", value: "directory" },
        { name: "File", value: "file" },
      ],
    })) as "string" | "number" | "boolean" | "directory" | "file";

    const optionTitle = await input({
      message: "Option title (human-readable name):",
      validate: (value) => value.trim().length > 0 || "Title is required",
    });

    const optionDescription = await input({
      message: "Option description:",
      validate: (value) => value.trim().length > 0 || "Description is required",
    });

    const optionRequired = await confirm({
      message: "Is this option required?",
      default: false,
    });

    const optionSensitive = await confirm({
      message: "Is this option sensitive (like a password)?",
      default: false,
    });

    // Build the option object
    const option: {
      type: "string" | "number" | "boolean" | "directory" | "file";
      title: string;
      description: string;
      required: boolean;
      sensitive: boolean;
      default?: string | number | boolean | string[];
      min?: number;
      max?: number;
    } = {
      type: optionType,
      title: optionTitle,
      description: optionDescription,
      required: optionRequired,
      sensitive: optionSensitive,
    };

    // Add default value if not required
    if (!optionRequired) {
      let defaultValue: string | number | boolean | string[] | undefined;
      if (optionType === "boolean") {
        defaultValue = await confirm({
          message: "Default value:",
          default: false,
        });
      } else if (optionType === "number") {
        const defaultStr = await input({
          message: "Default value (number):",
          validate: (value) => {
            if (!value.trim()) return true;
            return !isNaN(Number(value)) || "Must be a valid number";
          },
        });
        defaultValue = defaultStr ? Number(defaultStr) : undefined;
      } else {
        defaultValue = await input({
          message: "Default value (optional):",
        });
      }
      if (defaultValue !== undefined && defaultValue !== "") {
        option.default = defaultValue;
      }
    }

    // Add constraints for number types
    if (optionType === "number") {
      const addConstraints = await confirm({
        message: "Add min/max constraints?",
        default: false,
      });
      if (addConstraints) {
        const min = await input({
          message: "Minimum value (optional):",
          validate: (value) => {
            if (!value.trim()) return true;
            return !isNaN(Number(value)) || "Must be a valid number";
          },
        });
        const max = await input({
          message: "Maximum value (optional):",
          validate: (value) => {
            if (!value.trim()) return true;
            return !isNaN(Number(value)) || "Must be a valid number";
          },
        });
        if (min) option.min = Number(min);
        if (max) option.max = Number(max);
      }
    }

    userConfig[optionKey] = option;

    addMore = await confirm({
      message: "Add another configuration option?",
      default: false,
    });
  }

  return userConfig;
}

export function buildManifest(
  basicInfo: {
    name: string;
    displayName: string;
    version: string;
    description: string;
    authorName: string;
  },
  longDescription: string | undefined,
  authorInfo: {
    authorEmail: string;
    authorUrl: string;
  },
  urls: {
    homepage: string;
    documentation: string;
    support: string;
  },
  visualAssets: {
    icon: string;
    screenshots: string[];
  },
  serverConfig: {
    serverType: "node" | "python" | "binary";
    entryPoint: string;
    mcp_config: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  },
  tools: Array<{ name: string; description?: string }>,
  toolsGenerated: boolean,
  prompts: Array<{
    name: string;
    description?: string;
    arguments?: string[];
    text: string;
  }>,
  promptsGenerated: boolean,
  compatibility:
    | {
        claude_desktop?: string;
        platforms?: ("darwin" | "win32" | "linux")[];
        runtimes?: { python?: string; node?: string };
      }
    | undefined,
  userConfig: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "directory" | "file";
      title: string;
      description: string;
      required?: boolean;
      default?: string | number | boolean | string[];
      multiple?: boolean;
      sensitive?: boolean;
      min?: number;
      max?: number;
    }
  >,
  optionalFields: {
    keywords: string;
    license: string;
    repository?: { type: string; url: string };
  },
): DxtManifest {
  const { name, displayName, version, description, authorName } = basicInfo;
  const { authorEmail, authorUrl } = authorInfo;
  const { serverType, entryPoint, mcp_config } = serverConfig;
  const { keywords, license, repository } = optionalFields;

  return {
    dxt_version: "0.1",
    name,
    ...(displayName && displayName !== name
      ? { display_name: displayName }
      : {}),
    version,
    description,
    ...(longDescription ? { long_description: longDescription } : {}),
    author: {
      name: authorName,
      ...(authorEmail ? { email: authorEmail } : {}),
      ...(authorUrl ? { url: authorUrl } : {}),
    },
    ...(urls.homepage ? { homepage: urls.homepage } : {}),
    ...(urls.documentation ? { documentation: urls.documentation } : {}),
    ...(urls.support ? { support: urls.support } : {}),
    ...(visualAssets.icon ? { icon: visualAssets.icon } : {}),
    ...(visualAssets.screenshots.length > 0
      ? { screenshots: visualAssets.screenshots }
      : {}),
    server: {
      type: serverType,
      entry_point: entryPoint,
      mcp_config,
    },
    ...(tools.length > 0 ? { tools } : {}),
    ...(toolsGenerated ? { tools_generated: true } : {}),
    ...(prompts.length > 0 ? { prompts } : {}),
    ...(promptsGenerated ? { prompts_generated: true } : {}),
    ...(compatibility ? { compatibility } : {}),
    ...(Object.keys(userConfig).length > 0 ? { user_config: userConfig } : {}),
    ...(keywords
      ? {
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k),
        }
      : {}),
    ...(license ? { license } : {}),
    ...(repository ? { repository } : {}),
  };
}

export function printNextSteps() {
  console.log("\nNext steps:");
  console.log(
    `1. Ensure all your production dependencies are in this directory`,
  );
  console.log(`2. Run 'dxt pack' to create your .dxt file`);
}

export async function initExtension(
  targetPath: string = process.cwd(),
  nonInteractive = false,
): Promise<boolean> {
  const resolvedPath = resolve(targetPath);
  const manifestPath = join(resolvedPath, "manifest.json");

  if (existsSync(manifestPath)) {
    if (nonInteractive) {
      console.log(
        "manifest.json already exists. Use --force to overwrite in non-interactive mode.",
      );
      return false;
    }
    const overwrite = await confirm({
      message: "manifest.json already exists. Overwrite?",
      default: false,
    });
    if (!overwrite) {
      console.log("Cancelled");
      return false;
    }
  }

  if (!nonInteractive) {
    console.log(
      "This utility will help you create a manifest.json file for your DXT extension.",
    );
    console.log("Press ^C at any time to quit.\n");
  } else {
    console.log("Creating manifest.json with default values...");
  }

  try {
    const packageData = readPackageJson(resolvedPath);

    // Prompt for all information or use defaults
    const basicInfo = nonInteractive
      ? getDefaultBasicInfo(packageData, resolvedPath)
      : await promptBasicInfo(packageData, resolvedPath);
    const longDescription = nonInteractive
      ? undefined
      : await promptLongDescription(basicInfo.description);
    const authorInfo = nonInteractive
      ? getDefaultAuthorInfo(packageData)
      : await promptAuthorInfo(packageData);
    const urls = nonInteractive
      ? { homepage: "", documentation: "", support: "" }
      : await promptUrls();
    const visualAssets = nonInteractive
      ? { icon: "", screenshots: [] }
      : await promptVisualAssets();
    const serverConfig = nonInteractive
      ? getDefaultServerConfig(packageData)
      : await promptServerConfig(packageData);
    const toolsData = nonInteractive
      ? { tools: [], toolsGenerated: false }
      : await promptTools();
    const promptsData = nonInteractive
      ? { prompts: [], promptsGenerated: false }
      : await promptPrompts();
    const compatibility = nonInteractive
      ? undefined
      : await promptCompatibility(serverConfig.serverType);
    const userConfig = nonInteractive ? {} : await promptUserConfig();
    const optionalFields = nonInteractive
      ? getDefaultOptionalFields(packageData)
      : await promptOptionalFields(packageData);

    // Build manifest
    const manifest = buildManifest(
      basicInfo,
      longDescription,
      authorInfo,
      urls,
      visualAssets,
      serverConfig,
      toolsData.tools,
      toolsData.toolsGenerated,
      promptsData.prompts,
      promptsData.promptsGenerated,
      compatibility,
      userConfig,
      optionalFields,
    );

    // Write manifest
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`\nCreated manifest.json at ${manifestPath}`);

    printNextSteps();

    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("User force closed")) {
      console.log("\nCancelled");
      return false;
    }
    throw error;
  }
}
