import { unzipSync } from "fflate";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join, resolve, sep } from "path";

import { extractSignatureBlock } from "../node/sign.js";
import { getLogger } from "../shared/log.js";

// Guard rails against decompression bombs. The archive is untrusted input;
// these cap how much the central-directory pass will declare before we
// decompress the whole thing into memory.
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024; // 1 GiB
const DEFAULT_MAX_ENTRIES = 100_000;

interface UnpackOptions {
  mcpbPath: string;
  outputDir?: string;
  silent?: boolean;
  /** Reject archives whose declared total uncompressed size exceeds this. */
  maxUncompressedBytes?: number;
  /** Reject archives that declare more central-directory entries than this. */
  maxEntries?: number;
}

export async function unpackExtension({
  mcpbPath,
  outputDir,
  silent,
  maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: UnpackOptions): Promise<boolean> {
  const logger = getLogger({ silent });
  const resolvedMcpbPath = resolve(mcpbPath);

  if (!existsSync(resolvedMcpbPath)) {
    logger.error(`ERROR: MCPB file not found: ${mcpbPath}`);
    return false;
  }

  const finalOutputDir = outputDir ? resolve(outputDir) : process.cwd();

  if (!existsSync(finalOutputDir)) {
    mkdirSync(finalOutputDir, { recursive: true });
  }

  try {
    const fileContent = readFileSync(resolvedMcpbPath);
    const { originalContent } = extractSignatureBlock(fileContent);

    // Parse the ZIP central directory to (a) extract Unix file attributes and
    // (b) enforce decompression-bomb limits before inflating into memory. All
    // reads are bounds-checked against the buffer length so a malformed or
    // truncated central directory cannot throw a RangeError mid-parse.
    const fileAttributes = new Map<string, number>();
    const isUnix = process.platform !== "win32";

    const zipBuffer = originalContent;
    const len = zipBuffer.length;

    // Find end of central directory record (scan backwards from the earliest
    // position a 22-byte EOCD could start).
    let eocdOffset = -1;
    for (let i = len - 22; i >= 0; i--) {
      if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset !== -1 && eocdOffset + 20 <= len) {
      const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
      const centralDirEntries = zipBuffer.readUInt16LE(eocdOffset + 8);

      if (centralDirEntries > maxEntries) {
        throw new Error(
          `Archive declares too many entries (${centralDirEntries} > ${maxEntries})`,
        );
      }

      let offset = centralDirOffset;
      let totalUncompressed = 0;

      for (let i = 0; i < centralDirEntries; i++) {
        // Need at least the 46-byte fixed central-directory header.
        if (offset < 0 || offset + 46 > len) {
          break;
        }
        if (zipBuffer.readUInt32LE(offset) !== 0x02014b50) {
          break;
        }

        const uncompressedSize = zipBuffer.readUInt32LE(offset + 24);
        const externalAttrs = zipBuffer.readUInt32LE(offset + 38);
        const filenameLength = zipBuffer.readUInt16LE(offset + 28);
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 30);
        const commentLength = zipBuffer.readUInt16LE(offset + 32);

        if (offset + 46 + filenameLength > len) {
          break;
        }

        totalUncompressed += uncompressedSize;
        if (totalUncompressed > maxUncompressedBytes) {
          throw new Error(
            `Archive uncompressed size exceeds limit (${maxUncompressedBytes} bytes)`,
          );
        }

        if (isUnix) {
          const filename = zipBuffer.toString(
            "utf8",
            offset + 46,
            offset + 46 + filenameLength,
          );
          // Extract Unix permissions from external attributes (upper 16 bits)
          const mode = (externalAttrs >> 16) & 0o777;
          if (mode > 0) {
            fileAttributes.set(filename, mode);
          }
        }

        offset += 46 + filenameLength + extraFieldLength + commentLength;
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
