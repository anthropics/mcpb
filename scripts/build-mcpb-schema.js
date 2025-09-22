import {
  McpbManifestSchema,
  McpbSignatureInfoSchema,
} from "../dist/schemas.js";
import * as z from "zod/v4";
import fs from "node:fs/promises";
import path from "node:path";

const schemasToWrite = {
  "mcpb-manifest": McpbManifestSchema,
  "mcpb-signature-info": McpbSignatureInfoSchema,
};

await fs.mkdir(path.join(import.meta.dirname, "../dist"), { recursive: true });

for (const key in schemasToWrite) {
  const schema = z.toJSONSchema(schemasToWrite[key]);
  await fs.writeFile(
    path.join(import.meta.dirname, "../dist", `${key}.schema.json`),
    JSON.stringify(schema, null, 2),
    {
      encoding: "utf8",
    },
  );
}
