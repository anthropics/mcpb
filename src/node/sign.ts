import { execFile } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import forge from "node-forge";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import type { z } from "zod";

import type { McpbSignatureInfoSchema } from "../shared/common.js";

// Signature block markers
const SIGNATURE_HEADER = "MCPB_SIG_V1";
const SIGNATURE_FOOTER = "MCPB_SIG_END";

const execFileAsync = promisify(execFile);

/**
 * Signs a MCPB file with the given certificate and private key using PKCS#7
 *
 * @param mcpbPath Path to the MCPB file to sign
 * @param certPath Path to the certificate file (PEM format)
 * @param keyPath Path to the private key file (PEM format)
 * @param intermediates Optional array of intermediate certificate paths
 */
export function signMcpbFile(
  mcpbPath: string,
  certPath: string,
  keyPath: string,
  intermediates?: string[],
): void {
  // Read the original MCPB file
  const mcpbContent = readFileSync(mcpbPath);

  // Read certificate and key
  const certificatePem = readFileSync(certPath, "utf-8");
  const privateKeyPem = readFileSync(keyPath, "utf-8");

  // Read intermediate certificates if provided
  const intermediatePems = intermediates?.map((path) =>
    readFileSync(path, "utf-8"),
  );

  const initialSignature = createPkcs7Signature(
    mcpbContent,
    certificatePem,
    privateKeyPem,
    intermediatePems,
  );
  let signatureBlockLength = createSignatureBlock(initialSignature).length;

  for (let attempts = 0; attempts < 3; attempts++) {
    const updatedContent = updateEocdCommentLength(
      mcpbContent,
      signatureBlockLength,
    );
    const signature = createPkcs7Signature(
      updatedContent,
      certificatePem,
      privateKeyPem,
      intermediatePems,
    );
    const signatureBlock = createSignatureBlock(signature);

    if (signatureBlock.length !== signatureBlockLength) {
      signatureBlockLength = signatureBlock.length;
      continue;
    }

    // Append signature block to MCPB file
    const signedContent = Buffer.concat([updatedContent, signatureBlock]);
    writeFileSync(mcpbPath, signedContent);
    return;
  }

  throw new Error("Failed to stabilize MCPB signature block length");
}

/**
 * Verifies a signed MCPB file using OS certificate store
 *
 * @param mcpbPath Path to the signed MCPB file
 * @returns Signature information including verification status
 */
export async function verifyMcpbFile(
  mcpbPath: string,
): Promise<z.infer<typeof McpbSignatureInfoSchema>> {
  try {
    const fileContent = readFileSync(mcpbPath);

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

    const p7 = p7Message as forge.pkcs7.PkcsSignedData;

    // Extract certificates from PKCS#7
    const certificates = p7.certificates || [];
    if (certificates.length === 0) {
      return { status: "unsigned" };
    }

    // Get the signing certificate (first one)
    const signingCert = certificates[0];

    const signatureValid = await verifyPkcs7Signature(
      pkcs7Signature,
      originalContent,
    );
    if (!signatureValid) {
      return { status: "unsigned" };
    }

    // Convert forge certificate to PEM for OS verification
    const certPem = forge.pki.certificateToPem(signingCert);
    const intermediatePems = certificates
      .slice(1)
      .map((cert) => Buffer.from(forge.pki.certificateToPem(cert)));

    // Extract certificate info
    const isSelfSigned =
      signingCert.issuer.getField("CN")?.value ===
      signingCert.subject.getField("CN")?.value;

    if (!isSelfSigned) {
      // Verify certificate chain against OS trust store
      const chainValid = await verifyCertificateChain(
        Buffer.from(certPem),
        intermediatePems,
      );

      if (!chainValid) {
        // Signature is valid but certificate is not trusted
        return { status: "unsigned" };
      }
    }

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
    throw new Error(`Failed to verify MCPB file: ${error}`);
  }
}

function createPkcs7Signature(
  content: Buffer,
  certificatePem: string,
  privateKeyPem: string,
  intermediatePems?: string[],
): Buffer {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(content);

  const signingCert = forge.pki.certificateFromPem(certificatePem);
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

  p7.addCertificate(signingCert);

  if (intermediatePems) {
    for (const pem of intermediatePems) {
      p7.addCertificate(forge.pki.certificateFromPem(pem));
    }
  }

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

  p7.sign({ detached: true });

  const asn1 = forge.asn1.toDer(p7.toAsn1());
  return Buffer.from(asn1.getBytes(), "binary");
}

function updateEocdCommentLength(
  content: Buffer,
  signatureBlockLength: number,
): Buffer {
  const updatedContent = Buffer.from(content);
  const eocdOffset = findEocdOffset(updatedContent);
  if (eocdOffset === -1) {
    return updatedContent;
  }

  const currentCommentLength = updatedContent.readUInt16LE(eocdOffset + 20);
  const updatedCommentLength = currentCommentLength + signatureBlockLength;
  if (updatedCommentLength > 0xffff) {
    throw new Error("Signature block exceeds ZIP comment length limit");
  }

  updatedContent.writeUInt16LE(updatedCommentLength, eocdOffset + 20);
  return updatedContent;
}

async function verifyPkcs7Signature(
  pkcs7Signature: Buffer,
  originalContent: Buffer,
): Promise<boolean> {
  let tempDir: string | null = null;

  try {
    tempDir = await mkdtemp(join(tmpdir(), "mcpb-pkcs7-"));
    const signaturePath = join(tempDir, "signature.der");
    const contentPath = join(tempDir, "content.bin");
    const outputPath = join(tempDir, "verified-content.bin");

    await writeFile(signaturePath, pkcs7Signature);
    await writeFile(contentPath, originalContent);

    if (process.platform === "win32") {
      const psCommand = `
        $ErrorActionPreference = 'Stop'
        $content = [System.IO.File]::ReadAllBytes('${escapePowerShellString(contentPath)}')
        $signature = [System.IO.File]::ReadAllBytes('${escapePowerShellString(signaturePath)}')
        $contentInfo = New-Object System.Security.Cryptography.Pkcs.ContentInfo -ArgumentList @(,$content)
        $signedCms = New-Object System.Security.Cryptography.Pkcs.SignedCms -ArgumentList $contentInfo, $true
        $signedCms.Decode($signature)
        $signedCms.CheckSignature($true)
      `.trim();

      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        psCommand,
      ]);
    } else {
      await execFileAsync("openssl", [
        "cms",
        "-verify",
        "-inform",
        "DER",
        "-in",
        signaturePath,
        "-content",
        contentPath,
        "-noverify",
        "-binary",
        "-out",
        outputPath,
      ]);
    }
    return true;
  } catch {
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

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Finds the offset of the ZIP End of Central Directory record
 * by scanning backwards for the EOCD magic bytes (0x06054b50)
 */
function findEocdOffset(buffer: Buffer): number {
  // EOCD is at least 22 bytes, scan backwards from the end
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  return -1;
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
 * Extracts the signature block from a signed MCPB file
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
    tempDir = await mkdtemp(join(tmpdir(), "mcpb-verify-"));
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
 * Removes signature from a MCPB file
 */
export function unsignMcpbFile(mcpbPath: string): void {
  const fileContent = readFileSync(mcpbPath);
  const { originalContent } = extractSignatureBlock(fileContent);
  writeFileSync(mcpbPath, originalContent);
}
