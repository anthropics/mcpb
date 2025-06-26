import type { z } from "zod";

import type {
  DxtManifestAuthorSchema,
  DxtManifestCompatibilitySchema,
  DxtManifestMcpConfigSchema,
  DxtManifestPlatformOverrideSchema,
  DxtManifestPromptSchema,
  DxtManifestRepositorySchema,
  DxtManifestSchema,
  DxtManifestServerSchema,
  DxtManifestToolSchema,
  DxtUserConfigurationOptionSchema,
  DxtUserConfigValuesSchema,
  McpServerConfigSchema,
} from "./schemas.js";

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export type DxtManifestAuthor = z.infer<typeof DxtManifestAuthorSchema>;

export type DxtManifestRepository = z.infer<typeof DxtManifestRepositorySchema>;

export type DxtManifestPlatformOverride = z.infer<
  typeof DxtManifestPlatformOverrideSchema
>;

export type DxtManifestMcpConfig = z.infer<typeof DxtManifestMcpConfigSchema>;

export type DxtManifestServer = z.infer<typeof DxtManifestServerSchema>;

export type DxtManifestCompatibility = z.infer<
  typeof DxtManifestCompatibilitySchema
>;

export type DxtManifestTool = z.infer<typeof DxtManifestToolSchema>;

export type DxtManifestPrompt = z.infer<typeof DxtManifestPromptSchema>;

export type DxtUserConfigurationOption = z.infer<
  typeof DxtUserConfigurationOptionSchema
>;

export type DxtUserConfigValues = z.infer<typeof DxtUserConfigValuesSchema>;

export type DxtManifest = z.infer<typeof DxtManifestSchema>;

/**
 * Information about a DXT package signature
 */
export interface DxtSignatureInfo {
  status: "signed" | "unsigned" | "self-signed";
  publisher?: string;
  issuer?: string;
  valid_from?: string;
  valid_to?: string;
  fingerprint?: string;
}

export interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}
