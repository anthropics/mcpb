import { McpbManifestSchema as ManifestSchemaV0_1 } from "../schemas/0.1.js";
import { McpbManifestSchema as ManifestSchemaV0_2 } from "../schemas/0.2.js";
import { McpbManifestSchema as CurrentManifestSchema } from "../schemas/latest.js";
import { McpbManifestSchema as LooseManifestSchemaV0_1 } from "../schemas_loose/0.1.js";
import { McpbManifestSchema as LooseManifestSchemaV0_2 } from "../schemas_loose/0.2.js";
import { McpbManifestSchema as CurrentLooseManifestSchema } from "../schemas_loose/latest.js";

/**
 * Latest manifest version - the version that new manifests should use
 */
export const LATEST_MANIFEST_VERSION = "0.2" as const;

/**
 * Map of manifest versions to their strict schemas
 */
export const MANIFEST_SCHEMAS = {
  "0.1": ManifestSchemaV0_1,
  "0.2": ManifestSchemaV0_2,
} as const;

/**
 * Map of manifest versions to their loose schemas (with passthrough)
 */
export const MANIFEST_SCHEMAS_LOOSE = {
  "0.1": LooseManifestSchemaV0_1,
  "0.2": LooseManifestSchemaV0_2,
} as const;

/**
 * Get the latest manifest schema based on LATEST_MANIFEST_VERSION
 */
export const LATEST_MANIFEST_SCHEMA = CurrentManifestSchema;

/**
 * Get the latest loose manifest schema based on LATEST_MANIFEST_VERSION
 */
export const LATEST_MANIFEST_SCHEMA_LOOSE = CurrentLooseManifestSchema;
