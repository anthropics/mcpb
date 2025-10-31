import * as z from "zod";

import * as v0_1 from "./0.1.js";
import * as v0_2 from "./0.2.js";
import * as v0_3 from "./0.3.js";
import * as v1_0 from "./1.0.js";

/**
 * Union schema that accepts any supported manifest version
 */
export const McpbManifestSchema = z.union([
  v0_1.McpbManifestSchema,
  v0_2.McpbManifestSchema,
  v0_3.McpbManifestSchema,
  v1_0.McpbManifestSchema,
]);
