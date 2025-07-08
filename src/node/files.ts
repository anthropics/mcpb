import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import ignore from "ignore";
import { join, relative, sep } from "path";

// Files/patterns to exclude from the package
export const EXCLUDE_PATTERNS = [
  ".DS_Store",
  "Thumbs.db",
  ".gitignore",
  ".git",
  ".dxtignore",
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
  "*.dxt",
  "*.d.ts",
  "*.tsbuildinfo",
  "tsconfig.json",
];

/**
 * Read and parse .dxtignore file patterns
 */
export function readDxtIgnorePatterns(baseDir: string): string[] {
  const dxtIgnorePath = join(baseDir, ".dxtignore");
  if (!existsSync(dxtIgnorePath)) {
    return [];
  }

  try {
    const content = readFileSync(dxtIgnorePath, "utf-8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch (error) {
    console.warn(
      `Warning: Could not read .dxtignore file: ${error instanceof Error ? error.message : "Unknown error"}`,
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

export function getAllFiles(
  dirPath: string,
  baseDir: string = dirPath,
  fileList: Record<string, Uint8Array> = {},
  additionalPatterns: string[] = [],
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
      getAllFiles(filePath, baseDir, fileList, additionalPatterns);
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
      const result = getAllFilesWithCount(
        filePath,
        baseDir,
        fileList,
        additionalPatterns,
        ignoredCount,
      );
      ignoredCount = result.ignoredCount;
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
