import { MANIFEST_SCHEMAS } from "./constants.js";

export function getManifestVersionFromRawData(manifestData: unknown) {
  if (typeof manifestData !== "object" || !manifestData) {
    return null;
  }

  // manifest_version is authoritative when present. If it is present but
  // unsupported, do NOT silently fall back to the deprecated dxt_version — the
  // manifest has declared its version, so an unsupported value is a resolution
  // failure (null), not a reason to resolve via the deprecated field.
  if (
    "manifest_version" in manifestData &&
    typeof manifestData.manifest_version === "string"
  ) {
    return Object.keys(MANIFEST_SCHEMAS).includes(manifestData.manifest_version)
      ? (manifestData.manifest_version as keyof typeof MANIFEST_SCHEMAS)
      : null;
  }

  // Fall back to the deprecated dxt_version only when manifest_version is absent.
  if (
    "dxt_version" in manifestData &&
    typeof manifestData.dxt_version === "string" &&
    Object.keys(MANIFEST_SCHEMAS).includes(manifestData.dxt_version)
  ) {
    return manifestData.dxt_version as keyof typeof MANIFEST_SCHEMAS;
  }

  return null;
}
