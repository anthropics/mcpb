import * as z from "zod";

import * as v0_1 from "./0.1.js";
import * as v0_2 from "./0.2.js";
import * as v0_3 from "./0.3.js";
import * as v1_0 from "./1.0.js";

/**
 * Extend each version schema to require manifest_version for discrimination.
 * The preprocessing step guarantees manifest_version is always set.
 */
const v0_1_WithRequiredVersion = v0_1.McpbManifestSchema.extend({
  manifest_version: z.literal("0.1"),
});

const v0_2_WithRequiredVersion = v0_2.McpbManifestSchema.extend({
  manifest_version: z.literal("0.2"),
});

const v0_3_WithRequiredVersion = v0_3.McpbManifestSchema.extend({
  manifest_version: z.literal("0.3"),
});

const v1_0_WithRequiredVersion = v1_0.McpbManifestSchema.extend({
  manifest_version: z.literal("1.0"),
});

/**
 * Union schema that accepts any supported manifest version.
 * Uses preprocessing to normalize dxt_version to manifest_version,
 * then efficiently discriminates based on the now-required manifest_version field.
 */
export const McpbManifestSchema = z.preprocess(
  (val) => {
    // Normalize: if it has dxt_version, ensure manifest_version is also set
    if (val && typeof val === "object" && "dxt_version" in val) {
      const obj = val as Record<string, unknown>;
      if (!obj.manifest_version && obj.dxt_version) {
        return { ...obj, manifest_version: obj.dxt_version };
      }
    }
    return val;
  },
  z.discriminatedUnion("manifest_version", [
    v0_1_WithRequiredVersion,
    v0_2_WithRequiredVersion,
    v0_3_WithRequiredVersion,
    v1_0_WithRequiredVersion,
  ]),
);
