import { getManifestVersionFromRawData } from "../src/shared/manifestVersionResolve";

describe("getManifestVersionFromRawData", () => {
  it("resolves a supported manifest_version", () => {
    expect(getManifestVersionFromRawData({ manifest_version: "0.3" })).toBe(
      "0.3",
    );
  });

  it("falls back to dxt_version when manifest_version is absent", () => {
    expect(getManifestVersionFromRawData({ dxt_version: "0.3" })).toBe("0.3");
  });

  it("does not fall back to dxt_version when manifest_version is present but unsupported", () => {
    // manifest_version is authoritative; an unsupported value must not silently
    // resolve via the deprecated dxt_version field.
    expect(
      getManifestVersionFromRawData({
        manifest_version: "99.0",
        dxt_version: "0.3",
      }),
    ).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(getManifestVersionFromRawData(null)).toBeNull();
    expect(getManifestVersionFromRawData("0.3")).toBeNull();
  });
});
