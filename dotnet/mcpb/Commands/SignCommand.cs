using System.CommandLine;
using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace Mcpb.Commands;

public static class SignCommand
{
    public static Command Create()
    {
        var fileArg = new Argument<string>("mcpb-file", description: "Path to .mcpb file");
        var certOpt = new Option<string>(new[]{"--cert","-c"}, () => "cert.pem", "Path to certificate (PEM)");
        var keyOpt = new Option<string>(new[]{"--key","-k"}, () => "key.pem", "Path to private key (PEM)");
        var selfSignedOpt = new Option<bool>("--self-signed", description: "Create self-signed certificate if missing");
        var cmd = new Command("sign", "Sign an MCPB extension file") { fileArg, certOpt, keyOpt, selfSignedOpt };
        cmd.SetHandler((string file, string cert, string key, bool selfSigned) =>
        {
            var path = Path.GetFullPath(file);
            if (!File.Exists(path)) { Console.Error.WriteLine($"ERROR: MCPB file not found: {file}"); return; }
            if (selfSigned && (!File.Exists(cert) || !File.Exists(key)))
            {
                Console.WriteLine("Creating self-signed certificate...");
                CreateSelfSigned(cert, key);
            }
            if (!File.Exists(cert) || !File.Exists(key))
            {
                Console.Error.WriteLine("ERROR: Certificate or key file not found");
                return;
            }
            try
            {
                Console.WriteLine($"Signing {Path.GetFileName(path)}...");
                var original = File.ReadAllBytes(path);
                var (content, _) = SignatureHelpers.ExtractSignatureBlock(original);
                var pkcs7 = SignatureHelpers.CreateDetachedPkcs7(content, cert, key);
                var signatureBlock = SignatureHelpers.CreateSignatureBlock(pkcs7);
                File.WriteAllBytes(path, content.Concat(signatureBlock).ToArray());
                Console.WriteLine($"Successfully signed {Path.GetFileName(path)}");
                // Basic signer info (chain trust not implemented yet)
                var (orig2, sig2) = SignatureHelpers.ExtractSignatureBlock(File.ReadAllBytes(path));
                if (sig2 != null && SignatureHelpers.Verify(orig2, sig2, out var signerCert) && signerCert != null)
                {
                    Console.WriteLine($"Signed by: {signerCert.Subject}");
                    Console.WriteLine($"Issuer: {signerCert.Issuer}");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"ERROR: Signing failed: {ex.Message}");
            }
        }, fileArg, certOpt, keyOpt, selfSignedOpt);
        return cmd;
    }

    private static void CreateSelfSigned(string certPath, string keyPath)
    {
        using var rsa = RSA.Create(4096);
        var req = new CertificateRequest("CN=MCPB Self-Signed Certificate", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        req.CertificateExtensions.Add(new X509BasicConstraintsExtension(false,false,0,false));
        req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, false));
        var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(10));
        var certPem = cert.ExportCertificatePem();
        var keyPem = rsa.ExportPkcs8PrivateKeyPem();
        File.WriteAllText(certPath, certPem + Environment.NewLine);
        File.WriteAllText(keyPath, keyPem + Environment.NewLine);
    }
}

internal static class SignatureHelpers
{
    private const string SignatureHeader = "MCPB_SIG_V1";
    private const string SignatureFooter = "MCPB_SIG_END";

    public static (byte[] Original, byte[]? Signature) ExtractSignatureBlock(byte[] fileContent)
    {
        var footerBytes = Encoding.UTF8.GetBytes(SignatureFooter);
        var headerBytes = Encoding.UTF8.GetBytes(SignatureHeader);
        int footerIndex = LastIndexOf(fileContent, footerBytes);
        if (footerIndex == -1) return (fileContent, null);
        int headerIndex = -1;
        for (int i = footerIndex - 1; i >= 0; i--)
        {
            if (StartsWithAt(fileContent, headerBytes, i)) { headerIndex = i; break; }
        }
        if (headerIndex == -1) return (fileContent, null);
        int lenOffset = headerIndex + headerBytes.Length;
        if (lenOffset + 4 > fileContent.Length) return (fileContent, null);
        int sigLen = BitConverter.ToInt32(fileContent, lenOffset);
        var sigStart = lenOffset + 4;
        if (sigStart + sigLen > fileContent.Length) return (fileContent, null);
        var sig = new byte[sigLen];
        Buffer.BlockCopy(fileContent, sigStart, sig, 0, sigLen);
        return (fileContent.Take(headerIndex).ToArray(), sig);
    }

    public static byte[] CreateSignatureBlock(byte[] pkcs7)
    {
        var header = Encoding.UTF8.GetBytes(SignatureHeader);
        var footer = Encoding.UTF8.GetBytes(SignatureFooter);
        var len = BitConverter.GetBytes(pkcs7.Length);
        using var ms = new MemoryStream();
        ms.Write(header);
        ms.Write(len);
        ms.Write(pkcs7);
        ms.Write(footer);
        return ms.ToArray();
    }

