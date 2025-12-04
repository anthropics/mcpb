using System.CommandLine;
using System.Security.Cryptography.X509Certificates;

namespace Mcpb.Commands;

public static class InfoCommand
{
    public static Command Create()
    {
        var fileArg = new Argument<string>("mcpb-file", "Path to .mcpb file");
        var cmd = new Command("info", "Display information about an MCPB file") { fileArg };
        cmd.SetHandler((string file)=>
        {
            var path = Path.GetFullPath(file);
            if (!File.Exists(path)) { Console.Error.WriteLine($"ERROR: MCPB file not found: {file}"); return; }
            try
            {
                var info = new FileInfo(path);
                Console.WriteLine($"File: {info.Name}");
                Console.WriteLine($"Size: {info.Length/1024.0:F2} KB");
                var bytes = File.ReadAllBytes(path);
                var (original, sig) = SignatureHelpers.ExtractSignatureBlock(bytes);
                if (sig != null && SignatureHelpers.Verify(original, sig, out var cert) && cert != null)
                {
                    Console.WriteLine("\nSignature Information:");
                    Console.WriteLine($"  Subject: {cert.Subject}");
                    Console.WriteLine($"  Issuer: {cert.Issuer}");
                    Console.WriteLine($"  Valid from: {cert.NotBefore:MM/dd/yyyy} to {cert.NotAfter:MM/dd/yyyy}");
                    Console.WriteLine($"  Fingerprint: {cert.Thumbprint}");
                    Console.WriteLine($"  Status: Valid");
                }
                else
                {
                    Console.WriteLine("\nWARNING: Not signed");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"ERROR: Failed to read MCPB info: {ex.Message}");
            }
        }, fileArg);
        return cmd;
    }
}
