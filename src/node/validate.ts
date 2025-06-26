import { existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import { DxtManifestSchema } from "../schemas.js";

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

    const result = DxtManifestSchema.safeParse(manifestData);

    if (result.success) {
      console.log("Manifest is valid!");
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
