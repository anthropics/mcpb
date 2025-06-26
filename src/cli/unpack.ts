import { unzipSync } from "fflate";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import { extractSignatureBlock } from "../node/sign.js";
import { getLogger } from "../shared/log.js";

interface UnpackOptions {
  dxtPath: string;
  outputDir?: string;
  silent?: boolean;
}

export async function unpackExtension({
  dxtPath,
  outputDir,
  silent,
}: UnpackOptions): Promise<boolean> {
  const logger = getLogger({ silent });
  const resolvedDxtPath = resolve(dxtPath);

  if (!existsSync(resolvedDxtPath)) {
    logger.error(`ERROR: DXT file not found: ${dxtPath}`);
    return false;
  }

  const finalOutputDir = outputDir ? resolve(outputDir) : process.cwd();

  if (!existsSync(finalOutputDir)) {
    mkdirSync(finalOutputDir, { recursive: true });
  }

  try {
    const fileContent = readFileSync(resolvedDxtPath);
    const { originalContent } = extractSignatureBlock(fileContent);

    const decompressed = unzipSync(originalContent);

    for (const relativePath in decompressed) {
      if (Object.prototype.hasOwnProperty.call(decompressed, relativePath)) {
        const data = decompressed[relativePath];
        const fullPath = join(finalOutputDir, relativePath);
        const dir = join(fullPath, "..");
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(fullPath, data);
      }
    }

    logger.log(`Extension unpacked successfully to ${finalOutputDir}`);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`ERROR: Failed to unpack extension: ${error.message}`);
    } else {
      logger.error("ERROR: An unknown error occurred during unpacking.");
    }
    return false;
  }
}
