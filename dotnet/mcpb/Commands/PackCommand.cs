using System.CommandLine;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using Mcpb.Core;
using System.Text.Json;
using Mcpb.Json;
using System.Text.RegularExpressions;

namespace Mcpb.Commands;

public static class PackCommand
{
    private static readonly string[] BaseExcludePatterns = new[]{
        ".DS_Store","Thumbs.db",".gitignore",".git",".mcpbignore","*.log",".env",".npm",".npmrc",".yarnrc",".yarn",".eslintrc",".editorconfig",".prettierrc",".prettierignore",".eslintignore",".nycrc",".babelrc",".pnp.*","node_modules/.cache","node_modules/.bin","*.map",".env.local",".env.*.local","npm-debug.log*","yarn-debug.log*","yarn-error.log*","package-lock.json","yarn.lock","*.mcpb","*.d.ts","*.tsbuildinfo","tsconfig.json"
    };

    public static Command Create()
    {
        var dirArg = new Argument<string?>("directory", () => Directory.GetCurrentDirectory(), "Extension directory");
        var outputArg = new Argument<string?>("output", () => null, "Output .mcpb path");
        var forceOpt = new Option<bool>(name: "--force", description: "Proceed even if discovered tools differ from manifest");
        var updateOpt = new Option<bool>(name: "--update", description: "Update manifest tools list to match dynamically discovered tools");
        var noDiscoverOpt = new Option<bool>(name: "--no-discover", description: "Skip dynamic tool discovery (for offline / testing)");
        var cmd = new Command("pack", "Pack a directory into an MCPB extension") { dirArg, outputArg, forceOpt, updateOpt, noDiscoverOpt };
        cmd.SetHandler(async (string? directory, string? output, bool force, bool update, bool noDiscover) =>
        {
            var dir = Path.GetFullPath(directory ?? Directory.GetCurrentDirectory());
            if (!Directory.Exists(dir)) { Console.Error.WriteLine($"ERROR: Directory not found: {dir}"); return; }
            var manifestPath = Path.Combine(dir, "manifest.json");
            if (!File.Exists(manifestPath)) { Console.Error.WriteLine("ERROR: manifest.json not found"); return; }
            if (!ValidateManifestBasic(manifestPath)) { Console.Error.WriteLine("ERROR: Cannot pack invalid manifest"); return; }

            var manifest = JsonSerializer.Deserialize<McpbManifest>(File.ReadAllText(manifestPath), McpbJsonContext.Default.McpbManifest)!;

            var outPath = output != null
                ? Path.GetFullPath(output)
                : Path.Combine(Directory.GetCurrentDirectory(), SanitizeFileName(manifest.Name) + ".mcpb");
            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);

            var ignorePatterns = LoadIgnoreFile(dir);
            var files = CollectFiles(dir, ignorePatterns, out var ignoredCount);

            // Manifest already parsed above

            // Validate referenced files (icon, entrypoint, server command if path-like, screenshots) before any discovery
            var fileErrors = ManifestCommandHelpers.ValidateReferencedFiles(manifest, dir);
            if (fileErrors.Count > 0)
            {
                foreach (var err in fileErrors) Console.Error.WriteLine($"ERROR: {err}");
                Environment.ExitCode = 1;
                return;
            }

            // Attempt dynamic discovery unless opted out (tools & prompts)
            List<McpbManifestTool>? discoveredTools = null;
            List<McpbManifestPrompt>? discoveredPrompts = null;
            McpbInitializeResult? discoveredInitResponse = null;
            McpbToolsListResult? discoveredToolsListResponse = null;
            if (!noDiscover)
            {
                try
                {
                    var result = await ManifestCommandHelpers.DiscoverCapabilitiesAsync(
                        dir,
                        manifest,
                        message => Console.WriteLine(message),
                        warning => Console.Error.WriteLine($"WARNING: {warning}"));
                    discoveredTools = result.Tools;
                    discoveredPrompts = result.Prompts;
                    discoveredInitResponse = result.InitializeResponse;
                    discoveredToolsListResponse = result.ToolsListResponse;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"WARNING: Tool discovery failed: {ex.Message}");
                }
            }

            bool mismatchOccurred = false;
            if (discoveredTools != null)
            {
                var manifestTools = manifest.Tools?.Select(t => t.Name).ToList() ?? new List<string>();
                var discoveredToolNames = discoveredTools.Select(t => t.Name).ToList();
                discoveredToolNames.Sort(StringComparer.Ordinal);
                manifestTools.Sort(StringComparer.Ordinal);
                bool listMismatch = !manifestTools.SequenceEqual(discoveredToolNames);
                if (listMismatch)
                {
                    mismatchOccurred = true;
                    Console.WriteLine("Tool list mismatch:");
                    Console.WriteLine("  Manifest:   [" + string.Join(", ", manifestTools) + "]");
                    Console.WriteLine("  Discovered: [" + string.Join(", ", discoveredToolNames) + "]");
                }

                var metadataDiffs = ManifestCommandHelpers.GetToolMetadataDifferences(manifest.Tools, discoveredTools);
                if (metadataDiffs.Count > 0)
                {
                    mismatchOccurred = true;
                    Console.WriteLine("Tool metadata mismatch:");
                    foreach (var diff in metadataDiffs)
                    {
                        Console.WriteLine("  " + diff);
                    }
                }
            }

            if (discoveredPrompts != null)
            {
                var manifestPrompts = manifest.Prompts?.Select(p => p.Name).ToList() ?? new List<string>();
                var discoveredPromptNames = discoveredPrompts.Select(p => p.Name).ToList();
                discoveredPromptNames.Sort(StringComparer.Ordinal);
                manifestPrompts.Sort(StringComparer.Ordinal);
                bool listMismatch = !manifestPrompts.SequenceEqual(discoveredPromptNames);
                if (listMismatch)
                {
                    mismatchOccurred = true;
                    Console.WriteLine("Prompt list mismatch:");
                    Console.WriteLine("  Manifest:   [" + string.Join(", ", manifestPrompts) + "]");
                    Console.WriteLine("  Discovered: [" + string.Join(", ", discoveredPromptNames) + "]");
                }

                var metadataDiffs = ManifestCommandHelpers.GetPromptMetadataDifferences(manifest.Prompts, discoveredPrompts);
                if (metadataDiffs.Count > 0)
                {
                    mismatchOccurred = true;
                    Console.WriteLine("Prompt metadata mismatch:");
                    foreach (var diff in metadataDiffs)
                    {
                        Console.WriteLine("  " + diff);
                    }
                }

                var promptWarnings = ManifestCommandHelpers.GetPromptTextWarnings(manifest.Prompts, discoveredPrompts);
                foreach (var warning in promptWarnings)
                {
                    Console.Error.WriteLine($"WARNING: {warning}");
                }
            }

            // Check static responses in _meta (always update when --update is used)
            if (update && (discoveredInitResponse != null || discoveredToolsListResponse != null))
            {
                // Get or create _meta["com.microsoft.windows"]
                var windowsMeta = GetOrCreateWindowsMeta(manifest);
                var staticResponses = windowsMeta.StaticResponses ?? new McpbStaticResponses();
                
                // Update static responses in _meta when --update flag is used
                if (discoveredInitResponse != null)
                {
                    // Serialize to dictionary to have full control over what's included
                    var initDict = new Dictionary<string, object>();
                    if (discoveredInitResponse.ProtocolVersion != null)
                        initDict["protocolVersion"] = discoveredInitResponse.ProtocolVersion;
                    if (discoveredInitResponse.Capabilities != null)
                        initDict["capabilities"] = discoveredInitResponse.Capabilities;
                    if (discoveredInitResponse.ServerInfo != null)
                        initDict["serverInfo"] = discoveredInitResponse.ServerInfo;
                    if (!string.IsNullOrWhiteSpace(discoveredInitResponse.Instructions))
                        initDict["instructions"] = discoveredInitResponse.Instructions;
                    
                    staticResponses.Initialize = initDict;
                }
                if (discoveredToolsListResponse != null)
                {
                    // Store the entire tools/list response object as-is
                    staticResponses.ToolsList = discoveredToolsListResponse;
                }
                windowsMeta.StaticResponses = staticResponses;
                SetWindowsMeta(manifest, windowsMeta);
                Console.WriteLine("Updated _meta static_responses to match discovered results.");
            }

            if (mismatchOccurred)
            {
                if (update)
                {
                    if (discoveredTools != null)
                    {
                        manifest.Tools = discoveredTools
                            .Select(t => new McpbManifestTool
                            {
                                Name = t.Name,
                                Description = t.Description
                            })
                            .ToList();
                        manifest.ToolsGenerated ??= false;
                    }
                    if (discoveredPrompts != null)
                    {
                        manifest.Prompts = ManifestCommandHelpers.MergePromptMetadata(manifest.Prompts, discoveredPrompts);
                        manifest.PromptsGenerated ??= false;
                    }
                    File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
                    Console.WriteLine("Updated manifest.json capabilities to match discovered results.");
                }
                else if (!force)
                {
                    Console.Error.WriteLine("ERROR: Discovered capabilities differ from manifest. Use --force to ignore or --update to rewrite manifest.");
                    Environment.ExitCode = 1;
                    return;
                }
                else
                {
                    Console.WriteLine("Proceeding due to --force despite capability mismatches.");
                }
            }

            // Header
            Console.WriteLine($"\n📦  {manifest.Name}@{manifest.Version}");
            Console.WriteLine("Archive Contents");

            long totalUnpacked = 0;
            // Build list with sizes
            var fileEntries = files.Select(t => new { t.fullPath, t.relative, Size = new FileInfo(t.fullPath).Length }).ToList();
            fileEntries.Sort((a, b) => string.Compare(a.relative, b.relative, StringComparison.Ordinal));

            // Group deep ( >3 parts ) similar to TS (first 3 segments)
            var deepGroups = new Dictionary<string, (List<string> Files, long Size)>();
            var shallow = new List<(string Rel, long Size)>();
            foreach (var fe in fileEntries)
            {
                totalUnpacked += fe.Size;
                var parts = fe.relative.Split('/', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length > 3)
                {
                    var key = string.Join('/', parts.Take(3));
                    if (!deepGroups.TryGetValue(key, out var val)) { val = (new List<string>(), 0); }
                    val.Files.Add(fe.relative); val.Size += fe.Size; deepGroups[key] = val;
                }
                else shallow.Add((fe.relative, fe.Size));
            }
            foreach (var s in shallow) Console.WriteLine($"{FormatSize(s.Size).PadLeft(8)} {s.Rel}");
            foreach (var kv in deepGroups)
            {
                var (list, size) = kv.Value;
                if (list.Count == 1)
                    Console.WriteLine($"{FormatSize(size).PadLeft(8)} {list[0]}");
                else
                    Console.WriteLine($"{FormatSize(size).PadLeft(8)} {kv.Key}/ [and {list.Count} more files]");
            }

            using var mem = new MemoryStream();
            using (var zip = new ZipArchive(mem, ZipArchiveMode.Create, true, Encoding.UTF8))
            {
                foreach (var (filePath, rel) in files)
                {
                    var entry = zip.CreateEntry(rel, CompressionLevel.SmallestSize);
                    using var es = entry.Open();
                    await using var fs = File.OpenRead(filePath);
                    await fs.CopyToAsync(es);
                }
            }
            var zipData = mem.ToArray();
            await File.WriteAllBytesAsync(outPath, zipData);

            var sha1 = SHA1.HashData(zipData);
            var sanitizedName = SanitizeFileName(manifest.Name);
            var archiveName = $"{sanitizedName}-{manifest.Version}.mcpb";
            Console.WriteLine("\nArchive Details");
            Console.WriteLine($"name: {manifest.Name}");
            Console.WriteLine($"version: {manifest.Version}");
            Console.WriteLine($"filename: {archiveName}");
            Console.WriteLine($"package size: {FormatSize(zipData.Length)}");
            Console.WriteLine($"unpacked size: {FormatSize(totalUnpacked)}");
            Console.WriteLine($"shasum: {Convert.ToHexString(sha1).ToLowerInvariant()}");
            Console.WriteLine($"total files: {fileEntries.Count}");
            Console.WriteLine($"ignored (.mcpbignore) files: {ignoredCount}");
            Console.WriteLine($"\nOutput: {outPath}");
        }, dirArg, outputArg, forceOpt, updateOpt, noDiscoverOpt);
        return cmd;
    }
    // Removed reflection-based helpers; using direct SDK types instead.

    private static bool ValidateManifestBasic(string manifestPath)
    {
        try { var json = File.ReadAllText(manifestPath); return JsonSerializer.Deserialize(json, McpbJsonContext.Default.McpbManifest) != null; }
        catch { return false; }
    }

    private static List<(string fullPath, string relative)> CollectFiles(string baseDir, List<string> additionalPatterns, out int ignoredCount)
    {
        ignoredCount = 0;
        var results = new List<(string, string)>();
        foreach (var file in Directory.GetFiles(baseDir, "*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(baseDir, file).Replace('\\', '/');
            if (ShouldExclude(rel, additionalPatterns)) { ignoredCount++; continue; }
            results.Add((file, rel));
        }
        return results;
    }

    private static bool ShouldExclude(string relative, List<string> additional)
    {
        return Matches(relative, BaseExcludePatterns) || Matches(relative, additional);
    }

    private static bool Matches(string relative, IEnumerable<string> patterns)
    {
        foreach (var pattern in patterns)
        {
            if (GlobMatch(relative, pattern)) return true;
        }
        return false;
    }

    private static bool GlobMatch(string text, string pattern)
    {
        // Simple glob: * wildcard, ? single char, supports '**/' for any dir depth
        // Convert to regex
        var regex = System.Text.RegularExpressions.Regex.Escape(pattern)
            .Replace(@"\*\*\/", @"(?:(?:.+/)?)")
            .Replace(@"\*", @"[^/]*")
            .Replace(@"\?", @".");
        return System.Text.RegularExpressions.Regex.IsMatch(text, "^" + regex + "$");
    }

    private static List<string> LoadIgnoreFile(string baseDir)
    {
        var path = Path.Combine(baseDir, ".mcpbignore");
        if (!File.Exists(path)) return new List<string>();
        return File.ReadAllLines(path)
            .Select(l => l.Trim())
            .Where(l => l.Length > 0 && !l.StartsWith("#"))
            .ToList();
    }

    private static string FormatSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes}B"; if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1}kB"; return $"{bytes / (1024.0 * 1024):F1}MB";
    }

    private static string SanitizeFileName(string name)
    {
        var sanitized = RegexReplace(name, "\\s+", "-");
        sanitized = RegexReplace(sanitized, "[^A-Za-z0-9-_.]", "");
        sanitized = RegexReplace(sanitized, "-+", "-");
        sanitized = sanitized.Trim('-');
        if (sanitized.Length > 100) sanitized = sanitized.Substring(0, 100);
        return sanitized;
    }
    private static string RegexReplace(string input, string pattern, string replacement) => System.Text.RegularExpressions.Regex.Replace(input, pattern, replacement);

    private static McpbWindowsMeta GetOrCreateWindowsMeta(McpbManifest manifest)
    {
        manifest.Meta ??= new Dictionary<string, Dictionary<string, object>>();
        
        if (!manifest.Meta.TryGetValue("com.microsoft.windows", out var windowsMetaDict))
        {
            return new McpbWindowsMeta();
        }
        
        // Try to deserialize the dictionary to McpbWindowsMeta
        try
        {
            var json = JsonSerializer.Serialize(windowsMetaDict);
            return JsonSerializer.Deserialize<McpbWindowsMeta>(json) ?? new McpbWindowsMeta();
        }
        catch
        {
            return new McpbWindowsMeta();
        }
    }
    
    private static void SetWindowsMeta(McpbManifest manifest, McpbWindowsMeta windowsMeta)
    {
        manifest.Meta ??= new Dictionary<string, Dictionary<string, object>>();
        
        // Serialize to dictionary
        var json = JsonSerializer.Serialize(windowsMeta);
        var dict = JsonSerializer.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
        
        manifest.Meta["com.microsoft.windows"] = dict;
    }
    
    private static bool AreStaticResponsesEqual(object? a, object? b)
    {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        
        try
        {
            var jsonA = JsonSerializer.Serialize(a);
            var jsonB = JsonSerializer.Serialize(b);
            return jsonA == jsonB;
        }
        catch
        {
            return false;
        }
    }

}
