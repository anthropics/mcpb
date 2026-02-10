import { MANIFEST_SCHEMAS } from "./constants.js";

export function getManifestVersionFromRawData(manifestData: unknown) {
  let manifestVersion: keyof typeof MANIFEST_SCHEMAS | null = null;
  if (
    typeof manifestData === "object" &&
    manifestData &&
    "manifest_version" in manifestData &&
    typeof manifestData.manifest_version === "string" &&
    Object.keys(MANIFEST_SCHEMAS).includes(manifestData.manifest_version)
  ) {
    manifestVersion =
      manifestData.manifest_version as keyof typeof MANIFEST_SCHEMAS;
  } else if (
    typeof manifestData === "object" &&
    manifestData &&
    "dxt_version" in manifestData &&
    typeof manifestData.dxt_version === "string" &&
    Object.keys(MANIFEST_SCHEMAS).includes(manifestData.dxt_version)
  ) {
    manifestVersion = manifestData.dxt_version as keyof typeof MANIFEST_SCHEMAS;
  }
  return manifestVersion;
}
