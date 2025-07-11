import { existsSync, readFileSync, statSync } from "fs";
import * as fs from "fs/promises";
import { DestroyerOfModules } from "galactus";
import * as os from "os";
import { join, resolve } from "path";
import prettyBytes from "pretty-bytes";

import { unpackExtension } from "../cli/unpack.js";
import { DxtManifestSchema } from "../schemas.js";
import { DxtManifestSchema as LooseDxtManifestSchema } from "../schemas-loose.js";

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

export async function cleanDxt(inputPath: string) {
  const tmpDir = await fs.mkdtemp(resolve(os.tmpdir(), "dxt-clean-"));
  const dxtPath = resolve(tmpDir, "in.dxt");
  const unpackPath = resolve(tmpDir, "out");

  console.log(" -- Cleaning DXT...");

  try {
    await fs.copyFile(inputPath, dxtPath);
    console.log(" -- Unpacking DXT...");
    await unpackExtension({ dxtPath, silent: true, outputDir: unpackPath });

    const manifestPath = resolve(unpackPath, "manifest.json");

    const originalManifest = await fs.readFile(manifestPath, "utf-8");
    const manifestData = JSON.parse(originalManifest);

    const result = LooseDxtManifestSchema.safeParse(manifestData);

    if (!result.success) {
      throw new Error(
        `Unrecoverable manifest issues, please run "dxt validate"`,
      );
    }
    await fs.writeFile(manifestPath, JSON.stringify(result.data, null, 2));

    if (
      originalManifest.trim() !==
      (await fs.readFile(manifestPath, "utf8")).trim()
    ) {
      console.log(" -- Update manifest to be valid per DXT schema");
    } else {
      console.log(" -- Manifest already valid per DXT schema");
    }

    const nodeModulesPath = resolve(unpackPath, "node_modules");
    if (existsSync(nodeModulesPath)) {
      console.log(" -- node_modules found, running galactus");

      const destroyer = new DestroyerOfModules({
        rootDirectory: unpackPath,
      });
      await destroyer.destroy();

      console.log(" -- Galactus pruned node_modules");
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
