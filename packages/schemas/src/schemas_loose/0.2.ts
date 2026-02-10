import * as z from "zod";

export const MANIFEST_VERSION = "0.2";

export const McpServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const McpbManifestAuthorSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
});

export const McpbManifestRepositorySchema = z.object({
  type: z.string(),
  url: z.string().url(),
});

export const McpbManifestPlatformOverrideSchema =
  McpServerConfigSchema.partial();

export const McpbManifestMcpConfigSchema = McpServerConfigSchema.extend({
  platform_overrides: z
    .record(z.string(), McpbManifestPlatformOverrideSchema)
    .optional(),
});

export const McpbManifestServerSchema = z.object({
  type: z.enum(["python", "node", "binary"]),
  entry_point: z.string(),
  mcp_config: McpbManifestMcpConfigSchema,
});

export const McpbManifestCompatibilitySchema = z
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

export const McpbManifestToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const McpbManifestPromptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z.array(z.string()).optional(),
  text: z.string(),
});

export const McpbUserConfigurationOptionSchema = z.object({
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

export const McpbManifestSchema = z
  .object({
    $schema: z.string().optional(),
    dxt_version: z
      .literal(MANIFEST_VERSION)
      .optional()
      .describe("@deprecated Use manifest_version instead"),
    manifest_version: z.literal(MANIFEST_VERSION).optional(),
    name: z.string(),
    display_name: z.string().optional(),
    version: z.string(),
    description: z.string(),
    long_description: z.string().optional(),
    author: McpbManifestAuthorSchema,
    repository: McpbManifestRepositorySchema.optional(),
    homepage: z.string().url().optional(),
    documentation: z.string().url().optional(),
    support: z.string().url().optional(),
    icon: z.string().optional(),
    screenshots: z.array(z.string()).optional(),
    server: McpbManifestServerSchema,
    tools: z.array(McpbManifestToolSchema).optional(),
    tools_generated: z.boolean().optional(),
    prompts: z.array(McpbManifestPromptSchema).optional(),
    prompts_generated: z.boolean().optional(),
    keywords: z.array(z.string()).optional(),
    license: z.string().optional(),
    privacy_policies: z.array(z.string().url()).optional(),
    compatibility: McpbManifestCompatibilitySchema.optional(),
    user_config: z
      .record(z.string(), McpbUserConfigurationOptionSchema)
      .optional(),
  })
  .passthrough()
  .refine((data) => !!(data.dxt_version || data.manifest_version), {
    message:
      "Either 'dxt_version' (deprecated) or 'manifest_version' must be provided",
  });
