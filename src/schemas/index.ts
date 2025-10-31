import { McpbManifestSchema as ManifestSchemaV0_1 } from "./0.1.js";
import { McpbManifestSchema as ManifestSchemaV0_2 } from "./0.2.js";
import { McpbManifestSchema as ManifestSchemaV0_3 } from "./0.3.js";
import { McpbManifestSchema as ManifestSchemaV1_0 } from "./1.0.js";

export * as v0_1 from "./0.1.js";
export * as v0_2 from "./0.2.js";
export * as v0_3 from "./0.3.js";
export * as v1_0 from "./1.0.js";
export * as any from "./any.js";
export * as latest from "./latest.js";
export {
  McpbManifestSchema as LATEST_MANIFEST_SCHEMA,
  MANIFEST_VERSION as LATEST_MANIFEST_VERSION,
  McpbManifestSchema,
} from "./latest.js";

/**
 * Map of manifest versions to their strict schemas
 */
export const VERSIONED_MANIFEST_SCHEMAS = {
  "0.1": ManifestSchemaV0_1,
  "0.2": ManifestSchemaV0_2,
  "0.3": ManifestSchemaV0_3,
  "1.0": ManifestSchemaV1_0,
} as const;
