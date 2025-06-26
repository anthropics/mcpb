import { execFile } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import forge from "node-forge";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import type { DxtSignatureInfo } from "../types.js";

// Signature block markers
const SIGNATURE_HEADER = "DXT_SIG_V1";
const SIGNATURE_FOOTER = "DXT_SIG_END";

const execFileAsync = promisify(execFile);

/**
 * Signs a DXT file with the given certificate and private key using PKCS#7
 *
 * @param dxtPath Path to the DXT file to sign
 * @param certPath Path to the certificate file (PEM format)
 * @param keyPath Path to the private key file (PEM format)
 * @param intermediates Optional array of intermediate certificate paths
 */
export function signDxtFile(
  dxtPath: string,
  certPath: string,
  keyPath: string,
  intermediates?: string[],
): void {
  // Read the original DXT file
  const dxtContent = readFileSync(dxtPath);

  // Read certificate and key
  const certificatePem = readFileSync(certPath, "utf-8");
  const privateKeyPem = readFileSync(keyPath, "utf-8");

  // Read intermediate certificates if provided
  const intermediatePems = intermediates?.map((path) =>
    readFileSync(path, "utf-8"),
  );

  // Create PKCS#7 signed data
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(dxtContent);

  // Parse and add certificates
  const signingCert = forge.pki.certificateFromPem(certificatePem);
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

  p7.addCertificate(signingCert);

  // Add intermediate certificates
  if (intermediatePems) {
    for (const pem of intermediatePems) {
      p7.addCertificate(forge.pki.certificateFromPem(pem));
    }
  }

  // Add signer
  p7.addSigner({
    key: privateKey,
    certificate: signingCert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
        // Value will be auto-populated
      },
      {
        type: forge.pki.oids.signingTime,
        // Value will be auto-populated with current time
      },
    ],
  });

  // Sign with detached signature
  p7.sign({ detached: true });

  // Convert to DER format
  const asn1 = forge.asn1.toDer(p7.toAsn1());
  const pkcs7Signature = Buffer.from(asn1.getBytes(), "binary");

  // Create signature block with PKCS#7 data
  const signatureBlock = createSignatureBlock(pkcs7Signature);

  // Append signature block to DXT file
  const signedContent = Buffer.concat([dxtContent, signatureBlock]);
  writeFileSync(dxtPath, signedContent);
}

/**
 * Verifies a signed DXT file using OS certificate store
 *
 * @param dxtPath Path to the signed DXT file
 * @returns Signature information including verification status
 */
export async function verifyDxtFile(
  dxtPath: string,
): Promise<DxtSignatureInfo> {
  try {
    const fileContent = readFileSync(dxtPath);

    // Find and extract signature block
    const { originalContent, pkcs7Signature } =
      extractSignatureBlock(fileContent);
    if (!pkcs7Signature) {
      return { status: "unsigned" };
    }

    // Parse PKCS#7 signature
    const asn1 = forge.asn1.fromDer(pkcs7Signature.toString("binary"));
    const p7Message = forge.pkcs7.messageFromAsn1(asn1);

    // Verify it's signed data and cast to correct type
    if (
      !("type" in p7Message) ||
      p7Message.type !== forge.pki.oids.signedData
    ) {
      return { status: "unsigned" };
    }

    // Now we know it's PkcsSignedData. The types are incorrect, so we'll
    // fix them there
    const p7 = p7Message as unknown as forge.pkcs7.PkcsSignedData & {
      signerInfos: Array<{
        authenticatedAttributes: Array<{
          type: string;
          value: unknown;
        }>;
      }>;
      verify: (options?: { authenticatedAttributes?: boolean }) => boolean;
    };

    // Extract certificates from PKCS#7
    const certificates = p7.certificates || [];
    if (certificates.length === 0) {
      return { status: "unsigned" };
    }

    // Get the signing certificate (first one)
    const signingCert = certificates[0];

    // Verify PKCS#7 signature
    const contentBuf = forge.util.createBuffer(originalContent);

    try {
      p7.verify({ authenticatedAttributes: true });

      // Also verify the content matches
      const signerInfos = p7.signerInfos;
      const signerInfo = signerInfos?.[0];
      if (signerInfo) {
        const md = forge.md.sha256.create();
        md.update(contentBuf.getBytes());
        const digest = md.digest().getBytes();

        // Find the message digest attribute
        let messageDigest = null;
        for (const attr of signerInfo.authenticatedAttributes) {
          if (attr.type === forge.pki.oids.messageDigest) {
            messageDigest = attr.value;
            break;
          }
        }

        if (!messageDigest || messageDigest !== digest) {
          return { status: "unsigned" };
        }
      }
    } catch (error) {
      return { status: "unsigned" };
    }

    // Convert forge certificate to PEM for OS verification
    const certPem = forge.pki.certificateToPem(signingCert);
    const intermediatePems = certificates
      .slice(1)
      .map((cert) => Buffer.from(forge.pki.certificateToPem(cert)));

    // Verify certificate chain against OS trust store
    const chainValid = await verifyCertificateChain(
      Buffer.from(certPem),
      intermediatePems,
    );

    if (!chainValid) {
      // Signature is valid but certificate is not trusted
      return { status: "unsigned" };
    }

    // Extract certificate info
    const isSelfSigned =
      signingCert.issuer.getField("CN")?.value ===
      signingCert.subject.getField("CN")?.value;

    return {
      status: isSelfSigned ? "self-signed" : "signed",
      publisher: signingCert.subject.getField("CN")?.value || "Unknown",
      issuer: signingCert.issuer.getField("CN")?.value || "Unknown",
      valid_from: signingCert.validity.notBefore.toISOString(),
      valid_to: signingCert.validity.notAfter.toISOString(),
      fingerprint: forge.md.sha256
        .create()
        .update(
          forge.asn1.toDer(forge.pki.certificateToAsn1(signingCert)).getBytes(),
        )
        .digest()
        .toHex(),
    };
  } catch (error) {
    throw new Error(`Failed to verify DXT file: ${error}`);
  }
}

