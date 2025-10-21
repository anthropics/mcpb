using System.CommandLine;
using System.Security.Cryptography.X509Certificates;

namespace Mcpb.Commands;

public static class VerifyCommand
{
    public static Command Create()
    {
        var fileArg = new Argument<string>("mcpb-file", "Path to .mcpb file");
        var cmd = new Command("verify", "Verify signature of an MCPB file") { fileArg };
        cmd.SetHandler((string file) =>
        {
            var path = Path.GetFullPath(file);
            if (!File.Exists(path)) { Console.Error.WriteLine($"ERROR: MCPB file not found: {file}"); return; }
            try
            {
                var content = File.ReadAllBytes(path);
                var (original, sig) = SignatureHelpers.ExtractSignatureBlock(content);
                Console.WriteLine($"Verifying {Path.GetFileName(path)}...");
                if (sig == null)
                {
                    Console.Error.WriteLine("ERROR: Extension is not signed");
                    return;
                }
                if (SignatureHelpers.Verify(original, sig, out var cert) && cert != null)
                {
                    Console.WriteLine("Signature is valid");
                    Console.WriteLine($"Signed by: {cert.Subject}");
                    Console.WriteLine($"Issuer: {cert.Issuer}");
                    Console.WriteLine($"Valid from: {cert.NotBefore:MM/dd/yyyy} to {cert.NotAfter:MM/dd/yyyy}");
                    Console.WriteLine($"Fingerprint: {cert.Thumbprint}");
                }
                else
                {
                    Console.Error.WriteLine("ERROR: Invalid signature");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"ERROR: Verification failed: {ex.Message}");
            }
        }, fileArg);
        return cmd;
    }
}
