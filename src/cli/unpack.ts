import { unzipSync } from "fflate";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve, sep } from "path";

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

    // Parse file attributes from ZIP central directory
    const fileAttributes = new Map<string, number>();
    const isUnix = process.platform !== "win32";

    if (isUnix) {
      // Parse ZIP central directory to extract file attributes
      const zipBuffer = originalContent;
      
      // Find end of central directory record
      let eocdOffset = -1;
      for (let i = zipBuffer.length - 22; i >= 0; i--) {
        if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
          eocdOffset = i;
          break;
        }
      }

      if (eocdOffset !== -1) {
        const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
        const centralDirEntries = zipBuffer.readUInt16LE(eocdOffset + 8);
        
        let offset = centralDirOffset;
        
        for (let i = 0; i < centralDirEntries; i++) {
          if (zipBuffer.readUInt32LE(offset) === 0x02014b50) {
            const externalAttrs = zipBuffer.readUInt32LE(offset + 38);
            const filenameLength = zipBuffer.readUInt16LE(offset + 28);
            const filename = zipBuffer.toString('utf8', offset + 46, offset + 46 + filenameLength);
            
            // Extract Unix permissions from external attributes (upper 16 bits)
            const mode = (externalAttrs >> 16) & 0o777;
            if (mode > 0) {
              fileAttributes.set(filename, mode);
            }
            
            const extraFieldLength = zipBuffer.readUInt16LE(offset + 30);
            const commentLength = zipBuffer.readUInt16LE(offset + 32);
            offset += 46 + filenameLength + extraFieldLength + commentLength;
          } else {
            break;
          }
        }
      }
    }

    const decompressed = unzipSync(originalContent);

    for (const relativePath in decompressed) {
      if (Object.prototype.hasOwnProperty.call(decompressed, relativePath)) {
        const data = decompressed[relativePath];
        const fullPath = join(finalOutputDir, relativePath);

        // Prevent zip slip attacks by validating the resolved path
        const normalizedPath = resolve(fullPath);
        const normalizedOutputDir = resolve(finalOutputDir);
        if (
          !normalizedPath.startsWith(normalizedOutputDir + sep) &&
          normalizedPath !== normalizedOutputDir
        ) {
          throw new Error(`Path traversal attempt detected: ${relativePath}`);
        }

        const dir = join(fullPath, "..");
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(fullPath, data);

        // Restore Unix file permissions if available
        if (isUnix && fileAttributes.has(relativePath)) {
          try {
            const mode = fileAttributes.get(relativePath);
            if (mode !== undefined) {
              chmodSync(fullPath, mode);
            }
          } catch (error) {
            // Silently ignore permission errors
          }
        }
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
