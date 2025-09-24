import type * as z from "zod";

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
} from "./schemas/0.2.js";

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

export type McpbManifest = z.infer<typeof McpbManifestSchema>;

/**
 * Information about a MCPB package signature
 */
export type McpbSignatureInfo = z.infer<typeof McpbSignatureInfoSchema>;

export interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}
