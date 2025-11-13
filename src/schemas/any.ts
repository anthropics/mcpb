import * as z from "zod";

import * as v0_1 from "./0.1.js";
import * as v0_2 from "./0.2.js";
import * as v0_3 from "./0.3.js";
import * as v0_4 from "./0.4.js";

/**
 * Union schema that accepts any supported manifest version.
 * Use this when you need to validate manifests of any version.
 */
export const McpbManifestSchema = z.union([
  v0_1.McpbManifestSchema,
  v0_2.McpbManifestSchema,
  v0_3.McpbManifestSchema,
  v0_4.McpbManifestSchema,
]);
