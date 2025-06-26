#!/usr/bin/env node

import fs from "fs";

try {
  // Read current package.json
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  // Get current version and strip any existing prerelease
  const baseVersion = packageJson.version.split("-")[0];

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

  // Update package.json version
  packageJson.version = devVersion;
  fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2) + "\n");
} catch (error) {
  console.error("Failed to publish:", error.message);
  process.exit(1);
}
