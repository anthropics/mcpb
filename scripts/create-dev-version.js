#!/usr/bin/env node

import fs from "fs";

const packagePaths = [
  "packages/cli/package.json",
  "packages/schemas/package.json",
];

try {
  const packageJsons = packagePaths.map((packagePath) => {
    return {
      path: packagePath,
      data: JSON.parse(fs.readFileSync(packagePath, "utf8")),
    };
  });

  // Get current version and strip any existing prerelease
  const baseVersion = packageJsons[0].data.version.split("-")[0];

  // Generate timestamp (YYYYMMDDHHMMSS)
  const now = new Date();
  const timestamp =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0") +
    now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0") +
    now.getSeconds().toString().padStart(2, "0");

  // Create dev version
  const devVersion = `${baseVersion}-dev.${timestamp}`;

  console.log(`Publishing ${devVersion}...`);

  for (const packageJson of packageJsons) {
    packageJson.data.version = devVersion;
    fs.writeFileSync(
      packageJson.path,
      JSON.stringify(packageJson.data, null, 2) + "\n",
    );
  }
} catch (error) {
  console.error("Failed to publish:", error.message);
  process.exit(1);
}
