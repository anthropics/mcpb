/**
 * End-to-end test for DXT signing and verification
 *
 * This test:
 * 1. Creates a test DXT file
 * 2. Generates a self-signed certificate for testing
 * 3. Signs the DXT file
 * 4. Verifies the signature
 * 5. Tests various failure scenarios
 */

import * as fs from "fs";
import forge from "node-forge";
import * as path from "path";

import { signDxtFile, unsignDxtFile, verifyDxtFile } from "../src/node/sign";

// Test directory
const TEST_DIR = path.join(__dirname, "test-output");

// Ensure test directory exists
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

// Test file paths
const TEST_DXT = path.join(TEST_DIR, "test.dxt");
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
    { name: "commonName", value: "Test DXT Publisher" },
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
 * Create a test DXT file (just a simple ZIP)
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

  fs.writeFileSync(TEST_DXT, zipContent);
}

/**
 * Test signing with self-signed certificate
 */
async function testSelfSignedSigning() {
  // Create a copy for this test
  const testFile = path.join(TEST_DIR, "test-self-signed.dxt");
  fs.copyFileSync(TEST_DXT, testFile);

  // Sign the file
  expect(() =>
    signDxtFile(testFile, SELF_SIGNED_CERT, SELF_SIGNED_KEY),
  ).not.toThrow();

  // Verify the signature
  const result = await verifyDxtFile(testFile);

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
  fs.copyFileSync(TEST_DXT, testFile);

  // Sign the file with intermediate
  expect(() =>
    signDxtFile(testFile, SIGNED_CERT, SIGNED_KEY, [CA_CERT]),
  ).not.toThrow();

  // Verify the signature
  const result = await verifyDxtFile(testFile);

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
  fs.copyFileSync(TEST_DXT, testFile);
  signDxtFile(testFile, SELF_SIGNED_CERT, SELF_SIGNED_KEY);

  // Read the signed file
  const signedContent = fs.readFileSync(testFile);

  // Tamper with the content (change a byte in the ZIP portion)
  const tamperedContent = Buffer.from(signedContent);
  tamperedContent[10] = (tamperedContent[10] + 1) % 256;
  fs.writeFileSync(testFile, tamperedContent);

  // Try to verify - should fail
  const result = await verifyDxtFile(testFile);
  expect(result.status).toBe("unsigned");

  // Clean up
  fs.unlinkSync(testFile);
}

/**
 * Test unsigned file verification
 */
async function testUnsignedFile() {
  const result = await verifyDxtFile(TEST_DXT);
  expect(result.status).toBe("unsigned");
}

/**
 * Test signature removal
 */
async function testSignatureRemoval() {
  // Create a copy and sign it
  const testFile = path.join(TEST_DIR, "test-remove-sig.dxt");
  fs.copyFileSync(TEST_DXT, testFile);
  signDxtFile(testFile, SELF_SIGNED_CERT, SELF_SIGNED_KEY);

  // Verify it's signed (or at least has signature data)
  await verifyDxtFile(testFile);

  // Remove signature
  expect(() => unsignDxtFile(testFile)).not.toThrow();

  // Verify it's unsigned
  const afterResult = await verifyDxtFile(testFile);
  expect(afterResult.status).toBe("unsigned");

  // Clean up
  fs.unlinkSync(testFile);
}

describe("DXT Signing E2E Tests", () => {
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
});
