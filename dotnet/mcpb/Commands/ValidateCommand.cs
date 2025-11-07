using System.CommandLine;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Mcpb.Core;
using Mcpb.Json;

namespace Mcpb.Commands;

public static class ValidateCommand
{
    public static Command Create()
    {
        var manifestArg = new Argument<string?>("manifest", description: "Path to manifest.json or its directory");
        manifestArg.Arity = ArgumentArity.ZeroOrOne;
        var dirnameOpt = new Option<string?>("--dirname", description: "Directory containing referenced files and server entry point");
        var updateOpt = new Option<bool>("--update", description: "Update manifest tools/prompts to match discovery results");
        var cmd = new Command("validate", "Validate an MCPB manifest file") { manifestArg, dirnameOpt, updateOpt };
        cmd.SetHandler(async (string? path, string? dirname, bool update) =>
        {
            if (update && string.IsNullOrWhiteSpace(dirname))
            {
                Console.Error.WriteLine("ERROR: --update requires --dirname to locate manifest assets.");
                Environment.ExitCode = 1;
                return;
            }
            if (string.IsNullOrWhiteSpace(path))
            {
                if (!string.IsNullOrWhiteSpace(dirname))
                {
                    path = Path.Combine(dirname, "manifest.json");
                }
                else
                {
                    Console.Error.WriteLine("ERROR: Manifest path or --dirname must be specified.");
                    Environment.ExitCode = 1;
                    return;
                }
            }
            var manifestPath = path!;
            if (Directory.Exists(manifestPath))
            {
                manifestPath = Path.Combine(manifestPath, "manifest.json");
            }
            if (!File.Exists(manifestPath))
            {
                Console.Error.WriteLine($"ERROR: File not found: {manifestPath}");
                Environment.ExitCode = 1;
                return;
            }
            string json;
            try
            {
                json = File.ReadAllText(manifestPath);
                if (Environment.GetEnvironmentVariable("MCPB_DEBUG_VALIDATE") == "1")
                {
                    Console.WriteLine($"DEBUG: Read manifest {manifestPath} length={json.Length}");
                }

                static void PrintWarnings(IEnumerable<ValidationIssue> warnings, bool toError)
                {
                    foreach (var warning in warnings)
                    {
                        var msg = string.IsNullOrEmpty(warning.Path)
                            ? warning.Message
                            : $"{warning.Path}: {warning.Message}";
                        if (toError) Console.Error.WriteLine($"Warning: {msg}");
                        else Console.WriteLine($"Warning: {msg}");
                    }
                }

                var issues = ManifestValidator.ValidateJson(json);
                var errors = issues.Where(i => i.Severity == ValidationSeverity.Error).ToList();
                var warnings = issues.Where(i => i.Severity == ValidationSeverity.Warning).ToList();
                if (errors.Count > 0)
                {
                    Console.Error.WriteLine("ERROR: Manifest validation failed:\n");
                    foreach (var issue in errors)
                    {
                        var pfx = string.IsNullOrEmpty(issue.Path) ? "" : issue.Path + ": ";
                        Console.Error.WriteLine($"  - {pfx}{issue.Message}");
                    }
                    PrintWarnings(warnings, toError: true);
                    Environment.ExitCode = 1;
                    return;
                }

                var manifest = JsonSerializer.Deserialize<McpbManifest>(json, McpbJsonContext.Default.McpbManifest)!;
                var currentWarnings = new List<ValidationIssue>(warnings);
                var additionalErrors = new List<string>();

                if (!string.IsNullOrWhiteSpace(dirname))
                {
                    var baseDir = Path.GetFullPath(dirname);
                    if (!Directory.Exists(baseDir))
                    {
                        Console.Error.WriteLine($"ERROR: Directory not found: {baseDir}");
                        PrintWarnings(currentWarnings, toError: true);
                        Environment.ExitCode = 1;
                        return;
                    }

                    var fileErrors = ManifestCommandHelpers.ValidateReferencedFiles(manifest, baseDir);
                    foreach (var err in fileErrors)
                    {
                        additionalErrors.Add($"ERROR: {err}");
                    }

                    var discovery = await ManifestCommandHelpers.DiscoverCapabilitiesAsync(
                        baseDir,
                        manifest,
                        message => Console.WriteLine(message),
                        warning => Console.Error.WriteLine($"WARNING: {warning}"));

                    var discoveredTools = discovery.Tools;
                    var discoveredPrompts = discovery.Prompts;

                    var manifestTools = manifest.Tools?.Select(t => t.Name).ToList() ?? new List<string>();
                    var manifestPrompts = manifest.Prompts?.Select(p => p.Name).ToList() ?? new List<string>();

                    var sortedDiscoveredTools = discoveredTools.Select(t => t.Name).ToList();
                    var sortedDiscoveredPrompts = discoveredPrompts.Select(p => p.Name).ToList();
                    manifestTools.Sort(StringComparer.Ordinal);
                    manifestPrompts.Sort(StringComparer.Ordinal);
                    sortedDiscoveredTools.Sort(StringComparer.Ordinal);
                    sortedDiscoveredPrompts.Sort(StringComparer.Ordinal);

                    bool toolMismatch = !manifestTools.SequenceEqual(sortedDiscoveredTools);
                    bool promptMismatch = !manifestPrompts.SequenceEqual(sortedDiscoveredPrompts);

                    var toolMetadataDiffs = ManifestCommandHelpers.GetToolMetadataDifferences(manifest.Tools, discoveredTools);
                    var promptMetadataDiffs = ManifestCommandHelpers.GetPromptMetadataDifferences(manifest.Prompts, discoveredPrompts);
                    bool toolMetadataMismatch = toolMetadataDiffs.Count > 0;
                    bool promptMetadataMismatch = promptMetadataDiffs.Count > 0;

                    bool mismatchOccurred = toolMismatch || promptMismatch || toolMetadataMismatch || promptMetadataMismatch;

                    if (toolMismatch)
                    {
                        Console.WriteLine("Tool list mismatch:");
                        Console.WriteLine("  Manifest:   [" + string.Join(", ", manifestTools) + "]");
                        Console.WriteLine("  Discovered: [" + string.Join(", ", sortedDiscoveredTools) + "]");
                    }

                    if (toolMetadataMismatch)
                    {
                        Console.WriteLine("Tool metadata mismatch:");
                        foreach (var diff in toolMetadataDiffs)
                        {
                            Console.WriteLine("  " + diff);
                        }
                    }

                    if (promptMismatch)
                    {
                        Console.WriteLine("Prompt list mismatch:");
                        Console.WriteLine("  Manifest:   [" + string.Join(", ", manifestPrompts) + "]");
                        Console.WriteLine("  Discovered: [" + string.Join(", ", sortedDiscoveredPrompts) + "]");
                    }

                    if (promptMetadataMismatch)
                    {
                        Console.WriteLine("Prompt metadata mismatch:");
                        foreach (var diff in promptMetadataDiffs)
                        {
                            Console.WriteLine("  " + diff);
                        }
                    }

                    var promptWarnings = ManifestCommandHelpers.GetPromptTextWarnings(manifest.Prompts, discoveredPrompts);
                    foreach (var warning in promptWarnings)
                    {
                        Console.Error.WriteLine($"WARNING: {warning}");
                    }

                    if (mismatchOccurred)
                    {
                        if (update)
                        {
                            if (toolMismatch || toolMetadataMismatch)
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
                            if (promptMismatch || promptMetadataMismatch)
                            {
                                manifest.Prompts = ManifestCommandHelpers.MergePromptMetadata(manifest.Prompts, discoveredPrompts);
                                manifest.PromptsGenerated ??= false;
                            }

                            var updatedJson = JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions);
                            var updatedIssues = ManifestValidator.ValidateJson(updatedJson);
                            var updatedErrors = updatedIssues.Where(i => i.Severity == ValidationSeverity.Error).ToList();
                            var updatedWarnings = updatedIssues.Where(i => i.Severity == ValidationSeverity.Warning).ToList();
                            var updatedManifest = JsonSerializer.Deserialize<McpbManifest>(updatedJson, McpbJsonContext.Default.McpbManifest)!;

                            File.WriteAllText(manifestPath, updatedJson);

                            if (updatedErrors.Count > 0)
                            {
                                Console.Error.WriteLine("ERROR: Updated manifest validation failed (updated file written):\n");
                                foreach (var issue in updatedErrors)
                                {
                                    var pfx = string.IsNullOrEmpty(issue.Path) ? string.Empty : issue.Path + ": ";
                                    Console.Error.WriteLine($"  - {pfx}{issue.Message}");
                                }
                                PrintWarnings(updatedWarnings, toError: true);
                                Environment.ExitCode = 1;
                                return;
                            }

                            var updatedManifestTools = updatedManifest.Tools?.Select(t => t.Name).ToList() ?? new List<string>();
                            var updatedManifestPrompts = updatedManifest.Prompts?.Select(p => p.Name).ToList() ?? new List<string>();
                            updatedManifestTools.Sort(StringComparer.Ordinal);
                            updatedManifestPrompts.Sort(StringComparer.Ordinal);
                            if (!updatedManifestTools.SequenceEqual(sortedDiscoveredTools) || !updatedManifestPrompts.SequenceEqual(sortedDiscoveredPrompts))
                            {
                                Console.Error.WriteLine("ERROR: Updated manifest still differs from discovered capability names (updated file written).");
                                PrintWarnings(updatedWarnings, toError: true);
                                Environment.ExitCode = 1;
                                return;
                            }

                            var remainingToolDiffs = ManifestCommandHelpers.GetToolMetadataDifferences(updatedManifest.Tools, discoveredTools);
                            var remainingPromptDiffs = ManifestCommandHelpers.GetPromptMetadataDifferences(updatedManifest.Prompts, discoveredPrompts);
                            if (remainingToolDiffs.Count > 0 || remainingPromptDiffs.Count > 0)
                            {
                                Console.Error.WriteLine("ERROR: Updated manifest metadata still differs from discovered results (updated file written).");
                                PrintWarnings(updatedWarnings, toError: true);
                                Environment.ExitCode = 1;
                                return;
                            }

                            Console.WriteLine("Updated manifest.json capabilities to match discovered results.");
                            manifest = updatedManifest;
                            currentWarnings = new List<ValidationIssue>(updatedWarnings);
                        }
                        else
                        {
                            additionalErrors.Add("ERROR: Discovered capabilities differ from manifest (names or metadata). Use --update to rewrite manifest.");
                        }
                    }
                }

                if (additionalErrors.Count > 0)
                {
                    foreach (var err in additionalErrors)
                    {
                        Console.Error.WriteLine(err);
                    }
                    PrintWarnings(currentWarnings, toError: true);
                    Environment.ExitCode = 1;
                    return;
                }

                Console.WriteLine("Manifest is valid!");
                PrintWarnings(currentWarnings, toError: false);
                Console.Out.Flush();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"ERROR: {ex.Message}");
                Environment.ExitCode = 1;
            }
        }, manifestArg, dirnameOpt, updateOpt);
        return cmd;
    }
}