import { DxtManifestSchema } from "../src/schemas.ts";
import * as z from "zod/v4";
import fs from "node:fs/promises";
import path from "node:path";

const schema = z.toJSONSchema(DxtManifestSchema);
await fs.mkdir(path.join(import.meta.dirname, "../dist"), { recursive: true });
await fs.writeFile(
  path.join(import.meta.dirname, "../dist", "dxt-manifest.schema.json"),
  JSON.stringify(schema, null, 2),
  {
    encoding: "utf8",
  },
);