    public static byte[] CreateDetachedPkcs7(byte[] content, string certPemPath, string keyPemPath)
    {
        // Manual PEM parsing for reliability across environments
        try
        {
            string certText = File.ReadAllText(certPemPath);
            string keyText = File.ReadAllText(keyPemPath);

            static byte[] ExtractPem(string text, string label)
            {
                var begin = $"-----BEGIN {label}-----";
                var end = $"-----END {label}-----";
                int start = text.IndexOf(begin, StringComparison.Ordinal);
                if (start < 0) throw new CryptographicException($"Missing PEM begin marker for {label}.");
                start += begin.Length;
                int endIdx = text.IndexOf(end, start, StringComparison.Ordinal);
                if (endIdx < 0) throw new CryptographicException($"Missing PEM end marker for {label}.");
                var base64 = text.Substring(start, endIdx - start)
                    .Replace("\r", string.Empty)
                    .Replace("\n", string.Empty)
                    .Trim();
                return Convert.FromBase64String(base64);
            }

            var certDer = ExtractPem(certText, "CERTIFICATE");
            using var rsa = RSA.Create();
            try
            {
                // Support PKCS8 or traditional RSA PRIVATE KEY
                if (keyText.Contains("PRIVATE KEY"))
                {
                    if (keyText.Contains("BEGIN PRIVATE KEY"))
                    {
                        var pkcs8 = ExtractPem(keyText, "PRIVATE KEY");
                        rsa.ImportPkcs8PrivateKey(pkcs8, out _);
                    }
                    else if (keyText.Contains("BEGIN RSA PRIVATE KEY"))
                    {
                        var pkcs1 = ExtractPem(keyText, "RSA PRIVATE KEY");
                        rsa.ImportRSAPrivateKey(pkcs1, out _);
                    }
                }
                else
                {
                    throw new CryptographicException("Unsupported key PEM format.");
                }
            }
            catch (Exception ex)
            {
                throw new CryptographicException("Failed to parse private key PEM: " + ex.Message, ex);
            }

            var baseCert = new X509Certificate2(certDer);
            var cert = baseCert.CopyWithPrivateKey(rsa);
            var contentInfo = new ContentInfo(new Oid("1.2.840.113549.1.7.1"), content); // data OID
            var cms = new SignedCms(contentInfo, detached: true); // Back to detached
            var signer = new CmsSigner(SubjectIdentifierType.SubjectKeyIdentifier, cert)
            {
                IncludeOption = X509IncludeOption.EndCertOnly
            };
            cms.ComputeSignature(signer);
            return cms.Encode();
        }
        catch
        {
            // Fallback to built-in API if manual path failed (may throw original later)
            var cert = X509Certificate2.CreateFromPemFile(certPemPath, keyPemPath);
            if (!cert.HasPrivateKey)
            {
                using var rsa = RSA.Create();
                rsa.ImportFromPem(File.ReadAllText(keyPemPath));
                cert = cert.CopyWithPrivateKey(rsa);
            }
            var contentInfo = new ContentInfo(new Oid("1.2.840.113549.1.7.1"), content); // data OID
            var cms = new SignedCms(contentInfo, detached: true); // Back to detached
            var signer = new CmsSigner(SubjectIdentifierType.SubjectKeyIdentifier, cert)
            {
                IncludeOption = X509IncludeOption.EndCertOnly
            };
            cms.ComputeSignature(signer);
            return cms.Encode();
        }
    }

    public static bool Verify(byte[] content, byte[] signature, out X509Certificate2? signerCert)
    {
        signerCert = null;
        try
        {
            var cms = new SignedCms(new ContentInfo(content), detached: true);
            cms.Decode(signature);
            cms.CheckSignature(verifySignatureOnly: true);
            signerCert = cms.Certificates.Count > 0 ? cms.Certificates[0] : null;
            return true;
        }
        catch { return false; }
    }

    public static byte[] RemoveSignature(byte[] fileContent)
    {
        var (original, _) = ExtractSignatureBlock(fileContent);
        return original;
    }

    private static int LastIndexOf(byte[] source, byte[] pattern)
    {
        for (int i = source.Length - pattern.Length; i >= 0; i--)
        {
            if (StartsWithAt(source, pattern, i)) return i;
        }
        return -1;
    }
    private static bool StartsWithAt(byte[] source, byte[] pattern, int index)
    {
        if (index + pattern.Length > source.Length) return false;
        for (int i = 0; i < pattern.Length; i++) if (source[index + i] != pattern[i]) return false;
        return true;
    }
}