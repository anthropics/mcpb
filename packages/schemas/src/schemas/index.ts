import { McpbManifestSchema as ManifestSchemaV0_1 } from "./0.1.js";
import { McpbManifestSchema as ManifestSchemaV0_2 } from "./0.2.js";
import { McpbManifestSchema as ManifestSchemaV0_3 } from "./0.3.js";
import { McpbManifestSchema as ManifestSchemaV0_4 } from "./0.4.js";

export * as v0_1 from "./0.1.js";
export * as v0_2 from "./0.2.js";
export * as v0_3 from "./0.3.js";
export * as v0_4 from "./0.4.js";
export * as vAny from "./any.js";

/**
 * Map of manifest versions to their strict schemas
 */
export const VERSIONED_MANIFEST_SCHEMAS = {
  "0.1": ManifestSchemaV0_1,
  "0.2": ManifestSchemaV0_2,
  "0.3": ManifestSchemaV0_3,
  "0.4": ManifestSchemaV0_4,
} as const;
