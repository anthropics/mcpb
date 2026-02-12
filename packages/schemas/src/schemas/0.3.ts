// WIP: This schema is under development and not yet finalized
import * as z from "zod";

export const MANIFEST_VERSION = "0.3";

const LOCALE_PLACEHOLDER_REGEX = /\$\{locale\}/i;
const BCP47_REGEX = /^[A-Za-z0-9]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const ICON_SIZE_REGEX = /^\d+x\d+$/;

export const McpServerConfigSchema = z.strictObject({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const McpbManifestAuthorSchema = z.strictObject({
  name: z.string(),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
});

export const McpbManifestRepositorySchema = z.strictObject({
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

export const McpbManifestServerSchema = z.strictObject({
  type: z.enum(["python", "node", "binary"]),
  entry_point: z.string(),
  mcp_config: McpbManifestMcpConfigSchema,
});

export const McpbManifestCompatibilitySchema = z.strictObject({
  claude_desktop: z.string().optional(),
  platforms: z.array(z.enum(["darwin", "win32", "linux"])).optional(),
  runtimes: z
    .strictObject({
      python: z.string().optional(),
      node: z.string().optional(),
    })
    .optional(),
});

export const McpbManifestToolSchema = z.strictObject({
  name: z.string(),
  description: z.string().optional(),
});

export const McpbManifestPromptSchema = z.strictObject({
  name: z.string(),
  description: z.string().optional(),
  arguments: z.array(z.string()).optional(),
  text: z.string(),
});

export const McpbUserConfigurationOptionSchema = z.strictObject({
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

export const McpbManifestLocalizationSchema = z.strictObject({
  resources: z
    .string()
    .regex(
      LOCALE_PLACEHOLDER_REGEX,
      'resources must include a "${locale}" placeholder',
    ),
  default_locale: z
    .string()
    .regex(
      BCP47_REGEX,
      "default_locale must be a valid BCP 47 locale identifier",
    ),
});

export const McpbManifestIconSchema = z.strictObject({
  src: z.string(),
  size: z
    .string()
    .regex(
      ICON_SIZE_REGEX,
      'size must be in the format "WIDTHxHEIGHT" (e.g., "16x16")',
    ),
  theme: z.string().min(1, "theme cannot be empty when provided").optional(),
});

export const McpbManifestSchema = z
  .strictObject({
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
    icons: z.array(McpbManifestIconSchema).optional(),
    screenshots: z.array(z.string()).optional(),
    localization: McpbManifestLocalizationSchema.optional(),
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
    _meta: z.record(z.string(), z.record(z.string(), z.any())).optional(),
  })
  .refine((data) => !!(data.dxt_version || data.manifest_version), {
    message:
      "Either 'dxt_version' (deprecated) or 'manifest_version' must be provided",
  });
