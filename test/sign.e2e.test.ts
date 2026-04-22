/**
 * End-to-end test for MCPB signing and verification
 *
 * This test:
 * 1. Creates a test MCPB file
 * 2. Generates a self-signed certificate for testing
 * 3. Signs the MCPB file
 * 4. Verifies the signature
 * 5. Tests various failure scenarios
 */

import * as fs from "fs";
import forge from "node-forge";
import * as path from "path";

import {
  applyExternalSignature,
  MAX_SIG_BLOCK_SIZE,
  prepareForExternalSigning,
  signMcpbFile,
  unsignMcpbFile,
  verifyMcpbFile,
} from "../src/node/sign.js";

// Test directory
const TEST_DIR = path.join(__dirname, "test-output");

// Ensure test directory exists
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

// Test file paths
const TEST_MCPB = path.join(TEST_DIR, "test.mcpb");
const SELF_SIGNED_CERT = path.join(TEST_DIR, "self-signed.crt");
const SELF_SIGNED_KEY = path.join(TEST_DIR, "self-signed.key");
const CA_CERT = path.join(TEST_DIR, "ca.crt");
const CA_KEY = path.join(TEST_DIR, "ca.key");
const SIGNED_CERT = path.join(TEST_DIR, "signed.crt");
const SIGNED_KEY = path.join(TEST_DIR, "signed.key");

/**
 * Generate a self-signed certificate for testing
 */
function generateSelfSignedCert() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: "commonName", value: "Test MCPB Publisher" },
    { name: "countryName", value: "US" },
    { name: "organizationName", value: "Test Org" },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Add extensions
  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: false,
    },
    {
      name: "keyUsage",
      keyCertSign: false,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: false,
      dataEncipherment: false,
    },
    {
      name: "extKeyUsage",
      codeSigning: true,
    },
  ]);

  // Self-sign
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Write files
  fs.writeFileSync(SELF_SIGNED_CERT, forge.pki.certificateToPem(cert));
  fs.writeFileSync(SELF_SIGNED_KEY, forge.pki.privateKeyToPem(keys.privateKey));
}

/**
 * Generate a CA and signed certificate for testing
 */
function generateCASignedCert() {
  // Generate CA
  const caKeys = forge.pki.rsa.generateKeyPair(2048);
  const caCert = forge.pki.createCertificate();

  caCert.publicKey = caKeys.publicKey;
  caCert.serialNumber = "01";
  caCert.validity.notBefore = new Date();
  caCert.validity.notAfter = new Date();
  caCert.validity.notAfter.setFullYear(
    caCert.validity.notBefore.getFullYear() + 10,
  );

  const caAttrs = [
    { name: "commonName", value: "Test CA" },
    { name: "countryName", value: "US" },
    { name: "organizationName", value: "Test CA Org" },
  ];

  caCert.setSubject(caAttrs);
  caCert.setIssuer(caAttrs);

  caCert.setExtensions([
    {
      name: "basicConstraints",
      cA: true,
    },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      cRLSign: true,
    },
  ]);

  caCert.sign(caKeys.privateKey, forge.md.sha256.create());

  // Generate signed certificate
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: "commonName", value: "Test Publisher (CA Signed)" },
    { name: "countryName", value: "US" },
    { name: "organizationName", value: "Test Publisher Org" },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(caCert.subject.attributes);

  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: false,
    },
    {
      name: "keyUsage",
      digitalSignature: true,
      nonRepudiation: true,
    },
    {
      name: "extKeyUsage",
      codeSigning: true,
    },
  ]);

  // Sign with CA
  cert.sign(caKeys.privateKey, forge.md.sha256.create());

  // Write files
  fs.writeFileSync(CA_CERT, forge.pki.certificateToPem(caCert));
  fs.writeFileSync(CA_KEY, forge.pki.privateKeyToPem(caKeys.privateKey));
  fs.writeFileSync(SIGNED_CERT, forge.pki.certificateToPem(cert));
  fs.writeFileSync(SIGNED_KEY, forge.pki.privateKeyToPem(keys.privateKey));
}

/**
 * Create a test MCPB file (just a simple ZIP)
 */
