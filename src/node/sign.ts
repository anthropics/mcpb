import { execFile } from "child_process";
import { createHash, createVerify } from "crypto";
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

  // Append signature block to MCPB file
  const signedContent = Buffer.concat([mcpbContent, signatureBlock]);
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

    // Parse PKCS#7 signature to extract certificate info
    const asn1 = forge.asn1.fromDer(pkcs7Signature.toString("binary"));
    const p7Message = forge.pkcs7.messageFromAsn1(asn1);

    // Verify it's signed data
    if (
      !("type" in p7Message) ||
      p7Message.type !== forge.pki.oids.signedData
    ) {
      return { status: "unsigned" };
    }

    const p7 = p7Message as unknown as forge.pkcs7.PkcsSignedData;

    // Extract certificates from PKCS#7
    const certificates = p7.certificates || [];
    if (certificates.length === 0) {
      return { status: "unsigned" };
    }

    // Get the signing certificate (first one)
    const signingCert = certificates[0];

    // Verify the PKCS#7 detached signature cryptographically
    // (node-forge's p7.verify() is not implemented, so we use Node.js crypto)
    const signatureValid = verifyPkcs7DetachedSignature(
      originalContent,
      pkcs7Signature,
    );

    if (!signatureValid) {
      return { status: "unsigned" };
    }

    // Check if self-signed
    const isSelfSigned =
      signingCert.issuer.getField("CN")?.value ===
      signingCert.subject.getField("CN")?.value;

    // Build certificate info
    const certInfo = {
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

    if (isSelfSigned) {
      // Self-signed certs can never pass chain verification, so report
      // their status directly
      return { status: "self-signed", ...certInfo };
    }

    // For CA-signed certs, verify certificate chain against OS trust store
    const certPem = forge.pki.certificateToPem(signingCert);
    const intermediatePems = certificates
      .slice(1)
      .map((cert) => Buffer.from(forge.pki.certificateToPem(cert)));

    const chainValid = await verifyCertificateChain(
      Buffer.from(certPem),
      intermediatePems,
    );

    if (!chainValid) {
      return { status: "unsigned" };
    }

    return { status: "signed", ...certInfo };
  } catch (error) {
    throw new Error(`Failed to verify MCPB file: ${error}`);
  }
}

/**
 * Verifies a detached PKCS#7 signature over the given content.
 *
 * node-forge does not implement PKCS#7 signature verification
 * (see https://github.com/digitalbazaar/forge/issues/1088), so we parse the
 * ASN.1 structure with node-forge and verify the RSA signature using Node.js
 * built-in crypto.
 *
 * The verification follows RFC 5652 (CMS) Section 5.4:
 * 1. Compute hash of original content, compare with messageDigest attribute
 * 2. DER-encode the authenticated attributes as a SET (re-tagged from [0])
 * 3. Verify the RSA signature over the DER-encoded attributes
 */
