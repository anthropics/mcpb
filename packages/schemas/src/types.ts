import type * as z from "zod";

import type { McpbManifestSchema as McpbManifestSchemaAny } from "./schemas/any.js";

/**
 * McpbManifest type representing the union of all manifest versions
 */
export type McpbManifestAny = z.infer<typeof McpbManifestSchemaAny>;

export interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}
