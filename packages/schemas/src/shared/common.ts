import { z } from "zod";

export const McpbUserConfigValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);

export const McpbSignatureInfoSchema = z.strictObject({
  status: z.enum(["signed", "unsigned", "self-signed"]),
  publisher: z.string().optional(),
  issuer: z.string().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  fingerprint: z.string().optional(),
});

export type McpbSignatureInfo = z.infer<typeof McpbSignatureInfoSchema>;
export type McpbUserConfigValues = z.infer<typeof McpbUserConfigValuesSchema>;
