import { existsSync, readFileSync, statSync } from "fs";
import * as fs from "fs/promises";
import { DestroyerOfModules } from "galactus";
import * as os from "os";
import { dirname, extname, isAbsolute, join, resolve } from "path";
import prettyBytes from "pretty-bytes";

import { unpackExtension } from "../cli/unpack.js";
import {
  MANIFEST_SCHEMAS,
  MANIFEST_SCHEMAS_LOOSE,
} from "../shared/constants.js";
import { getManifestVersionFromRawData } from "../shared/manifestVersionResolve.js";
import { getAllFilesWithCount, readMcpbIgnorePatterns } from "./files.js";

/**
 * Check if a buffer contains a valid PNG file signature
 */
function isPNG(buffer: Buffer): boolean {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

/**
 * Validate icon field in manifest
 * @param iconPath - The icon path from manifest.json
 * @param baseDir - The base directory containing the manifest
 * @returns Validation result with errors and warnings
 */
function validateIcon(
  iconPath: string,
  baseDir: string,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const isRemoteUrl =
    iconPath.startsWith("http://") || iconPath.startsWith("https://");
  const hasVariableSubstitution = iconPath.includes("${__dirname}");
  const isAbsolutePath = isAbsolute(iconPath);

  // Warn about remote URLs (best practice: use local files)
  if (isRemoteUrl) {
    warnings.push(
      "Icon path uses a remote URL. " +
        'Best practice for local MCP servers: Use local files like "icon": "icon.png" for maximum compatibility. ' +
        "Claude Desktop currently only supports local icon files in bundles.",
    );
  }

  // Check for ${__dirname} variable (error - doesn't work)
  if (hasVariableSubstitution) {
    errors.push(
      "Icon path should not use ${__dirname} variable substitution. " +
        'Use a simple relative path like "icon.png" instead of "${__dirname}/icon.png".',
    );
  }

  // Check for absolute path (error - not portable)
  if (isAbsolutePath) {
    errors.push(
      "Icon path must be relative to the bundle root, not an absolute path. " +
        `Found: "${iconPath}"`,
    );
  }

  // Only proceed with file checks if the path looks like a local file
  if (!isRemoteUrl && !isAbsolutePath && !hasVariableSubstitution) {
    // Check file existence
    const fullIconPath = join(baseDir, iconPath);
    if (!existsSync(fullIconPath)) {
      errors.push(`Icon file not found at path: ${iconPath}`);
    } else {
      try {
        // Check PNG format
        const buffer = readFileSync(fullIconPath);
        if (!isPNG(buffer)) {
          errors.push(
            `Icon file must be PNG format. The file at "${iconPath}" does not appear to be a valid PNG file.`,
          );
        } else {
          // File exists and is a valid PNG - add recommendation
          warnings.push(
            "Icon validation passed. Recommended size is 512×512 pixels for best display in Claude Desktop.",
          );
        }
      } catch (error) {
        errors.push(
          `Unable to read icon file at "${iconPath}": ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Expected file extensions by server type
const NODE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const PYTHON_EXTENSIONS = new Set([".py"]);
const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".py"]);

/**
 * Validate that the server entry_point file exists and matches the server type
 */
function validateEntryPoint(
  manifest: { server: { type: string; entry_point: string } },
  baseDir: string,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { type, entry_point } = manifest.server;
  const entryPath = join(baseDir, entry_point);

  if (!existsSync(entryPath)) {
    errors.push(`Entry point file not found: ${entry_point}`);
    return { valid: false, errors, warnings };
  }

  const ext = extname(entry_point).toLowerCase();

  if (type === "node" && !NODE_EXTENSIONS.has(ext)) {
    warnings.push(
      `Unusual entry point extension "${ext}" for server type "node". Expected: .js, .mjs, or .cjs`,
    );
  } else if (
    (type === "python" || type === "uv") &&
    !PYTHON_EXTENSIONS.has(ext)
  ) {
    warnings.push(
      `Unusual entry point extension "${ext}" for server type "${type}". Expected: .py`,
    );
  } else if (type === "binary" && SCRIPT_EXTENSIONS.has(ext)) {
    warnings.push(
      `Entry point has script extension "${ext}" but server type is "binary". Did you mean type "node" or "python"?`,
    );
  }

  // For binary type on Unix, check executable bit
  if (type === "binary" && process.platform !== "win32") {
    const stat = statSync(entryPath);
    if (!(stat.mode & 0o111)) {
      errors.push(
        `Binary entry point is not executable: ${entry_point}. Run: chmod +x ${entry_point}`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Valid variable patterns from src/shared/config.ts replaceVariables()
const VALID_VARIABLE_PATTERN =
  /^\$\{(__dirname|pathSeparator|\/|user_config\..+)\}$/;

/**
 * Validate that ${...} variables in mcp_config are recognized
 */
function validateCommandVariables(manifest: {
  server: {
    mcp_config: {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      platform_overrides?: Record<
        string,
        {
          command?: string;
          args?: string[];
          env?: Record<string, string>;
        }
      >;
    };
  };
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  function checkString(value: string, context: string): void {
    const variablePattern = /\$\{([^}]+)\}/g;
    let match;
    while ((match = variablePattern.exec(value)) !== null) {
      const fullVar = match[0];
      if (!VALID_VARIABLE_PATTERN.test(fullVar)) {
        errors.push(
          `Invalid variable "${fullVar}" in ${context}. Valid variables: \${__dirname}, \${pathSeparator}, \${/}, \${user_config.<key>}`,
        );
      }
    }
  }

  function checkConfig(
    config: { command?: string; args?: string[]; env?: Record<string, string> },
    prefix: string,
  ): void {
    if (config.command) checkString(config.command, `${prefix}command`);
    if (config.args) {
      config.args.forEach((arg, i) => checkString(arg, `${prefix}args[${i}]`));
    }
    if (config.env) {
      for (const [key, val] of Object.entries(config.env)) {
        checkString(val, `${prefix}env.${key}`);
      }
    }
  }

  const { mcp_config } = manifest.server;
  checkConfig(mcp_config, "mcp_config.");

  if (mcp_config.platform_overrides) {
    for (const [platform, override] of Object.entries(
      mcp_config.platform_overrides,
    )) {
      checkConfig(override, `mcp_config.platform_overrides.${platform}.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Sensitive file patterns not already covered by EXCLUDE_PATTERNS in files.ts
const SENSITIVE_PATTERNS = [
  /(^|\/)credentials\.json$/i,
  /(^|\/)secrets\./i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /(^|\/)\.aws\//,
  /(^|\/)\.ssh\//,
  /(^|\/)id_rsa/,
  /(^|\/)id_ed25519/,
  /(^|\/)id_ecdsa/,
  /\.keystore$/i,
  /(^|\/)token\.json$/i,
];

/**
 * Check if the file list that would be bundled contains sensitive files
 */
function validateSensitiveFiles(baseDir: string): ValidationResult {
  const warnings: string[] = [];

  try {
    const mcpbIgnorePatterns = readMcpbIgnorePatterns(baseDir);
    const { files } = getAllFilesWithCount(
      baseDir,
      baseDir,
      {},
      mcpbIgnorePatterns,
    );

    for (const filePath of Object.keys(files)) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(filePath)) {
          warnings.push(
            `Potentially sensitive file will be included in bundle: ${filePath}`,
          );
          break;
        }
      }
    }
  } catch {
    // If we can't read the directory, skip this check silently —
    // pack will fail with a clearer error later
  }

  // Sensitive files are always warnings, never errors — a .pem might be a legitimate TLS cert
  return { valid: true, errors: [], warnings };
}

export function validateManifest(
  inputPath: string,
  options?: { projectDir?: string },
): boolean {
  try {
    const resolvedPath = resolve(inputPath);
    let manifestPath = resolvedPath;

    // If input is a directory, look for manifest.json inside it
    if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
      manifestPath = join(resolvedPath, "manifest.json");
    }

    const manifestContent = readFileSync(manifestPath, "utf-8");
    const manifestData = JSON.parse(manifestContent);
    const manifestVersion = getManifestVersionFromRawData(manifestData);
    if (!manifestVersion) {
      console.log("Unrecognized or unsupported manifest version");
      return false;
    }

    const result = MANIFEST_SCHEMAS[manifestVersion].safeParse(manifestData);

    if (result.success) {
      console.log("Manifest schema validation passes!");

      const manifestDir = dirname(manifestPath);
      // projectDir is where source files live — defaults to the manifest's directory
      const projectDir = options?.projectDir
        ? resolve(options.projectDir)
        : manifestDir;
      let hasErrors = false;

      // Validate icon if present (always relative to manifest directory)
      if (manifestData.icon) {
        const iconValidation = validateIcon(manifestData.icon, manifestDir);

        if (iconValidation.errors.length > 0) {
          console.log("\nERROR: Icon validation failed:\n");
          iconValidation.errors.forEach((error) => {
            console.log(`  - ${error}`);
          });
          hasErrors = true;
        }

        if (iconValidation.warnings.length > 0) {
          console.log("\nIcon validation warnings:\n");
          iconValidation.warnings.forEach((warning) => {
            console.log(`  - ${warning}`);
          });
        }
      }

      // Validate entry point (relative to project directory)
      const entryPointValidation = validateEntryPoint(manifestData, projectDir);
      if (entryPointValidation.errors.length > 0) {
        console.log("\nERROR: Entry point validation failed:\n");
        entryPointValidation.errors.forEach((error) => {
          console.log(`  - ${error}`);
        });
        hasErrors = true;
      }
      if (entryPointValidation.warnings.length > 0) {
        console.log("\nEntry point warnings:\n");
        entryPointValidation.warnings.forEach((warning) => {
          console.log(`  - ${warning}`);
        });
      }

      // Validate command variables
      const variableValidation = validateCommandVariables(manifestData);
      if (variableValidation.errors.length > 0) {
        console.log("\nERROR: Command variable validation failed:\n");
        variableValidation.errors.forEach((error) => {
          console.log(`  - ${error}`);
        });
        hasErrors = true;
      }
      if (variableValidation.warnings.length > 0) {
        console.log("\nCommand variable warnings:\n");
        variableValidation.warnings.forEach((warning) => {
          console.log(`  - ${warning}`);
        });
      }

      // Check for sensitive files (relative to project directory)
      const sensitiveValidation = validateSensitiveFiles(projectDir);
      if (sensitiveValidation.warnings.length > 0) {
        console.log("\nSensitive file warnings:\n");
        sensitiveValidation.warnings.forEach((warning) => {
          console.log(`  - ${warning}`);
        });
      }

      return !hasErrors;
    } else {
      console.log("ERROR: Manifest validation failed:\n");
      result.error.issues.forEach((issue) => {
        const path = issue.path.join(".");
        console.log(`  - ${path ? `${path}: ` : ""}${issue.message}`);
      });
      return false;
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ENOENT")) {
        console.error(`ERROR: File not found: ${inputPath}`);
        if (
          existsSync(resolve(inputPath)) &&
          statSync(resolve(inputPath)).isDirectory()
        ) {
          console.error(`  (No manifest.json found in directory)`);
        }
      } else if (error.message.includes("JSON")) {
        console.error(`ERROR: Invalid JSON in manifest file: ${error.message}`);
      } else {
        console.error(`ERROR: Error reading manifest: ${error.message}`);
      }
    } else {
      console.error("ERROR: Unknown error occurred");
    }
    return false;
  }
}

export async function cleanMcpb(inputPath: string) {
  const tmpDir = await fs.mkdtemp(resolve(os.tmpdir(), "mcpb-clean-"));
  const mcpbPath = resolve(tmpDir, "in.mcpb");
  const unpackPath = resolve(tmpDir, "out");

  console.log(" -- Cleaning MCPB...");

  try {
    await fs.copyFile(inputPath, mcpbPath);
    console.log(" -- Unpacking MCPB...");
    await unpackExtension({ mcpbPath, silent: true, outputDir: unpackPath });

    const manifestPath = resolve(unpackPath, "manifest.json");
    const originalManifest = await fs.readFile(manifestPath, "utf-8");
    const manifestData = JSON.parse(originalManifest);
    const manifestVersion = getManifestVersionFromRawData(manifestData);
    if (!manifestVersion) {
      throw new Error("Unrecognized or unsupported manifest version");
    }
    const result =
      MANIFEST_SCHEMAS_LOOSE[manifestVersion].safeParse(manifestData);

    if (!result.success) {
      throw new Error(
        `Unrecoverable manifest issues, please run "mcpb validate"`,
      );
    }
    await fs.writeFile(manifestPath, JSON.stringify(result.data, null, 2));

    if (
      originalManifest.trim() !==
      (await fs.readFile(manifestPath, "utf8")).trim()
    ) {
      console.log(" -- Update manifest to be valid per MCPB schema");
    } else {
      console.log(" -- Manifest already valid per MCPB schema");
    }

    const nodeModulesPath = resolve(unpackPath, "node_modules");
    if (existsSync(nodeModulesPath)) {
      console.log(" -- node_modules found, deleting development dependencies");

      const destroyer = new DestroyerOfModules({
        rootDirectory: unpackPath,
      });

      try {
        await destroyer.destroy();
      } catch (error) {
        // If modules have already been deleted in a previous clean, the walker
        // will fail when it can't find required dependencies. This is expected
        // and safe to ignore.
        if (
          error instanceof Error &&
          error.message.includes("Failed to locate module")
        ) {
          console.log(
            " -- Some modules already removed, skipping remaining cleanup",
          );
        } else {
          throw error;
        }
      }

      console.log(" -- Removed development dependencies from node_modules");
    } else {
      console.log(" -- No node_modules, not pruning");
    }

    const before = await fs.stat(inputPath);
    const { packExtension } = await import("../cli/pack.js");
    await packExtension({
      extensionPath: unpackPath,
      outputPath: inputPath,
      silent: true,
    });

    const after = await fs.stat(inputPath);

    console.log("\nClean Complete:");
    console.log("Before:", prettyBytes(before.size));
    console.log("After:", prettyBytes(after.size));
  } finally {
    await fs.rm(tmpDir, {
      recursive: true,
      force: true,
    });
  }
}