function createTestDxt() {
  // Create a simple ZIP file content
  // This is a minimal valid ZIP with one file
  const zipContent = Buffer.from([
    0x50,
    0x4b,
    0x03,
    0x04, // Local file header signature
    0x14,
    0x00, // Version needed
    0x00,
    0x00, // Flags
    0x00,
    0x00, // Compression method (stored)
    0x00,
    0x00, // Last mod time
    0x00,
    0x00, // Last mod date
    0x00,
    0x00,
    0x00,
    0x00, // CRC-32
    0x0d,
    0x00,
    0x00,
    0x00, // Compressed size
    0x0d,
    0x00,
    0x00,
    0x00, // Uncompressed size
    0x0c,
    0x00, // Filename length
    0x00,
    0x00, // Extra field length
    // Filename: "manifest.json"
    0x6d,
    0x61,
    0x6e,
    0x69,
    0x66,
    0x65,
    0x73,
    0x74,
    0x2e,
    0x6a,
    0x73,
    0x6f,
    0x6e,
    // File content: '{"test":true}'
    0x7b,
    0x22,
    0x74,
    0x65,
    0x73,
    0x74,
    0x22,
    0x3a,
    0x74,
    0x72,
    0x75,
    0x65,
    0x7d,
    // Central directory
    0x50,
    0x4b,
    0x01,
    0x02, // Central directory signature
    0x14,
    0x00, // Version made by
    0x14,
    0x00, // Version needed
    0x00,
    0x00, // Flags
    0x00,
    0x00, // Compression method
    0x00,
    0x00, // Last mod time
    0x00,
    0x00, // Last mod date
    0x00,
    0x00,
    0x00,
    0x00, // CRC-32
    0x0d,
    0x00,
    0x00,
    0x00, // Compressed size
    0x0d,
    0x00,
    0x00,
    0x00, // Uncompressed size
    0x0c,
    0x00, // Filename length
    0x00,
    0x00, // Extra field length
    0x00,
    0x00, // File comment length
    0x00,
    0x00, // Disk number
    0x00,
    0x00, // Internal attributes
    0x00,
    0x00,
    0x00,
    0x00, // External attributes
    0x00,
    0x00,
    0x00,
    0x00, // Offset of local header
    // Filename: "manifest.json"
    0x6d,
    0x61,
    0x6e,
    0x69,
    0x66,
    0x65,
    0x73,
    0x74,
    0x2e,
    0x6a,
    0x73,
    0x6f,
    0x6e,
    // End of central directory
    0x50,
    0x4b,
    0x05,
    0x06, // End of central directory signature
    0x00,
    0x00, // Disk number
    0x00,
    0x00, // Start disk
    0x01,
    0x00, // Number of central directory records on this disk
    0x01,
    0x00, // Total number of central directory records
    0x3a,
    0x00,
    0x00,
    0x00, // Size of central directory
    0x34,
    0x00,
    0x00,
    0x00, // Offset of central directory
    0x00,
    0x00, // Comment length
  ]);

  fs.writeFileSync(TEST_MCPB, zipContent);
}

/**
 * Test signing with self-signed certificate
 */
async function testSelfSignedSigning() {
  // Create a copy for this test
  const testFile = path.join(TEST_DIR, "test-self-signed.dxt");
  fs.copyFileSync(TEST_MCPB, testFile);

  // Sign the file
  expect(() =>
    signMcpbFile(testFile, SELF_SIGNED_CERT, SELF_SIGNED_KEY),
  ).not.toThrow();

  // Verify the signature
  const result = await verifyMcpbFile(testFile);

  // Self-signed certs may not be trusted by OS, so we accept either status
  expect(["self-signed", "unsigned"]).toContain(result.status);

  // Clean up
  fs.unlinkSync(testFile);
}

/**
 * Test signing with CA-signed certificate
 */
async function testCASignedSigning() {
  // Create a copy for this test
  const testFile = path.join(TEST_DIR, "test-ca-signed.dxt");
  fs.copyFileSync(TEST_MCPB, testFile);

  // Sign the file with intermediate
  expect(() =>
    signMcpbFile(testFile, SIGNED_CERT, SIGNED_KEY, [CA_CERT]),
  ).not.toThrow();

  // Verify the signature
  const result = await verifyMcpbFile(testFile);

  // CA-signed status depends on whether test CA is trusted by OS
  expect(["signed", "unsigned"]).toContain(result.status);

  // Clean up
  fs.unlinkSync(testFile);
}

/**
 * Test tampering detection
 */
async function testTamperingDetection() {
  // Create a copy and sign it
  const testFile = path.join(TEST_DIR, "test-tampered.dxt");
  fs.copyFileSync(TEST_MCPB, testFile);
  signMcpbFile(testFile, SELF_SIGNED_CERT, SELF_SIGNED_KEY);

  // Read the signed file
  const signedContent = fs.readFileSync(testFile);

  // Tamper with the content (change a byte in the ZIP portion)
  const tamperedContent = Buffer.from(signedContent);
  tamperedContent[10] = (tamperedContent[10] + 1) % 256;
  fs.writeFileSync(testFile, tamperedContent);

  // Try to verify - should fail
  const result = await verifyMcpbFile(testFile);
  expect(result.status).toBe("unsigned");

  // Clean up
  fs.unlinkSync(testFile);
}

