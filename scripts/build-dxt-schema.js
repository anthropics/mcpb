import { DxtManifestSchema, DxtSignatureInfoSchema } from "../src/schemas.ts";
import * as z from "zod/v4";
import fs from "node:fs/promises";
import path from "node:path";

const schemasToWrite = {
  'dxt-manifest': DxtManifestSchema,
  'dxt-signature-info': DxtSignatureInfoSchema
}

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

