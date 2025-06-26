import { confirm } from "@inquirer/prompts";
import { createHash } from "crypto";
import { zipSync } from "fflate";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, join, relative, resolve, sep } from "path";

import { getAllFilesWithCount, readDxtIgnorePatterns } from "../node/files.js";
import { validateManifest } from "../node/validate.js";
import { DxtManifestSchema } from "../schemas.js";
import { getLogger } from "../shared/log.js";
import { initExtension } from "./init.js";

interface PackOptions {
  extensionPath: string;
  outputPath?: string;
  silent?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}kB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}

function sanitizeNameForFilename(name: string): string {
  // Replace spaces with hyphens
  // Remove or replace characters that are problematic in filenames
  return name
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/[^a-z0-9-_.]/g, "") // Keep only alphanumeric, hyphens, underscores, and dots
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
    .substring(0, 100); // Limit length to 100 characters
}

export async function packExtension({
  extensionPath,
  outputPath,
  silent,
}: PackOptions): Promise<boolean> {
  const resolvedPath = resolve(extensionPath);
  const logger = getLogger({ silent });

  // Check if directory exists
  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
    logger.error(`ERROR: Directory not found: ${extensionPath}`);
    return false;
  }

  // Check if manifest exists
  const manifestPath = join(resolvedPath, "manifest.json");
  if (!existsSync(manifestPath)) {
    logger.log(`No manifest.json found in ${extensionPath}`);
    const shouldInit = await confirm({
      message: "Would you like to create a manifest.json file?",
      default: true,
    });

    if (shouldInit) {
      const success = await initExtension(extensionPath);
      if (!success) {
        logger.error("ERROR: Failed to create manifest");
        return false;
      }
    } else {
      logger.error("ERROR: Cannot pack extension without manifest.json");
      return false;
    }
  }

  // Validate manifest first
  logger.log("Validating manifest...");
  if (!validateManifest(manifestPath)) {
    logger.error("ERROR: Cannot pack extension with invalid manifest");
    return false;
  }

  // Read and parse manifest
  let manifest;
  try {
    const manifestContent = readFileSync(manifestPath, "utf-8");
    const manifestData = JSON.parse(manifestContent);
    manifest = DxtManifestSchema.parse(manifestData);
  } catch (error) {
    logger.error("ERROR: Failed to parse manifest.json");
    if (error instanceof Error) {
      logger.error(`  ${error.message}`);
    }
    return false;
  }

  // Determine output path
  const extensionName = basename(resolvedPath);
  const finalOutputPath = outputPath
    ? resolve(outputPath)
    : resolve(`${extensionName}.dxt`);

  // Ensure output directory exists
  const outputDir = join(finalOutputPath, "..");
  mkdirSync(outputDir, { recursive: true });

  try {
    // Read .dxtignore patterns if present
    const dxtIgnorePatterns = readDxtIgnorePatterns(resolvedPath);

    // Get all files in the extension directory
    const { files, ignoredCount } = getAllFilesWithCount(
      resolvedPath,
      resolvedPath,
      {},
      dxtIgnorePatterns,
    );

    // Print package header
    logger.log(`\n📦  ${manifest.name}@${manifest.version}`);

    // Print file list
    logger.log("Archive Contents");
    const fileEntries = Object.entries(files);
    let totalUnpackedSize = 0;

    // Sort files for consistent output
    fileEntries.sort(([a], [b]) => a.localeCompare(b));

    // Group files by directory for deep nesting
    const directoryGroups = new Map<
      string,
      { files: string[]; totalSize: number }
    >();
    const shallowFiles: Array<{ path: string; size: number }> = [];

    for (const [filePath, content] of fileEntries) {
      const relPath = relative(resolvedPath, filePath);
      const size =
        typeof content === "string"
          ? Buffer.byteLength(content, "utf8")
          : content.length;
      totalUnpackedSize += size;

      // Check if file is deeply nested (3+ levels)
      const parts = relPath.split(sep);
      if (parts.length > 3) {
        // Group by the first 3 directory levels
        const groupKey = parts.slice(0, 3).join("/");
        if (!directoryGroups.has(groupKey)) {
          directoryGroups.set(groupKey, { files: [], totalSize: 0 });
        }
        const group = directoryGroups.get(groupKey)!;
        group.files.push(relPath);
        group.totalSize += size;
      } else {
        shallowFiles.push({ path: relPath, size });
      }
    }

    // Print shallow files first
    for (const { path, size } of shallowFiles) {
      logger.log(`${formatFileSize(size).padStart(8)} ${path}`);
    }

    // Print grouped directories
    for (const [dir, { files, totalSize }] of directoryGroups) {
      if (files.length === 1) {
        // If only one file in the group, print it normally
        const filePath = files[0];
        const fileSize = totalSize;
        logger.log(`${formatFileSize(fileSize).padStart(8)} ${filePath}`);
      } else {
        // Print directory summary
        logger.log(
          `${formatFileSize(totalSize).padStart(8)} ${dir}/ [and ${files.length} more files]`,
        );
      }
    }

    // Create zip
    const zipData = zipSync(files, {
      level: 9, // Maximum compression
      mtime: new Date(),
    });

    // Write zip file
    writeFileSync(finalOutputPath, zipData);

    // Calculate SHA sum
    const shasum = createHash("sha1").update(zipData).digest("hex");

    // Print archive details
    const sanitizedName = sanitizeNameForFilename(manifest.name);
    const archiveName = `${sanitizedName}-${manifest.version}.dxt`;
    logger.log("\nArchive Details");
    logger.log(`name: ${manifest.name}`);
    logger.log(`version: ${manifest.version}`);
    logger.log(`filename: ${archiveName}`);
    logger.log(`package size: ${formatFileSize(zipData.length)}`);
    logger.log(`unpacked size: ${formatFileSize(totalUnpackedSize)}`);
    logger.log(`shasum: ${shasum}`);
    logger.log(`total files: ${fileEntries.length}`);
    logger.log(`ignored (.dxtignore) files: ${ignoredCount}`);

    logger.log(`\nOutput: ${finalOutputPath}`);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`ERROR: Archive error: ${error.message}`);
    } else {
      logger.error("ERROR: Unknown archive error occurred");
    }
    return false;
  }
}
