using Mcpb.Commands;
using System.Security.Cryptography;
using Xunit;

namespace Mcpb.Tests;

public class SigningTests
{
    [Fact]
    public void SignAndVerify_RoundTrip()
    {
        // Prepare dummy bundle bytes
        var content = System.Text.Encoding.UTF8.GetBytes("dummydata");
        var tmp = Path.Combine(Path.GetTempPath(), "mcpb_sign_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmp);
        var certPath = Path.Combine(tmp, "cert.pem");
        var keyPath = Path.Combine(tmp, "key.pem");

        // Create self-signed cert using helper logic (mirror SignCommand)
        using (var rsa = RSA.Create(2048))
        {
            var req = new System.Security.Cryptography.X509Certificates.CertificateRequest("CN=Test Cert", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(1));
            var certPem = cert.ExportCertificatePem();
            var keyPem = rsa.ExportPkcs8PrivateKeyPem();
            File.WriteAllText(certPath, certPem + Environment.NewLine);
            File.WriteAllText(keyPath, keyPem + Environment.NewLine);
        }

        var pkcs7 = SignatureHelpers.CreateDetachedPkcs7(content, certPath, keyPath);
        Assert.NotNull(pkcs7);
        var block = SignatureHelpers.CreateSignatureBlock(pkcs7);
        var signed = content.Concat(block).ToArray();
        var (original, sig) = SignatureHelpers.ExtractSignatureBlock(signed);
        Assert.NotNull(sig);
        Assert.Equal(content, original);
        var ok = SignatureHelpers.Verify(original, sig!, out var signerCert);
        Assert.True(ok);
        Assert.NotNull(signerCert);

        try { Directory.Delete(tmp, true); } catch { }
    }
}
