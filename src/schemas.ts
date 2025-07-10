import * as z from "zod";

export const McpServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const DxtManifestAuthorSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
});

export const DxtManifestRepositorySchema = z.object({
  type: z.string(),
  url: z.string().url(),
});

export const DxtManifestPlatformOverrideSchema =
  McpServerConfigSchema.partial();

export const DxtManifestMcpConfigSchema = McpServerConfigSchema.extend({
  platform_overrides: z
    .record(z.string(), DxtManifestPlatformOverrideSchema)
    .optional(),
});

export const DxtManifestServerSchema = z.object({
  type: z.enum(["python", "node", "binary"]),
  entry_point: z.string(),
  mcp_config: DxtManifestMcpConfigSchema,
});

export const DxtManifestCompatibilitySchema = z
  .object({
    claude_desktop: z.string().optional(),
    platforms: z.array(z.enum(["darwin", "win32", "linux"])).optional(),
    runtimes: z
      .object({
        python: z.string().optional(),
        node: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const DxtManifestToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const DxtManifestPromptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z.array(z.string()).optional(),
  text: z.string(),
});

export const DxtUserConfigurationOptionSchema = z.object({
  type: z.enum(["string", "number", "boolean", "directory", "file"]),
  title: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
  default: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
  multiple: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const DxtUserConfigValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);

export const DxtManifestSchema = z.object({
  $schema: z.string().optional(),
  dxt_version: z.string(),
  name: z.string(),
  display_name: z.string().optional(),
  version: z.string(),
  description: z.string(),
  long_description: z.string().optional(),
  author: DxtManifestAuthorSchema,
  repository: DxtManifestRepositorySchema.optional(),
  homepage: z.string().url().optional(),
  documentation: z.string().url().optional(),
  support: z.string().url().optional(),
  icon: z.string().optional(),
  screenshots: z.array(z.string()).optional(),
  server: DxtManifestServerSchema,
  tools: z.array(DxtManifestToolSchema).optional(),
  tools_generated: z.boolean().optional(),
  prompts: z.array(DxtManifestPromptSchema).optional(),
  prompts_generated: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
  license: z.string().optional(),
  compatibility: DxtManifestCompatibilitySchema.optional(),
  user_config: z
    .record(z.string(), DxtUserConfigurationOptionSchema)
    .optional(),
});

export const DxtSignatureInfoSchema = z.object({
  status: z.enum(["signed", "unsigned", "self-signed"]),
  publisher: z.string().optional(),
  issuer: z.string().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  fingerprint: z.string().optional(),
});
