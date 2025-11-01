import { existsSync, readFileSync, statSync } from "fs";
import * as fs from "fs/promises";
import { DestroyerOfModules } from "galactus";
import * as os from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import prettyBytes from "pretty-bytes";

import { unpackExtension } from "../cli/unpack.js";
import {
  MANIFEST_SCHEMAS,
  MANIFEST_SCHEMAS_LOOSE,
} from "../shared/constants.js";
import { getManifestVersionFromRawData } from "../shared/manifestVersionResolve.js";

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

export function validateManifest(inputPath: string): boolean {
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

      // Validate icon if present
      if (manifestData.icon) {
        const baseDir = dirname(manifestPath);
        const iconValidation = validateIcon(manifestData.icon, baseDir);

        if (iconValidation.errors.length > 0) {
          console.log("\nERROR: Icon validation failed:\n");
          iconValidation.errors.forEach((error) => {
            console.log(`  - ${error}`);
          });
          return false;
        }

        if (iconValidation.warnings.length > 0) {
          console.log("\nIcon validation warnings:\n");
          iconValidation.warnings.forEach((warning) => {
            console.log(`  - ${warning}`);
          });
        }
      }

      return true;
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
