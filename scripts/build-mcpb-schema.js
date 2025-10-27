import {
  McpbManifestSchema,
  McpbSignatureInfoSchema,
} from "../dist/schemas/latest.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import fs from "node:fs/promises";
import path from "node:path";

const schemasToWrite = {
  "mcpb-manifest": McpbManifestSchema,
  "mcpb-signature-info": McpbSignatureInfoSchema,
};

const distDir = path.join(import.meta.dirname, "../dist");
const schemasDir = path.join(import.meta.dirname, "../schemas");

// Generate all schemas to dist/
await fs.mkdir(distDir, { recursive: true });
for (const key in schemasToWrite) {
  const schema = zodToJsonSchema(schemasToWrite[key]);
  const filePath = path.join(distDir, `${key}.schema.json`);
  await fs.writeFile(filePath, JSON.stringify(schema, null, 2), {
    encoding: "utf8",
  });
}

// Generate only manifest schema to schemas/
await fs.mkdir(schemasDir, { recursive: true });
const manifestSchema = zodToJsonSchema(McpbManifestSchema);
const manifestPath = path.join(schemasDir, "mcpb-manifest.schema.json");
await fs.writeFile(manifestPath, JSON.stringify(manifestSchema, null, 2), {
  encoding: "utf8",
});
