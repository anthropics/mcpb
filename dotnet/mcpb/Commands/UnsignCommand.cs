using System.CommandLine;

namespace Mcpb.Commands;

public static class UnsignCommand
{
    public static Command Create()
    {
        var fileArg = new Argument<string>("mcpb-file", "Path to .mcpb file");
        var cmd = new Command("unsign", "Remove signature from a MCPB file") { fileArg };
        cmd.SetHandler((string file)=>
        {
            var path = Path.GetFullPath(file);
            if (!File.Exists(path)) { Console.Error.WriteLine($"ERROR: MCPB file not found: {file}"); return; }
            try
            {
                var bytes = File.ReadAllBytes(path);
                var (original, sig) = SignatureHelpers.ExtractSignatureBlock(bytes);
                Console.WriteLine($"Removing signature from {Path.GetFileName(path)}...");
                if (sig == null)
                {
                    Console.WriteLine("WARNING: File not signed");
                }
                else
                {
                    File.WriteAllBytes(path, original);
                    Console.WriteLine("Signature removed");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"ERROR: Failed to remove signature: {ex.Message}");
            }
        }, fileArg);
        return cmd;
    }
}
