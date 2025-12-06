using System;
using System.Collections.Generic;
using System.CommandLine;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Mcpb.Core;
using Mcpb.Json;

namespace Mcpb.Commands;

public static class ValidateCommand
{
    public static Command Create()
    {
        var manifestArg = new Argument<string?>(
            "manifest",
            description: "Path to manifest.json or its directory"
        );
        manifestArg.Arity = ArgumentArity.ZeroOrOne;
        var dirnameOpt = new Option<string?>(
            "--dirname",
            description: "Directory containing referenced files and server entry point"
        );
        var updateOpt = new Option<bool>(
            "--update",
            description: "Update manifest tools/prompts to match discovery results"
        );
        var discoverOpt = new Option<bool>(
            "--discover",
            description: "Validate that discovered tools/prompts match manifest without updating"
        );
        var verboseOpt = new Option<bool>(
            "--verbose",
            description: "Print detailed validation steps"
        );
        var userConfigOpt = new Option<string[]>(
            name: "--user_config",
            description: "Provide user_config overrides as name=value. Repeat to set more keys or add multiple values for a key."
        )
        {
            AllowMultipleArgumentsPerToken = true,
        };
        userConfigOpt.AddAlias("--user-config");
        userConfigOpt.ArgumentHelpName = "name=value";
        userConfigOpt.SetDefaultValue(Array.Empty<string>());
        var cmd = new Command("validate", "Validate an MCPB manifest file")
        {
            manifestArg,
            dirnameOpt,
            updateOpt,
            discoverOpt,
            verboseOpt,
            userConfigOpt,
        };
        cmd.SetHandler(
            async (
                string? path,
                string? dirname,
                bool update,
                bool discover,
                bool verbose,
                string[] userConfigRaw
            ) =>
            {
                if (
                    !UserConfigOptionParser.TryParse(
                        userConfigRaw,
                        out var userConfigOverrides,
                        out var parseError
                    )
                )
                {
                    Console.Error.WriteLine($"ERROR: {parseError}");
                    Environment.ExitCode = 1;
                    return;
                }
                if (update && discover)
                {
                    Console.Error.WriteLine(
                        "ERROR: --discover and --update cannot be used together."
                    );
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
                        Console.Error.WriteLine(
                            "ERROR: Manifest path or --dirname must be specified."
                        );
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
                    void LogVerbose(string message)
                    {
                        if (verbose)
                            Console.WriteLine($"VERBOSE: {message}");
                    }
                    var manifestDirectory = Path.GetDirectoryName(Path.GetFullPath(manifestPath));
                    if (discover && string.IsNullOrWhiteSpace(dirname))
                    {
                        dirname = manifestDirectory;
                        if (!string.IsNullOrWhiteSpace(dirname))
                        {
                            LogVerbose($"Using manifest directory {dirname} for discovery");
                        }
                    }
                    if (update && string.IsNullOrWhiteSpace(dirname))
                    {
                        Console.Error.WriteLine(
                            "ERROR: --update requires --dirname to locate manifest assets."
                        );
                        Environment.ExitCode = 1;
                        return;
                    }
                    if (Environment.GetEnvironmentVariable("MCPB_DEBUG_VALIDATE") == "1")
                    {
                        Console.WriteLine(
                            $"DEBUG: Read manifest {manifestPath} length={json.Length}"
                        );
                    }
                    LogVerbose($"Validating manifest JSON at {manifestPath}");

                    static void PrintWarnings(IEnumerable<ValidationIssue> warnings, bool toError)
                    {
                        foreach (var warning in warnings)
                        {
                            var msg = string.IsNullOrEmpty(warning.Path)
                                ? warning.Message
                                : $"{warning.Path}: {warning.Message}";
                            if (toError)
                                Console.Error.WriteLine($"Warning: {msg}");
                            else
                                Console.WriteLine($"Warning: {msg}");
                        }
                    }

                    var issues = ManifestValidator.ValidateJson(json);
                    var errors = issues.Where(i => i.Severity == ValidationSeverity.Error).ToList();
                    var warnings = issues
                        .Where(i => i.Severity == ValidationSeverity.Warning)
                        .ToList();
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

                    var manifest = JsonSerializer.Deserialize<McpbManifest>(
                        json,
                        McpbJsonContext.Default.McpbManifest
                    )!;
                    var currentWarnings = new List<ValidationIssue>(warnings);
                    var additionalErrors = new List<string>();
                    var discoveryViolations = new List<string>();
                    var mismatchSummary = new List<string>();
                    bool discoveryMismatchOccurred = false;
                    bool assetPathsNormalized = false;
                    bool manifestNameUpdated = false;
                    bool manifestVersionUpdated = false;

                    // Parse JSON to get root properties for localization validation
                    HashSet<string>? rootProps = null;
                    using (var doc = JsonDocument.Parse(json))
                    {
                        rootProps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        if (doc.RootElement.ValueKind == JsonValueKind.Object)
                            foreach (var p in doc.RootElement.EnumerateObject())
                                rootProps.Add(p.Name);
                    }

                    if (!string.IsNullOrWhiteSpace(dirname))
                    {
                        var baseDir = Path.GetFullPath(dirname);
                        LogVerbose($"Checking referenced assets using directory {baseDir}");
                        if (!Directory.Exists(baseDir))
                        {
                            Console.Error.WriteLine($"ERROR: Directory not found: {baseDir}");
                            PrintWarnings(currentWarnings, toError: true);
                            Environment.ExitCode = 1;
                            return;
                        }

                        if (update)
                        {
                            assetPathsNormalized =
                                NormalizeManifestAssetPaths(manifest) || assetPathsNormalized;
                        }

                        var fileErrors = ManifestCommandHelpers.ValidateReferencedFiles(
                            manifest,
                            baseDir,
                            LogVerbose
                        );
                        foreach (var err in fileErrors)
                        {
                            var message = err;
                            if (
                                err.Contains(
                                    "path must use '/' as directory separator",
                                    StringComparison.Ordinal
                                )
                            )
                            {
                                message +=
                                    " Run validate --update to normalize manifest asset paths.";
                            }
                            additionalErrors.Add($"ERROR: {message}");
                        }

                        var localizationErrors =
                            ManifestCommandHelpers.ValidateLocalizationCompleteness(
                                manifest,
                                baseDir,
                                rootProps,
                                LogVerbose
                            );
                        foreach (var err in localizationErrors)
                        {
                            additionalErrors.Add($"ERROR: {err}");
                        }

                        if (discover)
                        {
                            LogVerbose("Running discovery to compare manifest capabilities");
                        }
                        void RecordDiscoveryViolation(string message)
                        {
                            if (string.IsNullOrWhiteSpace(message))
                                return;
                            discoveryViolations.Add(message);
                            if (update)
                            {
                                Console.WriteLine(message);
                            }
                            else
                            {
                                LogVerbose(message);
                            }
                        }
                        ManifestCommandHelpers.CapabilityDiscoveryResult? discovery = null;
                        try
                        {
                            discovery = await ManifestCommandHelpers.DiscoverCapabilitiesAsync(
                                baseDir,
                                manifest,
                                message =>
                                {
                                    if (verbose)
                                        Console.WriteLine($"VERBOSE: {message}");
                                    else
                                        Console.WriteLine(message);
                                },
                                warning =>
                                {
                                    if (verbose)
                                        Console.Error.WriteLine($"VERBOSE WARNING: {warning}");
                                    else
                                        Console.Error.WriteLine($"WARNING: {warning}");
                                },
                                userConfigOverrides
                            );
                        }
                        catch (ManifestCommandHelpers.UserConfigRequiredException ex)
                        {
                            additionalErrors.Add($"ERROR: {ex.Message}");
                        }
                        catch (InvalidOperationException ex)
                        {
                            additionalErrors.Add($"ERROR: {ex.Message}");
                        }
                        catch (Exception ex)
                        {
                            additionalErrors.Add($"ERROR: MCP discovery failed: {ex.Message}");
                        }

                        if (discovery != null)
                        {
                            var discoveredTools = discovery.Tools;
                            var discoveredPrompts = discovery.Prompts;
                            var discoveredInitResponse = discovery.InitializeResponse;
                            var discoveredToolsListResponse = discovery.ToolsListResponse;
                            var reportedServerName = discovery.ReportedServerName;
                            var reportedServerVersion = discovery.ReportedServerVersion;

                            if (!string.IsNullOrWhiteSpace(reportedServerName))
                            {
                                var originalManifestName = manifest.Name;
                                if (
                                    !string.Equals(
                                        originalManifestName,
                                        reportedServerName,
                                        StringComparison.Ordinal
                                    )
                                )
                                {
                                    if (update)
                                    {
                                        manifest.Name = reportedServerName;
                                        manifestNameUpdated = true;
                                    }
                                    else
                                    {
                                        discoveryMismatchOccurred = true;
                                        mismatchSummary.Add("server name");
                                        RecordDiscoveryViolation(
                                            $"Server reported name '{reportedServerName}', but manifest name is '{originalManifestName}'. Run validate --update to sync the manifest name."
                                        );
                                    }
                                }
                            }

                            if (!string.IsNullOrWhiteSpace(reportedServerVersion))
                            {
                                var originalVersion = manifest.Version;
                                if (
                                    !string.Equals(
                                        originalVersion,
                                        reportedServerVersion,
                                        StringComparison.Ordinal
                                    )
                                )
                                {
                                    if (update)
                                    {
                                        manifest.Version = reportedServerVersion;
                                        manifestVersionUpdated = true;
                                    }
                                    else
                                    {
                                        discoveryMismatchOccurred = true;
                                        mismatchSummary.Add("server version");
                                        RecordDiscoveryViolation(
                                            $"Server reported version '{reportedServerVersion}', but manifest version is '{originalVersion}'. Run validate --update to sync the version."
                                        );
                                    }
                                }
                            }

                            var sortedDiscoveredTools = discoveredTools
                                .Where(t => !string.IsNullOrWhiteSpace(t.Name))
                                .Select(t => t.Name)
                                .ToList();
                            sortedDiscoveredTools.Sort(StringComparer.Ordinal);

                            var sortedDiscoveredPrompts = discoveredPrompts
                                .Where(p => !string.IsNullOrWhiteSpace(p.Name))
                                .Select(p => p.Name)
                                .ToList();
                            sortedDiscoveredPrompts.Sort(StringComparer.Ordinal);

                            void HandleCapabilityDifferences(
                                ManifestCommandHelpers.CapabilityComparisonResult comparison
                            )
                            {
                                if (!comparison.HasDifferences)
                                    return;
                                discoveryMismatchOccurred = true;
                                foreach (var term in comparison.SummaryTerms)
                                {
                                    mismatchSummary.Add(term);
                                }
                                foreach (var message in comparison.Messages)
                                {
                                    RecordDiscoveryViolation(message);
                                }
                            }

                            var toolComparison = ManifestCommandHelpers.CompareTools(
                                manifest.Tools,
                                discoveredTools
                            );
                            var promptComparison = ManifestCommandHelpers.ComparePrompts(
                                manifest.Prompts,
                                discoveredPrompts
                            );
                            var staticResponseComparison =
                                ManifestCommandHelpers.CompareStaticResponses(
                                    manifest,
                                    discoveredInitResponse,
                                    discoveredToolsListResponse
                                );

                            HandleCapabilityDifferences(toolComparison);
                            HandleCapabilityDifferences(promptComparison);

                            if (staticResponseComparison.HasDifferences)
                            {
                                discoveryMismatchOccurred = true;
                                foreach (var term in staticResponseComparison.SummaryTerms)
                                {
                                    mismatchSummary.Add(term);
                                }
                                foreach (var message in staticResponseComparison.Messages)
                                {
                                    RecordDiscoveryViolation(message);
                                }
                            }

                            var promptWarnings = ManifestCommandHelpers.GetPromptTextWarnings(
                                manifest.Prompts,
                                discoveredPrompts
                            );
                            foreach (var warning in promptWarnings)
                            {
                                Console.Error.WriteLine($"WARNING: {warning}");
                            }

                            bool toolUpdatesApplied = false;
                            bool promptUpdatesApplied = false;
                            bool metaUpdated = false;

                            if (update)
                            {
                                metaUpdated =
                                    ManifestCommandHelpers.ApplyWindowsMetaStaticResponses(
                                        manifest,
                                        discoveredInitResponse,
                                        discoveredToolsListResponse
                                    );

                                if (toolComparison.NamesDiffer || toolComparison.MetadataDiffer)
                                {
                                    manifest.Tools = discoveredTools
                                        .Select(t => new McpbManifestTool
                                        {
                                            Name = t.Name,
                                            Description = t.Description,
                                        })
                                        .ToList();
                                    manifest.ToolsGenerated ??= false;
                                    toolUpdatesApplied = true;
                                }
                                if (promptComparison.NamesDiffer || promptComparison.MetadataDiffer)
                                {
                                    manifest.Prompts = ManifestCommandHelpers.MergePromptMetadata(
                                        manifest.Prompts,
                                        discoveredPrompts
                                    );
                                    manifest.PromptsGenerated ??= false;
                                    promptUpdatesApplied = true;
                                }
                            }

                            if (
                                update
                                && (
                                    toolUpdatesApplied
                                    || promptUpdatesApplied
                                    || metaUpdated
                                    || manifestNameUpdated
                                    || assetPathsNormalized
                                    || manifestVersionUpdated
                                )
                            )
                            {
                                var updatedJson = JsonSerializer.Serialize(
                                    manifest,
                                    McpbJsonContext.WriteOptions
                                );
                                var updatedIssues = ManifestValidator.ValidateJson(updatedJson);
                                var updatedErrors = updatedIssues
                                    .Where(i => i.Severity == ValidationSeverity.Error)
                                    .ToList();
                                var updatedWarnings = updatedIssues
                                    .Where(i => i.Severity == ValidationSeverity.Warning)
                                    .ToList();
                                var updatedManifest = JsonSerializer.Deserialize<McpbManifest>(
                                    updatedJson,
                                    McpbJsonContext.Default.McpbManifest
                                )!;

                                File.WriteAllText(manifestPath, updatedJson);

                                if (updatedErrors.Count > 0)
                                {
                                    Console.Error.WriteLine(
                                        "ERROR: Updated manifest validation failed (updated file written):\n"
                                    );
                                    foreach (var issue in updatedErrors)
                                    {
                                        var pfx = string.IsNullOrEmpty(issue.Path)
                                            ? string.Empty
                                            : issue.Path + ": ";
                                        Console.Error.WriteLine($"  - {pfx}{issue.Message}");
                                    }
                                    PrintWarnings(updatedWarnings, toError: true);
                                    Environment.ExitCode = 1;
                                    return;
                                }

                                var updatedManifestTools =
                                    updatedManifest.Tools?.Select(t => t.Name).ToList()
                                    ?? new List<string>();
                                var updatedManifestPrompts =
                                    updatedManifest.Prompts?.Select(p => p.Name).ToList()
                                    ?? new List<string>();
                                updatedManifestTools.Sort(StringComparer.Ordinal);
                                updatedManifestPrompts.Sort(StringComparer.Ordinal);
                                if (
                                    !updatedManifestTools.SequenceEqual(sortedDiscoveredTools)
                                    || !updatedManifestPrompts.SequenceEqual(
                                        sortedDiscoveredPrompts
                                    )
                                )
                                {
                                    Console.Error.WriteLine(
                                        "ERROR: Updated manifest still differs from discovered capability names (updated file written)."
                                    );
                                    PrintWarnings(updatedWarnings, toError: true);
                                    Environment.ExitCode = 1;
                                    return;
                                }

                                if (
                                    !string.IsNullOrWhiteSpace(reportedServerVersion)
                                    && !string.Equals(
                                        updatedManifest.Version,
                                        reportedServerVersion,
                                        StringComparison.Ordinal
                                    )
                                )
                                {
                                    Console.Error.WriteLine(
                                        "ERROR: Updated manifest version still differs from MCP server version (updated file written)."
                                    );
                                    PrintWarnings(updatedWarnings, toError: true);
                                    Environment.ExitCode = 1;
                                    return;
                                }

                                var remainingToolDiffs =
                                    ManifestCommandHelpers.GetToolMetadataDifferences(
                                        updatedManifest.Tools,
                                        discoveredTools
                                    );
                                var remainingPromptDiffs =
                                    ManifestCommandHelpers.GetPromptMetadataDifferences(
                                        updatedManifest.Prompts,
                                        discoveredPrompts
                                    );
                                if (remainingToolDiffs.Count > 0 || remainingPromptDiffs.Count > 0)
                                {
                                    Console.Error.WriteLine(
                                        "ERROR: Updated manifest metadata still differs from discovered results (updated file written)."
                                    );
                                    PrintWarnings(updatedWarnings, toError: true);
                                    Environment.ExitCode = 1;
                                    return;
                                }

                                if (toolUpdatesApplied || promptUpdatesApplied)
                                {
                                    Console.WriteLine(
                                        "Updated manifest.json capabilities to match discovered results."
                                    );
                                }
                                if (metaUpdated)
                                {
                                    Console.WriteLine(
                                        "Updated manifest.json _meta static_responses to match discovered results."
                                    );
                                }
                                if (manifestNameUpdated)
                                {
                                    Console.WriteLine(
                                        "Updated manifest name to match MCP server name."
                                    );
                                }
                                if (manifestVersionUpdated)
                                {
                                    Console.WriteLine(
                                        "Updated manifest version to match MCP server version."
                                    );
                                }
                                if (assetPathsNormalized)
                                {
                                    Console.WriteLine(
                                        "Normalized manifest asset paths to use forward slashes."
                                    );
                                }

                                manifest = updatedManifest;
                                currentWarnings = new List<ValidationIssue>(updatedWarnings);
                            }
                        }
                    }

                    if (discoveryMismatchOccurred && !update)
                    {
                        foreach (var violation in discoveryViolations)
                        {
                            additionalErrors.Add("ERROR: " + violation);
                        }
                        var summarySuffix =
                            mismatchSummary.Count > 0
                                ? " ("
                                    + string.Join(
                                        ", ",
                                        mismatchSummary.Distinct(StringComparer.Ordinal)
                                    )
                                    + ")"
                                : string.Empty;
                        if (discover)
                        {
                            additionalErrors.Add(
                                "ERROR: Discovered capabilities differ from manifest"
                                    + summarySuffix
                                    + "."
                            );
                        }
                        else
                        {
                            additionalErrors.Add(
                                "ERROR: Discovered capabilities differ from manifest"
                                    + summarySuffix
                                    + ". Use --discover to verify or Use --update to rewrite manifest."
                            );
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
            },
            manifestArg,
            dirnameOpt,
            updateOpt,
            discoverOpt,
            verboseOpt,
            userConfigOpt
        );
        return cmd;
    }

    private static bool NormalizeManifestAssetPaths(McpbManifest manifest)
    {
        bool changed = false;

        static bool LooksLikeAbsolutePath(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return false;
            if (value.Length >= 2 && char.IsLetter(value[0]) && value[1] == ':')
                return true;
            if (
                value.StartsWith("\\\\", StringComparison.Ordinal)
                || value.StartsWith("//", StringComparison.Ordinal)
            )
                return true;
            return false;
        }

        static bool NormalizeRelativePath(ref string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return false;
            if (LooksLikeAbsolutePath(value))
                return false;

            var original = value;
            var trimmed = value.TrimStart('/', '\\');
            if (!string.Equals(trimmed, value, StringComparison.Ordinal))
            {
                value = trimmed;
            }

            var replaced = value.Replace('\\', '/');
            if (!string.Equals(replaced, value, StringComparison.Ordinal))
            {
                value = replaced;
            }

            return !string.Equals(value, original, StringComparison.Ordinal);
        }

        if (!string.IsNullOrWhiteSpace(manifest.Icon))
        {
            var iconPath = manifest.Icon;
            if (NormalizeRelativePath(ref iconPath))
            {
                manifest.Icon = iconPath;
                changed = true;
            }
        }

        if (!string.IsNullOrWhiteSpace(manifest.Server?.EntryPoint))
        {
            var entryPoint = manifest.Server!.EntryPoint;
            if (NormalizeRelativePath(ref entryPoint))
            {
                manifest.Server.EntryPoint = entryPoint;
                changed = true;
            }
        }

        if (manifest.Screenshots != null)
        {
            for (int i = 0; i < manifest.Screenshots.Count; i++)
            {
                var shot = manifest.Screenshots[i];
                if (NormalizeRelativePath(ref shot))
                {
                    manifest.Screenshots[i] = shot;
                    changed = true;
                }
            }
        }

        if (manifest.Icons != null)
        {
            foreach (var icon in manifest.Icons)
            {
                if (icon == null || string.IsNullOrWhiteSpace(icon.Src))
                    continue;
                var src = icon.Src;
                if (NormalizeRelativePath(ref src))
                {
                    icon.Src = src;
                    changed = true;
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(manifest.Localization?.Resources))
        {
            var resources = manifest.Localization!.Resources!;
            if (NormalizeRelativePath(ref resources))
            {
                manifest.Localization.Resources = resources;
                changed = true;
            }
        }

        return changed;
    }
}
