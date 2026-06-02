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

  // Create PKCS#7 signed data
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(mcpbContent);

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

  // Update ZIP EOCD comment_length to include signature block
  // This ensures strict ZIP parsers accept the signed file
  const updatedContent = Buffer.from(mcpbContent);
  const eocdOffset = findEocdOffset(updatedContent);
  if (eocdOffset !== -1) {
    const currentCommentLength = updatedContent.readUInt16LE(eocdOffset + 20);
    updatedContent.writeUInt16LE(
      currentCommentLength + signatureBlock.length,
      eocdOffset + 20,
    );
  }

  // Append signature block to MCPB file
  const signedContent = Buffer.concat([updatedContent, signatureBlock]);
  writeFileSync(mcpbPath, signedContent);
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

    // node-forge's TS types omit `rawCapture`, which holds the parsed signer
    // fields we need for manual signature verification (see below).
    const p7 = p7Message as unknown as forge.pkcs7.PkcsSignedData & {
      rawCapture: {
        authenticatedAttributes?: forge.asn1.Asn1[];
        signature?: string;
      };
    };

    // Extract certificates from PKCS#7
    const certificates = p7.certificates || [];
    if (certificates.length === 0) {
      return { status: "unsigned" };
    }

    // Get the signing certificate (first one)
    const signingCert = certificates[0];

    // Manually verify the PKCS#7 detached signature.
    //
    // node-forge does not implement `PkcsSignedData.verify()` — it throws
    // "PKCS#7 signature verification not yet implemented" — so calling it would
    // make every signed file report as unsigned. Instead we verify the signer
    // ourselves: (1) the signed `messageDigest` attribute must equal SHA-256 of
    // the content, and (2) the signature must validate over the DER-encoded
    // authenticated attributes (re-tagged as a SET OF, as PKCS#7 requires).
    const { authenticatedAttributes, signature: signerSignature } =
      p7.rawCapture;
    if (!authenticatedAttributes || !signerSignature) {
      return { status: "unsigned" };
    }

    // (1) content digest must match the signed messageDigest attribute.
    let signedMessageDigest: string | null = null;
    for (const attr of authenticatedAttributes) {
      const attrSeq = attr.value as forge.asn1.Asn1[];
      const attrOid = forge.asn1.derToOid(attrSeq[0].value as string);
      if (attrOid === forge.pki.oids.messageDigest) {
        signedMessageDigest = (attrSeq[1].value as forge.asn1.Asn1[])[0]
          .value as string;
        break;
      }
    }
    if (signedMessageDigest === null) {
      return { status: "unsigned" };
    }

    // The signature covers the bytes before the signature block. Depending on
    // the version that produced the file, `signMcpbFile()` may have bumped the
    // ZIP EOCD comment_length by the signature-block length *after* signing
    // (added in #204) — so the stored bytes can differ from the signed bytes by
    // those two bytes. Accept a digest match against either the stored content
    // or the comment_length-reversed content.
    const sha256 = (buf: Buffer): string =>
      forge.md.sha256
        .create()
        .update(buf.toString("binary"))
        .digest()
        .getBytes();

    const candidates: Buffer[] = [originalContent];
    const eocdOffset = findEocdOffset(originalContent);
    if (eocdOffset !== -1) {
      const sigBlockLength = fileContent.length - originalContent.length;
      const patchedCommentLength = originalContent.readUInt16LE(
        eocdOffset + 20,
      );
      if (patchedCommentLength >= sigBlockLength) {
        const reversed = Buffer.from(originalContent);
        reversed.writeUInt16LE(
          patchedCommentLength - sigBlockLength,
          eocdOffset + 20,
        );
        candidates.push(reversed);
      }
    }

    const contentMatches = candidates.some(
      (buf) => sha256(buf) === signedMessageDigest,
    );
    if (!contentMatches) {
      return { status: "unsigned" };
    }

    // (2) signature must validate over the authenticated attributes
    const attrSet = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      authenticatedAttributes,
    );
    const attrMd = forge.md.sha256.create();
    attrMd.update(forge.asn1.toDer(attrSet).getBytes());

    let signatureValid = false;
    try {
      signatureValid = (
        signingCert.publicKey as forge.pki.rsa.PublicKey
      ).verify(attrMd.digest().getBytes(), signerSignature);
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      return { status: "unsigned" };
    }

    // The signature is cryptographically valid. Determine the trust level.
    const isSelfSigned =
      signingCert.issuer.getField("CN")?.value ===
      signingCert.subject.getField("CN")?.value;

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

    // A valid signature whose chain is neither OS-trusted nor self-signed is
    // reported as unsigned, since we cannot attest to the publisher identity.
    if (!chainValid && !isSelfSigned) {
      return { status: "unsigned" };
    }

    return {
      status: chainValid ? "signed" : "self-signed",
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
