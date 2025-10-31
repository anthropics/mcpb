import type * as z from "zod";

import type { McpbManifestSchema as McpbManifestSchema_vAny } from "./schemas/any.js";
import type {
  McpbManifestAuthorSchema,
  McpbManifestCompatibilitySchema,
  McpbManifestMcpConfigSchema,
  McpbManifestPlatformOverrideSchema,
  McpbManifestPromptSchema,
  McpbManifestRepositorySchema,
  McpbManifestSchema,
  McpbManifestServerSchema,
  McpbManifestToolSchema,
  McpbSignatureInfoSchema,
  McpbUserConfigurationOptionSchema,
  McpbUserConfigValuesSchema,
  McpServerConfigSchema,
} from "./schemas/latest.js";

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export type McpbManifestAuthor = z.infer<typeof McpbManifestAuthorSchema>;

export type McpbManifestRepository = z.infer<
  typeof McpbManifestRepositorySchema
>;

export type McpbManifestPlatformOverride = z.infer<
  typeof McpbManifestPlatformOverrideSchema
>;

export type McpbManifestMcpConfig = z.infer<typeof McpbManifestMcpConfigSchema>;

export type McpbManifestServer = z.infer<typeof McpbManifestServerSchema>;

export type McpbManifestCompatibility = z.infer<
  typeof McpbManifestCompatibilitySchema
>;

export type McpbManifestTool = z.infer<typeof McpbManifestToolSchema>;

export type McpbManifestPrompt = z.infer<typeof McpbManifestPromptSchema>;

export type McpbUserConfigurationOption = z.infer<
  typeof McpbUserConfigurationOptionSchema
>;

export type McpbUserConfigValues = z.infer<typeof McpbUserConfigValuesSchema>;

/**
 * McpbManifest type that accepts any supported manifest version
 * This is the default manifest type that should be used for maximum compatibility.
 */
export type McpbManifestAny = z.infer<typeof McpbManifestSchema_vAny>;

/**
 * McpbManifest type for the latest manifest version only
 * Use this when you specifically need the latest version.
 */
export type McpbManifestLatest = z.infer<typeof McpbManifestSchema>;

/**
 * @deprecated Use McpbManifestAny instead
 * Default manifest type that accepts any supported version
 */
export type McpbManifest = McpbManifestAny;

/**
 * Information about a MCPB package signature
 */
export type McpbSignatureInfo = z.infer<typeof McpbSignatureInfoSchema>;

export interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}