function verifyPkcs7DetachedSignature(
  content: Buffer,
  pkcs7Der: Buffer,
): boolean {
  try {
    // Parse the raw ASN.1 to navigate the PKCS#7 structure
    const contentInfoAsn1 = forge.asn1.fromDer(pkcs7Der.toString("binary"));

    // ContentInfo: SEQUENCE { contentType OID, [0] EXPLICIT content }
    const contentInfoValues = contentInfoAsn1.value as forge.asn1.Asn1[];
    const signedDataAsn1 = (contentInfoValues[1].value as forge.asn1.Asn1[])[0];

    // SignedData: SEQUENCE {
    //   version INTEGER,
    //   digestAlgorithms SET,
    //   encapContentInfo SEQUENCE,
    //   [0] IMPLICIT certificates (optional),
    //   [1] IMPLICIT crls (optional),
    //   signerInfos SET
    // }
    const signedDataValues = signedDataAsn1.value as forge.asn1.Asn1[];

    // Collect certificates [0] and all SET children
    let certsAsn1: forge.asn1.Asn1[] = [];
    const sets: forge.asn1.Asn1[] = [];

    for (const child of signedDataValues) {
      // Context-specific [0] constructed = certificates
      if (
        child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
        child.constructed &&
        child.type === 0
      ) {
        certsAsn1 = child.value as forge.asn1.Asn1[];
      }
      // Universal SET = digestAlgorithms or signerInfos
      if (
        child.tagClass === forge.asn1.Class.UNIVERSAL &&
        child.type === forge.asn1.Type.SET &&
        child.constructed
      ) {
        sets.push(child);
      }
    }

    // The last SET in SignedData is signerInfos (first SET is digestAlgorithms)
    if (sets.length < 2 || certsAsn1.length === 0) {
      return false;
    }

    const signerInfosAsn1 = sets[sets.length - 1];
    const signerInfosList = signerInfosAsn1.value as forge.asn1.Asn1[];
    if (signerInfosList.length === 0) {
      return false;
    }

    // First SignerInfo SEQUENCE
    const signerInfoAsn1 = signerInfosList[0];
    const signerInfoChildren = signerInfoAsn1.value as forge.asn1.Asn1[];

    // Find authenticated attributes [0] and encryptedDigest (OCTET STRING)
    let authAttrsNode: forge.asn1.Asn1 | null = null;
    let encryptedDigestNode: forge.asn1.Asn1 | null = null;

    for (const child of signerInfoChildren) {
      // Context-specific [0] constructed = authenticatedAttributes
      if (
        child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
        child.type === 0 &&
        child.constructed
      ) {
        authAttrsNode = child;
      }
      // OCTET STRING (primitive) = encryptedDigest (the RSA signature)
      if (
        child.tagClass === forge.asn1.Class.UNIVERSAL &&
        child.type === forge.asn1.Type.OCTETSTRING &&
        !child.constructed
      ) {
        encryptedDigestNode = child;
      }
    }

    if (!authAttrsNode || !encryptedDigestNode) {
      return false;
    }

    // Step 1: Verify message digest attribute matches content hash
    const contentHash = createHash("sha256").update(content).digest();

    const authAttrs = authAttrsNode.value as forge.asn1.Asn1[];
    let messageDigest: Buffer | null = null;

    for (const attr of authAttrs) {
      const attrSeq = attr.value as forge.asn1.Asn1[];
      const oid = forge.asn1.derToOid(attrSeq[0].value as string);
      if (oid === forge.pki.oids.messageDigest) {
        // Attribute value: SET { OCTET STRING }
        const valueSet = attrSeq[1].value as forge.asn1.Asn1[];
        messageDigest = Buffer.from(valueSet[0].value as string, "binary");
        break;
      }
    }

    if (!messageDigest || !contentHash.equals(messageDigest)) {
      return false;
    }

    // Step 2: Verify the RSA signature over the authenticated attributes
    // Per RFC 5652 Section 5.4, the signature is computed over the
    // DER-encoded authenticated attributes with EXPLICIT SET tag (0x31),
    // not the IMPLICIT [0] tag (0xA0) used in the SignerInfo encoding.
    const authAttrsDer = Buffer.from(
      forge.asn1.toDer(authAttrsNode).getBytes(),
      "binary",
    );
    // Re-tag from CONTEXT_SPECIFIC [0] (0xA0) to SET (0x31)
    authAttrsDer[0] = 0x31;

    // Get the signature bytes
    const signatureBytes = Buffer.from(
      encryptedDigestNode.value as string,
      "binary",
    );

    // Get the signing certificate's public key as PEM
    const signingCertForge = forge.pki.certificateFromAsn1(certsAsn1[0]);
    const certPem = forge.pki.certificateToPem(signingCertForge);

    // Verify using Node.js built-in crypto
    const verifier = createVerify("SHA256");
    verifier.update(authAttrsDer);
    return verifier.verify(certPem, signatureBytes);
  } catch {
    return false;
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