/**
 * Creates a signature block buffer with PKCS#7 signature
 */
function createSignatureBlock(pkcs7Signature: Buffer): Buffer {
  const parts: Buffer[] = [];

  // Header
  parts.push(Buffer.from(SIGNATURE_HEADER, "utf-8"));

  // PKCS#7 signature length and data
  const sigLengthBuffer = Buffer.alloc(4);
  sigLengthBuffer.writeUInt32LE(pkcs7Signature.length, 0);
  parts.push(sigLengthBuffer);
  parts.push(pkcs7Signature);

  // Footer
  parts.push(Buffer.from(SIGNATURE_FOOTER, "utf-8"));

  return Buffer.concat(parts);
}

/**
 * Extracts the signature block from a signed DXT file
 */
export function extractSignatureBlock(fileContent: Buffer): {
  originalContent: Buffer;
  pkcs7Signature?: Buffer;
} {
  // Look for signature footer at the end
  const footerBytes = Buffer.from(SIGNATURE_FOOTER, "utf-8");
  const footerIndex = fileContent.lastIndexOf(footerBytes);

  if (footerIndex === -1) {
    return { originalContent: fileContent };
  }

  // Look for signature header before footer
  const headerBytes = Buffer.from(SIGNATURE_HEADER, "utf-8");
  let headerIndex = -1;

  // Search backwards from footer
  for (let i = footerIndex - 1; i >= 0; i--) {
    if (fileContent.slice(i, i + headerBytes.length).equals(headerBytes)) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return { originalContent: fileContent };
  }

  // Extract original content (everything before signature block)
  const originalContent = fileContent.slice(0, headerIndex);

  // Parse signature block
  let offset = headerIndex + headerBytes.length;

  try {
    // Read PKCS#7 signature length
    const sigLength = fileContent.readUInt32LE(offset);
    offset += 4;

    // Read PKCS#7 signature
    const pkcs7Signature = fileContent.slice(offset, offset + sigLength);

    return {
      originalContent,
      pkcs7Signature,
    };
  } catch {
    return { originalContent: fileContent };
  }
}

/**
 * Verifies certificate chain against OS trust store
 */
export async function verifyCertificateChain(
  certificate: Buffer,
  intermediates?: Buffer[],
): Promise<boolean> {
  let tempDir: string | null = null;

  try {
    tempDir = await mkdtemp(join(tmpdir(), "dxt-verify-"));
    const certChainPath = join(tempDir, "chain.pem");
    const certChain = [certificate, ...(intermediates || [])].join("\n");
    await writeFile(certChainPath, certChain);

    // Platform-specific verification
    if (process.platform === "darwin") {
      try {
        await execFileAsync("security", [
          "verify-cert",
          "-c",
          certChainPath,
          "-p",
          "codeSign",
        ]);
        return true;
      } catch (error) {
        return false;
      }
    } else if (process.platform === "win32") {
      const psCommand = `
        $ErrorActionPreference = 'Stop'
        $certCollection = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
        $certCollection.Import('${certChainPath}')
        
        if ($certCollection.Count -eq 0) {
          Write-Error 'No certificates found'
          exit 1
        }
        
        $leafCert = $certCollection[0]
        $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
        
        # Enable revocation checking
        $chain.ChainPolicy.RevocationMode = 'Online'
        $chain.ChainPolicy.RevocationFlag = 'EntireChain'
        $chain.ChainPolicy.UrlRetrievalTimeout = New-TimeSpan -Seconds 30
        
        # Add code signing application policy
        $codeSignOid = New-Object System.Security.Cryptography.Oid '1.3.6.1.5.5.7.3.3'
        $chain.ChainPolicy.ApplicationPolicy.Add($codeSignOid)
        
        # Add intermediate certificates to extra store
        for ($i = 1; $i -lt $certCollection.Count; $i++) {
          [void]$chain.ChainPolicy.ExtraStore.Add($certCollection[$i])
        }
        
        # Build and validate chain
        $result = $chain.Build($leafCert)
        
        if ($result) { 
          'Valid' 
        } else { 
          $chain.ChainStatus | ForEach-Object { 
            Write-Error "$($_.Status): $($_.StatusInformation)"
          }
          exit 1 
        }
      `.trim();

      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        psCommand,
      ]);

      return stdout.includes("Valid");
    } else {
      // Linux: Use openssl
      try {
        await execFileAsync("openssl", [
          "verify",
          "-purpose",
          "codesigning",
          "-CApath",
          "/etc/ssl/certs",
          certChainPath,
        ]);
        return true;
      } catch (error) {
        return false;
      }
    }
  } catch (error) {
    return false;
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Removes signature from a DXT file
 */
export function unsignDxtFile(dxtPath: string): void {
  const fileContent = readFileSync(dxtPath);
  const { originalContent } = extractSignatureBlock(fileContent);
  writeFileSync(dxtPath, originalContent);
}
