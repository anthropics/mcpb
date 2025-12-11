using System.CommandLine;
using System.IO.Compression;

namespace Mcpb.Commands;

public static class UnpackCommand
{
    public static Command Create()
    {
        var fileArg = new Argument<string>("mcpb-file", description: "Path to .mcpb file");
        var outputArg = new Argument<string?>("output", () => null, description: "Output directory");
        var cmd = new Command("unpack", "Unpack an MCPB extension file") { fileArg, outputArg };
        cmd.SetHandler((string file, string? output) =>
        {
            var path = Path.GetFullPath(file);
            if (!File.Exists(path)) { Console.Error.WriteLine($"ERROR: MCPB file not found: {path}"); return; }
            var outDir = output != null ? Path.GetFullPath(output) : Directory.GetCurrentDirectory();
            Directory.CreateDirectory(outDir);
            try
            {
                using var fs = File.OpenRead(path);
                using var zip = new ZipArchive(fs, ZipArchiveMode.Read);
                foreach (var entry in zip.Entries)
                {
                    var targetPath = Path.Combine(outDir, entry.FullName);
                    if (targetPath.Contains("..")) throw new InvalidOperationException("Path traversal detected");
                    var dir = Path.GetDirectoryName(targetPath);
                    if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                    if (entry.FullName.EndsWith("/")) continue; // directory
                    entry.ExtractToFile(targetPath, overwrite: true);
                }
                Console.WriteLine($"Extension unpacked successfully to {outDir}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"ERROR: Failed to unpack extension: {ex.Message}");
            }
        }, fileArg, outputArg);
        return cmd;
    }
}