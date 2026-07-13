import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "fs";
import ignore from "ignore";
import { join, relative, sep } from "path";

// Files/patterns to exclude from the package
export const EXCLUDE_PATTERNS = [
  ".DS_Store",
  "Thumbs.db",
  ".gitignore",
  ".git",
  ".mcpbignore",
  "*.log",
  ".env*",
  ".npm",
  ".npmrc",
  ".yarnrc",
  ".yarn",
  ".eslintrc",
  ".editorconfig",
  ".prettierrc",
  ".prettierignore",
  ".eslintignore",
  ".nycrc",
  ".babelrc",
  ".pnp.*",
  "node_modules/.cache",
  "node_modules/.bin",
  "*.map",
  ".env.local",
  ".env.*.local",
  "npm-debug.log*",
  "yarn-debug.log*",
  "yarn-error.log*",
  "package-lock.json",
  "yarn.lock",
  "*.mcpb",
  "*.d.ts",
  "*.tsbuildinfo",
  "tsconfig.json",
];

/**
 * Read and parse .mcpbignore file patterns
 */
export function readMcpbIgnorePatterns(baseDir: string): string[] {
  const mcpbIgnorePath = join(baseDir, ".mcpbignore");
  if (!existsSync(mcpbIgnorePath)) {
    return [];
  }

  try {
    const content = readFileSync(mcpbIgnorePath, "utf-8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch (error) {
    console.warn(
      `Warning: Could not read .mcpbignore file: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return [];
  }
}

function buildIgnoreChecker(additionalPatterns: string[]) {
  return ignore().add(EXCLUDE_PATTERNS).add(additionalPatterns);
}

/**
 * Used for testing, calls the same methods as the other ignore checks
 */
export function shouldExclude(
  filePath: string,
  additionalPatterns: string[] = [],
): boolean {
  return buildIgnoreChecker(additionalPatterns).ignores(filePath);
}

/**
 * Returns the real path of a directory if it is safe to recurse into, or
 * undefined if doing so would revisit a directory already on the current
 * traversal path (i.e. a symlink cycle).
 */
function checkForSymlinkCycle(
  dirPath: string,
  relativePath: string,
  visitedRealPaths: Set<string>,
): string | undefined {
  const realPath = realpathSync(dirPath);
  if (visitedRealPaths.has(realPath)) {
    console.warn(`Warning: Symlink cycle detected, skipping: ${relativePath}`);
    return undefined;
  }
  return realPath;
}

export function getAllFiles(
  dirPath: string,
  baseDir: string = dirPath,
  fileList: Record<string, Uint8Array> = {},
  additionalPatterns: string[] = [],
  visitedRealPaths: Set<string> = new Set([realpathSync(dirPath)]),
): Record<string, Uint8Array> {
  const files = readdirSync(dirPath);

  const ignoreChecker = buildIgnoreChecker(additionalPatterns);

  for (const file of files) {
    const filePath = join(dirPath, file);
    const relativePath = relative(baseDir, filePath);

    if (ignoreChecker.ignores(relativePath)) {
      continue;
    }

    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      const realPath = checkForSymlinkCycle(
        filePath,
        relativePath,
        visitedRealPaths,
      );
      if (realPath === undefined) {
        continue;
      }
      visitedRealPaths.add(realPath);
      getAllFiles(
        filePath,
        baseDir,
        fileList,
        additionalPatterns,
        visitedRealPaths,
      );
      visitedRealPaths.delete(realPath);
    } else {
      // Use forward slashes in zip file paths
      const zipPath = relativePath.split(sep).join("/");
      fileList[zipPath] = readFileSync(filePath);
    }
  }

  return fileList;
}

interface FileWithPermissions {
  data: Uint8Array;
  mode: number;
}
export interface GetAllFilesResult {
  files: Record<string, FileWithPermissions>;
  ignoredCount: number;
}

export function getAllFilesWithCount(
  dirPath: string,
  baseDir: string = dirPath,
  fileList: Record<string, FileWithPermissions> = {},
  additionalPatterns: string[] = [],
  ignoredCount = 0,
  visitedRealPaths: Set<string> = new Set([realpathSync(dirPath)]),
): GetAllFilesResult {
  const files = readdirSync(dirPath);

  const ignoreChecker = buildIgnoreChecker(additionalPatterns);

  for (const file of files) {
    const filePath = join(dirPath, file);
    const relativePath = relative(baseDir, filePath);

    if (ignoreChecker.ignores(relativePath)) {
      ignoredCount++;
      continue;
    }

    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      const realPath = checkForSymlinkCycle(
        filePath,
        relativePath,
        visitedRealPaths,
      );
      if (realPath === undefined) {
        continue;
      }
      visitedRealPaths.add(realPath);
      const result = getAllFilesWithCount(
        filePath,
        baseDir,
        fileList,
        additionalPatterns,
        ignoredCount,
        visitedRealPaths,
      );
      ignoredCount = result.ignoredCount;
      visitedRealPaths.delete(realPath);
    } else {
      // Use forward slashes in zip file paths
      const zipPath = relativePath.split(sep).join("/");
      fileList[zipPath] = {
        data: readFileSync(filePath),
        mode: stat.mode,
      };
    }
  }

  return { files: fileList, ignoredCount };
}
