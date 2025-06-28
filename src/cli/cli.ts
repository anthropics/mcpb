#!/usr/bin/env node

import { execSync } from "child_process";
import { Command } from "commander";
import { existsSync, readFileSync, statSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { signDxtFile, unsignDxtFile, verifyDxtFile } from "../node/sign.js";
import { validateManifest } from "../node/validate.js";
import { initExtension } from "./init.js";
import { packExtension } from "./pack.js";
import { unpackExtension } from "./unpack.js";

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get version from package.json
const packageJsonPath = join(__dirname, "..", "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = packageJson.version;

/**
 * Create a self-signed certificate for signing DXT extensions
 */
function createSelfSignedCertificate(certPath: string, keyPath: string): void {
  const subject = "/CN=DXT Self-Signed Certificate/O=DXT Extensions/C=US";

  try {
    // Generate a self-signed certificate valid for 10 years, no password
    execSync(
      `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "${subject}"`,
      { stdio: "pipe" },
    );
  } catch (error) {
    throw new Error(`Failed to create self-signed certificate: ${error}`);
  }
}

// Create the CLI program
const program = new Command();

program
  .name("dxt")
  .description("Tools for building Desktop Extensions")
  .version(version);

// Init command
program
  .command("init [directory]")
  .description("Create a new DXT extension manifest")
  .option("-y, --yes", "Accept all defaults (non-interactive mode)")
  .action((directory?: string, options?: { yes?: boolean }) => {
    void (async () => {
      try {
        const success = await initExtension(directory, options?.yes);
        process.exit(success ? 0 : 1);
      } catch (error) {
        console.error(
          `ERROR: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        process.exit(1);
      }
    })();
  });

// Validate command
program
  .command("validate <manifest>")
  .description("Validate a DXT manifest file")
  .action((manifestPath: string) => {
    const success = validateManifest(manifestPath);
    process.exit(success ? 0 : 1);
  });

// Pack command
program
  .command("pack [directory] [output]")
  .description("Pack a directory into a DXT extension")
  .action((directory: string = process.cwd(), output?: string) => {
    void (async () => {
      try {
        const success = await packExtension({
          extensionPath: directory,
          outputPath: output,
        });
        process.exit(success ? 0 : 1);
      } catch (error) {
        console.error(
          `ERROR: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        process.exit(1);
      }
    })();
  });

// Unpack command
program
  .command("unpack <dxt-file> [output]")
  .description("Unpack a DXT extension file")
  .action((dxtFile: string, output?: string) => {
    void (async () => {
      try {
        const success = await unpackExtension({
          dxtPath: dxtFile,
          outputDir: output,
        });
        process.exit(success ? 0 : 1);
      } catch (error) {
        console.error(
          `ERROR: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        process.exit(1);
      }
    })();
  });

// Sign command
program
  .command("sign <dxt-file>")
  .description("Sign a DXT extension file")
  .option(
    "-c, --cert <path>",
    "Path to certificate file (PEM format)",
    "cert.pem",
  )
  .option(
    "-k, --key <path>",
    "Path to private key file (PEM format)",
    "key.pem",
  )
  .option(
    "-i, --intermediate <paths...>",
    "Paths to intermediate certificate files",
  )
  .option("--self-signed", "Create a self-signed certificate if none exists")
  .action(
    (
      dxtFile: string,
      options: {
        cert: string;
        key: string;
        intermediate?: string[];
        selfSigned?: boolean;
      },
    ) => {
      void (async () => {
        try {
          const dxtPath = resolve(dxtFile);

          if (!existsSync(dxtPath)) {
            console.error(`ERROR: DXT file not found: ${dxtFile}`);
            process.exit(1);
          }

          let certPath = options.cert;
          let keyPath = options.key;

          // Create self-signed certificate if requested
          if (options.selfSigned) {
            const dxtDir = resolve(__dirname, "..");
            certPath = join(dxtDir, "self-signed-cert.pem");
            keyPath = join(dxtDir, "self-signed-key.pem");

            if (!existsSync(certPath) || !existsSync(keyPath)) {
              console.log("Creating self-signed certificate...");
              createSelfSignedCertificate(certPath, keyPath);
              console.log("Self-signed certificate created");
            } else {
              console.log("Using existing self-signed certificate");
            }
          } else {
            // Check for manual certificate paths
            if (!existsSync(certPath)) {
              console.error(`ERROR: Certificate file not found: ${certPath}`);
              console.log(
                "Tip: Use --self-signed to create a self-signed certificate",
              );
              process.exit(1);
            }

            if (!existsSync(keyPath)) {
              console.error(`ERROR: Private key file not found: ${keyPath}`);
              process.exit(1);
            }
          }

          console.log(`Signing ${basename(dxtPath)}...`);
          signDxtFile(dxtPath, certPath, keyPath, options.intermediate);
          console.log(`Successfully signed ${basename(dxtPath)}`);

          // Display certificate info
          const signatureInfo = await verifyDxtFile(dxtPath);
          if (
            signatureInfo.status === "signed" ||
            signatureInfo.status === "self-signed"
          ) {
            console.log(`Signed by: ${signatureInfo.publisher}`);
            console.log(`Issuer: ${signatureInfo.issuer}`);
            if (signatureInfo.status === "self-signed") {
              console.log(`Warning: Certificate is self-signed`);
            }
          }
        } catch (error) {
          console.log(
            `ERROR: Signing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          process.exit(1);
        }
      })();
    },
  );

// Verify command
program
  .command("verify <dxt-file>")
  .description("Verify the signature of a DXT extension file")
  .action((dxtFile: string) => {
    void (async () => {
      try {
        const dxtPath = resolve(dxtFile);

        if (!existsSync(dxtPath)) {
          console.error(`ERROR: DXT file not found: ${dxtFile}`);
          process.exit(1);
        }

        console.log(`Verifying ${basename(dxtPath)}...`);
        const result = await verifyDxtFile(dxtPath);

        if (result.status === "signed") {
          console.log(`Signature is valid`);
          console.log(`Signed by: ${result.publisher}`);
          console.log(`Issuer: ${result.issuer}`);
          console.log(
            `Valid from: ${new Date(result.valid_from!).toLocaleDateString()} to ${new Date(result.valid_to!).toLocaleDateString()}`,
          );
          console.log(`Fingerprint: ${result.fingerprint}`);
        } else if (result.status === "self-signed") {
          console.log(`Signature is valid (self-signed)`);
          console.log(`WARNING: This extension is self-signed`);
          console.log(`Signed by: ${result.publisher}`);
          console.log(
            `Valid from: ${new Date(result.valid_from!).toLocaleDateString()} to ${new Date(result.valid_to!).toLocaleDateString()}`,
          );
          console.log(`Fingerprint: ${result.fingerprint}`);
        } else {
          console.error(`ERROR: Extension is not signed`);
          process.exit(1);
        }
      } catch (error) {
        console.log(
          `ERROR: Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        process.exit(1);
      }
    })();
  });

// Info command
program
  .command("info <dxt-file>")
  .description("Display information about a DXT extension file")
  .action((dxtFile: string) => {
    void (async () => {
      try {
        const dxtPath = resolve(dxtFile);

        if (!existsSync(dxtPath)) {
          console.error(`ERROR: DXT file not found: ${dxtFile}`);
          process.exit(1);
        }

        const stat = statSync(dxtPath);
        console.log(`File: ${basename(dxtPath)}`);
        console.log(`Size: ${(stat.size / 1024).toFixed(2)} KB`);

        // Check if signed
        const signatureInfo = await verifyDxtFile(dxtPath);
        if (signatureInfo.status === "signed") {
          console.log(`\nSignature Information:`);
          console.log(`  Subject: ${signatureInfo.publisher}`);
          console.log(`  Issuer: ${signatureInfo.issuer}`);
          console.log(
            `  Valid from: ${new Date(signatureInfo.valid_from!).toLocaleDateString()} to ${new Date(signatureInfo.valid_to!).toLocaleDateString()}`,
          );
          console.log(`  Fingerprint: ${signatureInfo.fingerprint}`);
          console.log(`  Status: Valid`);
        } else if (signatureInfo.status === "self-signed") {
          console.log(`\nSignature Information:`);
          console.log(`  Subject: ${signatureInfo.publisher}`);
          console.log(`  Issuer: ${signatureInfo.issuer} (self-signed)`);
          console.log(
            `  Valid from: ${new Date(signatureInfo.valid_from!).toLocaleDateString()} to ${new Date(signatureInfo.valid_to!).toLocaleDateString()}`,
          );
          console.log(`  Fingerprint: ${signatureInfo.fingerprint}`);
          console.log(`  Status: Valid (self-signed)`);
        } else {
          console.log(`\nWARNING: Not signed`);
        }
      } catch (error) {
        console.log(
          `ERROR: Failed to read DXT info: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        process.exit(1);
      }
    })();
  });

// Unsign command (for development/testing)
program
  .command("unsign <dxt-file>")
  .description("Remove signature from a DXT extension file")
  .action((dxtFile: string) => {
    try {
      const dxtPath = resolve(dxtFile);

      if (!existsSync(dxtPath)) {
        console.error(`ERROR: DXT file not found: ${dxtFile}`);
        process.exit(1);
      }

      console.log(`Removing signature from ${basename(dxtPath)}...`);
      unsignDxtFile(dxtPath);
      console.log(`Signature removed`);
    } catch (error) {
      console.log(
        `ERROR: Failed to remove signature: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