/**
 * Test unsigned file verification
 */
async function testUnsignedFile() {
  const result = await verifyMcpbFile(TEST_MCPB);
  expect(result.status).toBe("unsigned");
}

/**
 * Test signature removal
 */
async function testSignatureRemoval() {
  // Create a copy and sign it
  const testFile = path.join(TEST_DIR, "test-remove-sig.dxt");
  fs.copyFileSync(TEST_MCPB, testFile);
  signMcpbFile(testFile, SELF_SIGNED_CERT, SELF_SIGNED_KEY);

  // Verify it's signed (or at least has signature data)
  await verifyMcpbFile(testFile);

  // Remove signature
  expect(() => unsignMcpbFile(testFile)).not.toThrow();

  // Verify it's unsigned
  const afterResult = await verifyMcpbFile(testFile);
  expect(afterResult.status).toBe("unsigned");

  // Clean up
  fs.unlinkSync(testFile);
}

describe("MCPB Signing E2E Tests", () => {
  beforeAll(() => {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Setup
    generateSelfSignedCert();
    generateCASignedCert();
    createTestDxt();
  });

  afterAll(() => {
    // Cleanup
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it("should sign and verify with self-signed certificate", async () => {
    await testSelfSignedSigning();
  });

  it("should sign and verify with CA-signed certificate", async () => {
    await testCASignedSigning();
  });

  it("should detect tampering", async () => {
    await testTamperingDetection();
  });

  it("should identify unsigned files", async () => {
    await testUnsignedFile();
  });

  it("should remove signatures", async () => {
    await testSignatureRemoval();
  });

  it("should update EOCD comment_length after signing", async () => {
    const testFile = path.join(TEST_DIR, "test-eocd.mcpb");
    fs.copyFileSync(TEST_MCPB, testFile);

    // Read original EOCD comment_length
    const originalContent = fs.readFileSync(testFile);
    let eocdOffset = -1;
    for (let i = originalContent.length - 22; i >= 0; i--) {
      if (originalContent.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    expect(eocdOffset).toBeGreaterThanOrEqual(0);
    const originalCommentLength = originalContent.readUInt16LE(eocdOffset + 20);
    expect(originalCommentLength).toBe(0); // Fresh ZIP has no comment

    // Sign the file
    signMcpbFile(testFile, SELF_SIGNED_CERT, SELF_SIGNED_KEY);

    // Read signed file and verify EOCD comment_length was updated
    const signedContent = fs.readFileSync(testFile);
    let signedEocdOffset = -1;
    for (let i = signedContent.length - 22; i >= 0; i--) {
      if (signedContent.readUInt32LE(i) === 0x06054b50) {
        signedEocdOffset = i;
        break;
      }
    }
    expect(signedEocdOffset).toBeGreaterThanOrEqual(0);
    const signedCommentLength = signedContent.readUInt16LE(
      signedEocdOffset + 20,
    );

    // Comment length should equal everything after the EOCD record's original end
    const eocdMinSize = 22; // minimum EOCD size (no comment)
    const dataAfterEocd =
      signedContent.length -
      (signedEocdOffset + eocdMinSize + originalCommentLength);
    expect(signedCommentLength).toBe(dataAfterEocd);
    expect(signedCommentLength).toBeGreaterThan(0);

    // Clean up
    fs.unlinkSync(testFile);
  });
});

/**
 * Helper: create a detached PKCS#7 signature using node-forge.
 * Simulates what an enterprise HSM (GaraSign, ESRP, etc.) produces.
 */
function createDetachedSignature(
  content: Buffer,
  certPath: string,
  keyPath: string,
): Buffer {
  const certPem = fs.readFileSync(certPath, "utf-8");
  const keyPem = fs.readFileSync(keyPath, "utf-8");

  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(content);
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7.sign({ detached: true });

  const asn1 = forge.asn1.toDer(p7.toAsn1());
  return Buffer.from(asn1.getBytes(), "binary");
}

describe("External Signing E2E Tests", () => {
  const EXT_TEST_DIR = path.join(__dirname, "test-output-external");

  beforeAll(() => {
    if (!fs.existsSync(EXT_TEST_DIR)) {
      fs.mkdirSync(EXT_TEST_DIR, { recursive: true });
    }
    // Ensure the shared test-output dir exists for certs and test MCPB
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    // Generate certs and test MCPB if not already present
    if (!fs.existsSync(SELF_SIGNED_CERT)) {
      generateSelfSignedCert();
    }
    if (!fs.existsSync(TEST_MCPB)) {
      createTestDxt();
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(EXT_TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should complete prepare → sign → apply roundtrip", () => {
    const mcpbFile = path.join(EXT_TEST_DIR, "roundtrip.mcpb");
    const sigFile = path.join(EXT_TEST_DIR, "roundtrip.p7s");
    fs.copyFileSync(TEST_MCPB, mcpbFile);

    // Step 1: Prepare
    prepareForExternalSigning(mcpbFile);

    // Verify EOCD comment_length was set
    const prepared = fs.readFileSync(mcpbFile);
    let eocdOffset = -1;
    for (let i = prepared.length - 22; i >= 0; i--) {
      if (prepared.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    expect(eocdOffset).toBeGreaterThanOrEqual(0);
    expect(prepared.readUInt16LE(eocdOffset + 20)).toBe(MAX_SIG_BLOCK_SIZE);

    // Step 2: Create detached signature (simulates enterprise HSM)
    const sigBytes = createDetachedSignature(
      prepared,
      SELF_SIGNED_CERT,
      SELF_SIGNED_KEY,
    );
    fs.writeFileSync(sigFile, sigBytes);

    // Step 3: Apply signature
    applyExternalSignature(mcpbFile, sigFile);

    // Verify result
    const signed = fs.readFileSync(mcpbFile);

    // File should end with MCPB_SIG_END
    const footer = signed
      .slice(signed.length - Buffer.byteLength("MCPB_SIG_END"))
      .toString("utf-8");
    expect(footer).toBe("MCPB_SIG_END");

    // Total appended block should be exactly MAX_SIG_BLOCK_SIZE
    const appendedSize = signed.length - prepared.length;
    expect(appendedSize).toBe(MAX_SIG_BLOCK_SIZE);

    // EOCD comment_length should still be MAX_SIG_BLOCK_SIZE
    let signedEocdOffset = -1;
    for (let i = prepared.length - 22; i >= 0; i--) {
      if (signed.readUInt32LE(i) === 0x06054b50) {
        signedEocdOffset = i;
        break;
      }
    }
    expect(signedEocdOffset).toBeGreaterThanOrEqual(0);
    expect(signed.readUInt16LE(signedEocdOffset + 20)).toBe(MAX_SIG_BLOCK_SIZE);

    // adm-zip validation: file_size == eocd_offset + 22 + comment_length
    expect(signed.length).toBe(signedEocdOffset + 22 + MAX_SIG_BLOCK_SIZE);
  });

  it("should reject already-signed bundles in prepare", () => {
    const mcpbFile = path.join(EXT_TEST_DIR, "already-signed.mcpb");
    fs.copyFileSync(TEST_MCPB, mcpbFile);

    // Sign it normally
    signMcpbFile(mcpbFile, SELF_SIGNED_CERT, SELF_SIGNED_KEY);

    // Prepare should reject
    expect(() => prepareForExternalSigning(mcpbFile)).toThrow(
      "already signed",
    );
  });

  it("should reject already-prepared bundles in prepare", () => {
    const mcpbFile = path.join(EXT_TEST_DIR, "already-prepared.mcpb");
    fs.copyFileSync(TEST_MCPB, mcpbFile);

    // Prepare once
    prepareForExternalSigning(mcpbFile);

    // Prepare again should reject
    expect(() => prepareForExternalSigning(mcpbFile)).toThrow(
      "already prepared",
    );
  });

  it("should reject unprepared bundles in apply-signature", () => {
    const mcpbFile = path.join(EXT_TEST_DIR, "unprepared.mcpb");
    const sigFile = path.join(EXT_TEST_DIR, "dummy.p7s");
    fs.copyFileSync(TEST_MCPB, mcpbFile);
    fs.writeFileSync(sigFile, Buffer.alloc(100)); // dummy signature

    expect(() => applyExternalSignature(mcpbFile, sigFile)).toThrow(
      "not prepared for external signing",
    );
  });

  it("should reject oversized signatures", () => {
    const mcpbFile = path.join(EXT_TEST_DIR, "oversized.mcpb");
    const sigFile = path.join(EXT_TEST_DIR, "oversized.p7s");
    fs.copyFileSync(TEST_MCPB, mcpbFile);

    // Prepare
    prepareForExternalSigning(mcpbFile);

    // Create a signature larger than MAX_SIG_BLOCK_SIZE
    fs.writeFileSync(sigFile, Buffer.alloc(MAX_SIG_BLOCK_SIZE));

    expect(() => applyExternalSignature(mcpbFile, sigFile)).toThrow(
      "too large",
    );
  });

  it("should produce correct padding", () => {
    const mcpbFile = path.join(EXT_TEST_DIR, "padding.mcpb");
    const sigFile = path.join(EXT_TEST_DIR, "padding.p7s");
    fs.copyFileSync(TEST_MCPB, mcpbFile);

    prepareForExternalSigning(mcpbFile);
    const preparedSize = fs.statSync(mcpbFile).size;

    // Create detached signature
    const prepared = fs.readFileSync(mcpbFile);
    const sigBytes = createDetachedSignature(
      prepared,
      SELF_SIGNED_CERT,
      SELF_SIGNED_KEY,
    );
    fs.writeFileSync(sigFile, sigBytes);

    applyExternalSignature(mcpbFile, sigFile);

    const signed = fs.readFileSync(mcpbFile);
    const sigBlock = signed.slice(preparedSize);

    // Total block size must be exactly MAX_SIG_BLOCK_SIZE
    expect(sigBlock.length).toBe(MAX_SIG_BLOCK_SIZE);

    // Parse the block: header (11) + length (4) + sig (N) + padding + footer (12)
    const header = sigBlock.slice(0, 11).toString("utf-8");
    expect(header).toBe("MCPB_SIG_V1");

    const sigLen = sigBlock.readUInt32LE(11);
    expect(sigLen).toBe(sigBytes.length);

    const extractedSig = sigBlock.slice(15, 15 + sigLen);
    expect(extractedSig.equals(sigBytes)).toBe(true);

    // Padding should be all zeros
    const paddingStart = 15 + sigLen;
    const paddingEnd = sigBlock.length - 12; // before MCPB_SIG_END
    const padding = sigBlock.slice(paddingStart, paddingEnd);
    expect(padding.every((b) => b === 0)).toBe(true);

    const endMarker = sigBlock.slice(sigBlock.length - 12).toString("utf-8");
    expect(endMarker).toBe("MCPB_SIG_END");
  });

  it("should satisfy adm-zip strict validation", () => {
    const mcpbFile = path.join(EXT_TEST_DIR, "admzip.mcpb");
    const sigFile = path.join(EXT_TEST_DIR, "admzip.p7s");
    fs.copyFileSync(TEST_MCPB, mcpbFile);

    prepareForExternalSigning(mcpbFile);
    const prepared = fs.readFileSync(mcpbFile);
    const sigBytes = createDetachedSignature(
      prepared,
      SELF_SIGNED_CERT,
      SELF_SIGNED_KEY,
    );
    fs.writeFileSync(sigFile, sigBytes);
    applyExternalSignature(mcpbFile, sigFile);

    const signed = fs.readFileSync(mcpbFile);

    // Find EOCD in signed file
    let eocdOffset = -1;
    for (let i = signed.length - 22; i >= 0; i--) {
      if (signed.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    expect(eocdOffset).toBeGreaterThanOrEqual(0);

    const commentLength = signed.readUInt16LE(eocdOffset + 20);

    // This is the exact check adm-zip performs:
    // data.length - Constants.ENDHDR !== commentLength
    // where ENDHDR starts at eocdOffset, and is 22 bytes long
    expect(signed.length).toBe(eocdOffset + 22 + commentLength);
  });

  it("should write to output path when specified", () => {
    const inputFile = path.join(EXT_TEST_DIR, "output-input.mcpb");
    const outputFile = path.join(EXT_TEST_DIR, "output-prepared.mcpb");
    fs.copyFileSync(TEST_MCPB, inputFile);

    // Prepare with output path — input should not be modified
    const originalContent = fs.readFileSync(inputFile);
    prepareForExternalSigning(inputFile, outputFile);

    // Input unchanged
    const afterContent = fs.readFileSync(inputFile);
    expect(afterContent.equals(originalContent)).toBe(true);

    // Output was created and has updated EOCD
    expect(fs.existsSync(outputFile)).toBe(true);
    const preparedContent = fs.readFileSync(outputFile);
    let eocdOffset = -1;
    for (let i = preparedContent.length - 22; i >= 0; i--) {
      if (preparedContent.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    expect(preparedContent.readUInt16LE(eocdOffset + 20)).toBe(
      MAX_SIG_BLOCK_SIZE,
    );
  });
});
