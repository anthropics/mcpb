import { McpbManifestSchema as ManifestSchemaV0_1 } from "../schemas/0.1.js";
import { McpbManifestSchema as ManifestSchemaV0_2 } from "../schemas/0.2.js";
import { McpbManifestSchema as ManifestSchemaV0_3 } from "../schemas/0.3.js";
import { McpbManifestSchema as ManifestSchemaV0_4 } from "../schemas/0.4.js";
import { McpbManifestSchema as LooseManifestSchemaV0_1 } from "../schemas_loose/0.1.js";
import { McpbManifestSchema as LooseManifestSchemaV0_2 } from "../schemas_loose/0.2.js";
import { McpbManifestSchema as LooseManifestSchemaV0_3 } from "../schemas_loose/0.3.js";
import { McpbManifestSchema as LooseManifestSchemaV0_4 } from "../schemas_loose/0.4.js";

/**
 * Latest manifest version - indicates the maximum supported version by vAny schema
 */
export const LATEST_MANIFEST_VERSION = "0.4" as const;

/**
 * Default manifest version for new packages
 */
export const DEFAULT_MANIFEST_VERSION = "0.2" as const;

/**
 * Map of manifest versions to their strict schemas
 */
export const MANIFEST_SCHEMAS = {
  "0.1": ManifestSchemaV0_1,
  "0.2": ManifestSchemaV0_2,
  "0.3": ManifestSchemaV0_3,
  "0.4": ManifestSchemaV0_4,
} as const;

/**
 * Map of manifest versions to their loose schemas (with passthrough)
 */
export const MANIFEST_SCHEMAS_LOOSE = {
  "0.1": LooseManifestSchemaV0_1,
  "0.2": LooseManifestSchemaV0_2,
  "0.3": LooseManifestSchemaV0_3,
  "0.4": LooseManifestSchemaV0_4,
} as const;
