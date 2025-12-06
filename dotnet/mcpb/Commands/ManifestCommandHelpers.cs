using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Mcpb.Core;
using Mcpb.Json;
using ModelContextProtocol;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace Mcpb.Commands;

internal static class ManifestCommandHelpers
{
    private const string WindowsAppAliasDirectoriesEnvVar = "MCPB_WINDOWS_APP_ALIAS_DIRS";
    private static readonly TimeSpan DiscoveryTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan DiscoveryInitializationTimeout = TimeSpan.FromSeconds(15);
    private static readonly IReadOnlyDictionary<
        string,
        IReadOnlyList<string>
    > EmptyUserConfigOverrides = new Dictionary<string, IReadOnlyList<string>>(
        StringComparer.Ordinal
    );
    private static readonly Regex UserConfigTokenRegex = new(
        "\\$\\{user_config\\.([^}]+)\\}",
        RegexOptions.IgnoreCase | RegexOptions.Compiled
    );

    internal sealed class UserConfigRequiredException : InvalidOperationException
    {
        public UserConfigRequiredException(string message)
            : base(message) { }
    }

    internal record CapabilityDiscoveryResult(
        List<McpbManifestTool> Tools,
        List<McpbManifestPrompt> Prompts,
        McpbInitializeResult? InitializeResponse,
        McpbToolsListResult? ToolsListResponse,
        string? ReportedServerName,
        string? ReportedServerVersion
    );

    internal record CapabilityComparisonResult(
        bool NamesDiffer,
        bool MetadataDiffer,
        List<string> SummaryTerms,
        List<string> Messages
    )
    {
        public bool HasDifferences => NamesDiffer || MetadataDiffer;
    }

    internal record StaticResponseComparisonResult(
        bool InitializeDiffers,
        bool ToolsListDiffers,
        List<string> SummaryTerms,
        List<string> Messages
    )
    {
        public bool HasDifferences => InitializeDiffers || ToolsListDiffers;
    }

    /// <summary>
    /// Recursively filters out null properties from a JsonElement to match JsonIgnoreCondition.WhenWritingNull behavior
    /// </summary>
    private static object FilterNullProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var dict = new Dictionary<string, object>();
            foreach (var property in element.EnumerateObject())
            {
                if (property.Value.ValueKind != JsonValueKind.Null)
                {
                    dict[property.Name] = FilterNullProperties(property.Value);
                }
            }
            return dict;
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            var list = new List<object>();
            foreach (var item in element.EnumerateArray())
            {
                list.Add(FilterNullProperties(item));
            }
            return list;
        }
        else if (element.ValueKind == JsonValueKind.String)
        {
            return element.GetString() ?? "";
        }
        else if (element.ValueKind == JsonValueKind.Number)
        {
            if (element.TryGetInt64(out var longValue))
                return longValue;
            return element.GetDouble();
        }
        else if (element.ValueKind == JsonValueKind.True)
        {
            return true;
        }
        else if (element.ValueKind == JsonValueKind.False)
        {
            return false;
        }
        else
        {
            // For other types, convert to JsonElement
            var json = JsonSerializer.Serialize(element);
            return JsonSerializer.Deserialize<JsonElement>(json);
        }
    }

    internal static List<string> ValidateReferencedFiles(
        McpbManifest manifest,
        string baseDir,
        Action<string>? verboseLog = null
    )
    {
        var errors = new List<string>();
        if (manifest.Server == null)
        {
            errors.Add("Manifest server configuration missing");
            return errors;
        }

        verboseLog?.Invoke("Checking referenced files and assets");

        static bool IsSystem32Path(string value, out string normalizedAbsolute)
        {
            normalizedAbsolute = string.Empty;
            if (string.IsNullOrWhiteSpace(value))
                return false;
            try
            {
                var windowsDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                if (string.IsNullOrWhiteSpace(windowsDir))
                    return false;
                var candidate = value.Replace('/', '\\');
                if (!Path.IsPathRooted(candidate))
                    return false;
                var full = Path.GetFullPath(candidate);
                var system32 = Path.Combine(windowsDir, "System32");
                if (full.StartsWith(system32, StringComparison.OrdinalIgnoreCase))
                {
                    normalizedAbsolute = full;
                    return true;
                }
            }
            catch
            {
                return false;
            }
            return false;
        }

        bool TryResolveManifestPath(string rawPath, string category, out string resolved)
        {
            resolved = string.Empty;
            if (IsSystem32Path(rawPath, out var systemPath))
            {
                resolved = systemPath;
                return true;
            }

            if (rawPath.StartsWith('/') || rawPath.StartsWith('\\'))
            {
                errors.Add($"{category} path must be relative and use '/' separators: {rawPath}");
                return false;
            }
            if (Path.IsPathRooted(rawPath))
            {
                errors.Add(
                    $"{category} path must be relative or reside under Windows\\System32: {rawPath}"
                );
                return false;
            }
            if (rawPath.Contains('\\'))
            {
                errors.Add($"{category} path must use '/' as directory separator: {rawPath}");
                return false;
            }

            resolved = Resolve(rawPath);
            return true;
        }

        string Resolve(string rel)
        {
            var normalized = rel.Replace('\\', '/');
            if (Path.IsPathRooted(normalized))
            {
                return normalized.Replace('/', Path.DirectorySeparatorChar);
            }
            return Path.Combine(baseDir, normalized.Replace('/', Path.DirectorySeparatorChar));
        }

        void CheckFile(string? relativePath, string category, bool allowAliasResolution = false)
        {
            if (string.IsNullOrWhiteSpace(relativePath))
                return;
            if (!TryResolveManifestPath(relativePath, category, out var resolved))
            {
                return;
            }
            verboseLog?.Invoke($"Ensuring {category} file exists: {relativePath} -> {resolved}");
            if (!File.Exists(resolved))
            {
                var trimmed = relativePath.Trim();
                if (
                    allowAliasResolution
                    && TryResolveWindowsAppExecutionAlias(trimmed, out var aliasPath)
                )
                {
                    verboseLog?.Invoke(
                        $"Resolved {category} '{trimmed}' via Windows app execution alias: {aliasPath}"
                    );
                }
                else
                {
                    errors.Add($"Missing {category} file: {relativePath}");
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(manifest.Icon))
        {
            CheckFile(manifest.Icon, "icon");
        }

        if (!string.IsNullOrWhiteSpace(manifest.Server.EntryPoint))
        {
            verboseLog?.Invoke($"Checking server entry point {manifest.Server.EntryPoint}");
            CheckFile(manifest.Server.EntryPoint, "entry_point", allowAliasResolution: true);
        }

        var command = manifest.Server.McpConfig?.Command;
        if (!string.IsNullOrWhiteSpace(command))
        {
            var cmd = command!;
            verboseLog?.Invoke($"Resolving server command {cmd}");
            bool pathLike = IsCommandPathLike(cmd);
            if (pathLike)
            {
                var expanded = ExpandToken(cmd, baseDir);
                var normalized = NormalizePathForPlatform(expanded);
                var resolved = normalized;
                if (!Path.IsPathRooted(normalized))
                {
                    resolved = Path.Combine(baseDir, normalized);
                }
                verboseLog?.Invoke($"Ensuring server command file exists: {resolved}");
                if (!File.Exists(resolved))
                {
                    if (TryResolveWindowsAppExecutionAlias(cmd, out var aliasPath))
                    {
                        verboseLog?.Invoke(
                            $"Resolved server command '{cmd}' via Windows app execution alias: {aliasPath}"
                        );
                    }
                    else
                    {
                        errors.Add($"Missing server.command file: {command}");
                    }
                }
            }
        }

        if (manifest.Screenshots != null)
        {
            foreach (var shot in manifest.Screenshots)
            {
                if (string.IsNullOrWhiteSpace(shot))
                    continue;
                verboseLog?.Invoke($"Checking screenshot {shot}");
                CheckFile(shot, "screenshot");
            }
        }

        if (manifest.Icons != null)
        {
            for (int i = 0; i < manifest.Icons.Count; i++)
            {
                var icon = manifest.Icons[i];
                if (!string.IsNullOrWhiteSpace(icon.Src))
                {
                    verboseLog?.Invoke($"Checking icon {icon.Src}");
                    CheckFile(icon.Src, $"icons[{i}]");
                }
            }
        }

        if (manifest.Localization != null)
        {
            // Check if the localization resources path exists
            // Resources defaults to "mcpb-resources/${locale}.json" if not specified
            var resourcePath = manifest.Localization.Resources ?? "mcpb-resources/${locale}.json";
            // DefaultLocale defaults to "en-US" if not specified
            var defaultLocale = manifest.Localization.DefaultLocale ?? "en-US";

            var defaultLocalePath = resourcePath.Replace(
                "${locale}",
                defaultLocale,
                StringComparison.OrdinalIgnoreCase
            );
            var resolved = Resolve(defaultLocalePath);
            verboseLog?.Invoke(
                $"Ensuring localization resources exist for default locale at {resolved}"
            );

            // Check if it's a file or directory
            if (!File.Exists(resolved) && !Directory.Exists(resolved))
            {
                errors.Add(
                    $"Missing localization resources for default locale: {defaultLocalePath}"
                );
            }
        }

        return errors;
    }

    private static bool TryResolveWindowsAppExecutionAlias(
        string? candidate,
        out string resolvedPath
    )
    {
        resolvedPath = string.Empty;
        if (string.IsNullOrWhiteSpace(candidate))
            return false;

        var trimmed = candidate.Trim();
        if (trimmed.Length == 0)
            return false;

        if (
            trimmed.IndexOf('/') >= 0
            || trimmed.IndexOf('\\') >= 0
            || !trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
        )
        {
            return false;
        }

        foreach (var directory in EnumerateWindowsAppAliasDirectories())
        {
            try
            {
                var path = Path.Combine(directory, trimmed);
                if (File.Exists(path))
                {
                    resolvedPath = path;
                    return true;
                }
            }
            catch
            {
                // Ignore issues accessing alias directories
            }
        }

        return false;
    }

    private static IEnumerable<string> EnumerateWindowsAppAliasDirectories()
    {
        var overrideValue = Environment.GetEnvironmentVariable(WindowsAppAliasDirectoriesEnvVar);
        var reported = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string? path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return;
            try
            {
                var full = Path.GetFullPath(path);
                if (!Directory.Exists(full))
                    return;
                full = full.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                if (reported.Add(full))
                {
                    // nothing else to do
                }
            }
            catch
            {
                // Ignore invalid directories
            }
        }

        if (!string.IsNullOrWhiteSpace(overrideValue))
        {
            var splits = overrideValue.Split(
                Path.PathSeparator,
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
            );
            foreach (var part in splits)
            {
                Add(part);
            }
        }
        else if (OperatingSystem.IsWindows())
        {
            var localAppData = Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData
            );
            if (!string.IsNullOrWhiteSpace(localAppData))
            {
                Add(Path.Combine(localAppData, "Microsoft", "WindowsApps"));
            }
        }

        foreach (var dir in reported)
        {
            yield return dir;
        }
    }

    private static bool IsCommandPathLike(string command)
    {
        if (string.IsNullOrWhiteSpace(command))
            return false;
        var trimmed = command.Trim();
        return trimmed.Contains('/')
            || trimmed.Contains('\\')
            || trimmed.StartsWith("${__dirname}", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("./")
            || trimmed.StartsWith("..")
            || trimmed.EndsWith(".js", StringComparison.OrdinalIgnoreCase)
            || trimmed.EndsWith(".py", StringComparison.OrdinalIgnoreCase)
            || trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase);
    }

    internal static List<string> ValidateLocalizationCompleteness(
        McpbManifest manifest,
        string baseDir,
        HashSet<string>? rootProps = null,
        Action<string>? verboseLog = null
    )
    {
        var errors = new List<string>();

        if (manifest.Localization == null)
            return errors;

        verboseLog?.Invoke("Checking localization completeness across locales");

        // Get the resource path pattern and default locale
        var resourcePath = manifest.Localization.Resources ?? "mcpb-resources/${locale}.json";
        var defaultLocale = manifest.Localization.DefaultLocale ?? "en-US";

        // Determine localizable properties present in the manifest
        // Only check properties that were explicitly set in the JSON
        var localizableProperties = new List<string>();
        if (rootProps != null)
        {
            if (
                rootProps.Contains("display_name")
                && !string.IsNullOrWhiteSpace(manifest.DisplayName)
            )
                localizableProperties.Add("display_name");
            if (
                rootProps.Contains("description")
                && !string.IsNullOrWhiteSpace(manifest.Description)
            )
                localizableProperties.Add("description");
            if (
                rootProps.Contains("long_description")
                && !string.IsNullOrWhiteSpace(manifest.LongDescription)
            )
                localizableProperties.Add("long_description");
            if (rootProps.Contains("author") && !string.IsNullOrWhiteSpace(manifest.Author?.Name))
                localizableProperties.Add("author.name");
            if (
                rootProps.Contains("keywords")
                && manifest.Keywords != null
                && manifest.Keywords.Count > 0
            )
                localizableProperties.Add("keywords");
        }
        else
        {
            // Fallback if rootProps not provided
            if (!string.IsNullOrWhiteSpace(manifest.DisplayName))
                localizableProperties.Add("display_name");
            if (!string.IsNullOrWhiteSpace(manifest.Description))
                localizableProperties.Add("description");
            if (!string.IsNullOrWhiteSpace(manifest.LongDescription))
                localizableProperties.Add("long_description");
            if (!string.IsNullOrWhiteSpace(manifest.Author?.Name))
                localizableProperties.Add("author.name");
            if (manifest.Keywords != null && manifest.Keywords.Count > 0)
                localizableProperties.Add("keywords");
        }

        // Also check tool and prompt descriptions
        var toolsWithDescriptions =
            manifest.Tools?.Where(t => !string.IsNullOrWhiteSpace(t.Description)).ToList()
            ?? new List<McpbManifestTool>();
        var promptsWithDescriptions =
            manifest.Prompts?.Where(p => !string.IsNullOrWhiteSpace(p.Description)).ToList()
            ?? new List<McpbManifestPrompt>();

        if (
            localizableProperties.Count == 0
            && toolsWithDescriptions.Count == 0
            && promptsWithDescriptions.Count == 0
        )
            return errors; // Nothing to localize

        // Find all locale files by scanning the directory pattern
        var localeFiles = FindLocaleFiles(resourcePath, baseDir, defaultLocale);

        if (localeFiles.Count == 0)
            return errors; // No additional locale files found, nothing to validate

        // Check each locale file for completeness
        foreach (var (locale, filePath) in localeFiles)
        {
            if (locale == defaultLocale)
                continue; // Skip default locale (values are in main manifest)

            verboseLog?.Invoke($"Validating localization file {filePath} for locale {locale}");
            try
            {
                if (!File.Exists(filePath))
                {
                    errors.Add($"Locale file not found: {filePath} (for locale {locale})");
                    continue;
                }

                var localeJson = File.ReadAllText(filePath);
                var localeResource = JsonSerializer.Deserialize<McpbLocalizationResource>(
                    localeJson,
                    McpbJsonContext.Default.McpbLocalizationResource
                );

                if (localeResource == null)
                {
                    errors.Add($"Failed to parse locale file: {filePath}");
                    continue;
                }

                // Check for localizable properties
                foreach (var prop in localizableProperties)
                {
                    var isMissing = prop switch
                    {
                        "display_name" => string.IsNullOrWhiteSpace(localeResource.DisplayName),
                        "description" => string.IsNullOrWhiteSpace(localeResource.Description),
                        "long_description" => string.IsNullOrWhiteSpace(
                            localeResource.LongDescription
                        ),
                        "author.name" => localeResource.Author == null
                            || string.IsNullOrWhiteSpace(localeResource.Author.Name),
                        "keywords" => localeResource.Keywords == null
                            || localeResource.Keywords.Count == 0,
                        _ => false,
                    };

                    if (isMissing)
                    {
                        errors.Add($"Missing localization for '{prop}' in {locale} ({filePath})");
                    }
                }

                // Check tool descriptions
                if (toolsWithDescriptions.Count > 0)
                {
                    var localizedTools =
                        localeResource.Tools ?? new List<McpbLocalizationResourceTool>();
                    foreach (var tool in toolsWithDescriptions)
                    {
                        var found = localizedTools.Any(t =>
                            t.Name == tool.Name && !string.IsNullOrWhiteSpace(t.Description)
                        );

                        if (!found)
                        {
                            errors.Add(
                                $"Missing localized description for tool '{tool.Name}' in {locale} ({filePath})"
                            );
                        }
                    }
                }

                // Check prompt descriptions
                if (promptsWithDescriptions.Count > 0)
                {
                    var localizedPrompts =
                        localeResource.Prompts ?? new List<McpbLocalizationResourcePrompt>();
                    foreach (var prompt in promptsWithDescriptions)
                    {
                        verboseLog?.Invoke(
                            $"Ensuring prompt '{prompt.Name}' has localized content in {locale}"
                        );
                        var found = localizedPrompts.Any(p =>
                            p.Name == prompt.Name && !string.IsNullOrWhiteSpace(p.Description)
                        );

                        if (!found)
                        {
                            errors.Add(
                                $"Missing localized description for prompt '{prompt.Name}' in {locale} ({filePath})"
                            );
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                errors.Add($"Error reading locale file {filePath}: {ex.Message}");
            }
        }

        return errors;
    }

    private static List<(string locale, string filePath)> FindLocaleFiles(
        string resourcePattern,
        string baseDir,
        string defaultLocale
    )
    {
        var localeFiles = new List<(string, string)>();

        // Extract the directory and file pattern
        var patternIndex = resourcePattern.IndexOf("${locale}", StringComparison.OrdinalIgnoreCase);
        if (patternIndex < 0)
            return localeFiles;

        var beforePlaceholder = resourcePattern.Substring(0, patternIndex);
        var afterPlaceholder = resourcePattern.Substring(patternIndex + "${locale}".Length);

        var lastSlash = beforePlaceholder.LastIndexOfAny(new[] { '/', '\\' });
        string dirPath,
            filePrefix;

        if (lastSlash >= 0)
        {
            dirPath = beforePlaceholder.Substring(0, lastSlash);
            filePrefix = beforePlaceholder.Substring(lastSlash + 1);
        }
        else
        {
            dirPath = "";
            filePrefix = beforePlaceholder;
        }

        var fullDirPath = string.IsNullOrEmpty(dirPath)
            ? baseDir
            : Path.Combine(baseDir, dirPath.Replace('/', Path.DirectorySeparatorChar));

        if (!Directory.Exists(fullDirPath))
            return localeFiles;

        // Find all files matching the pattern
        var searchPattern = filePrefix + "*" + afterPlaceholder;
        var files = Directory.GetFiles(fullDirPath, searchPattern, SearchOption.TopDirectoryOnly);

        foreach (var file in files)
        {
            var fileName = Path.GetFileName(file);

            // Extract locale from filename
            if (fileName.StartsWith(filePrefix) && fileName.EndsWith(afterPlaceholder))
            {
                var localeStart = filePrefix.Length;
                var localeEnd = fileName.Length - afterPlaceholder.Length;
                if (localeEnd > localeStart)
                {
                    var locale = fileName.Substring(localeStart, localeEnd - localeStart);
                    localeFiles.Add((locale, file));
                }
            }
        }

        return localeFiles;
    }

    internal static async Task<CapabilityDiscoveryResult> DiscoverCapabilitiesAsync(
        string dir,
        McpbManifest manifest,
        Action<string>? logInfo,
        Action<string>? logWarning,
        IReadOnlyDictionary<string, IReadOnlyList<string>>? userConfigOverrides = null
    )
    {
        var overrideTools = TryParseToolOverride("MCPB_TOOL_DISCOVERY_JSON");
        var overridePrompts = TryParsePromptOverride("MCPB_PROMPT_DISCOVERY_JSON");
        var overrideInitialize = TryParseInitializeOverride("MCPB_INITIALIZE_DISCOVERY_JSON");
        var overrideToolsList = TryParseToolsListOverride("MCPB_TOOLS_LIST_DISCOVERY_JSON");
        if (
            overrideTools != null
            || overridePrompts != null
            || overrideInitialize != null
            || overrideToolsList != null
        )
        {
            return new CapabilityDiscoveryResult(
                overrideTools ?? new List<McpbManifestTool>(),
                overridePrompts ?? new List<McpbManifestPrompt>(),
                overrideInitialize,
                overrideToolsList,
                null,
                null
            );
        }

        var cfg =
            manifest.Server?.McpConfig
            ?? throw new InvalidOperationException("Manifest server.mcp_config missing");
        var command = cfg.Command;
        if (string.IsNullOrWhiteSpace(command))
            throw new InvalidOperationException("Manifest server.mcp_config.command empty");
        var rawArgs = cfg.Args ?? new List<string>();
        var providedUserConfig = userConfigOverrides ?? EmptyUserConfigOverrides;
        EnsureRequiredUserConfigProvided(manifest, command, rawArgs, providedUserConfig);

        var originalCommand = command;
        command = ExpandToken(command, dir, providedUserConfig);
        var args = new List<string>();
        foreach (var rawArg in rawArgs)
        {
            foreach (var expanded in ExpandArgumentValues(rawArg, dir, providedUserConfig))
            {
                if (!string.IsNullOrWhiteSpace(expanded))
                {
                    args.Add(expanded);
                }
            }
        }
        command = NormalizePathForPlatform(command);
        for (int i = 0; i < args.Count; i++)
            args[i] = NormalizePathForPlatform(args[i]);

        if (IsCommandPathLike(originalCommand))
        {
            var resolved = command;
            if (!Path.IsPathRooted(resolved))
            {
                resolved = Path.Combine(dir, resolved);
            }

            if (File.Exists(resolved))
            {
                command = resolved;
            }
            else if (TryResolveWindowsAppExecutionAlias(originalCommand, out var aliasPath))
            {
                logInfo?.Invoke(
                    $"Resolved server command '{originalCommand}' via Windows app execution alias: {aliasPath}"
                );
                command = aliasPath;
            }
            else
            {
                throw new InvalidOperationException(
                    $"Unable to locate server.mcp_config.command executable: {originalCommand}"
                );
            }
        }

        Dictionary<string, string>? env = null;
        if (cfg.Env != null && cfg.Env.Count > 0)
        {
            env = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var kv in cfg.Env)
            {
                var expanded = ExpandToken(kv.Value, dir, providedUserConfig);
                env[kv.Key] = NormalizePathForPlatform(expanded);
            }
        }

        var toolInfos = new List<McpbManifestTool>();
        var promptInfos = new List<McpbManifestPrompt>();
        McpbInitializeResult? initializeResponse = null;
        McpbToolsListResult? toolsListResponse = null;
        var clientCreated = false;
        string? reportedServerName = null;
        string? reportedServerVersion = null;
        bool supportsToolsList = true;
        bool supportsPromptsList = true;
        try
        {
            using var cts = new CancellationTokenSource(DiscoveryTimeout);
            IDictionary<string, string?>? envVars = null;
            if (env != null)
            {
                envVars = new Dictionary<string, string?>(
                    env.ToDictionary(kv => kv.Key, kv => (string?)kv.Value),
                    StringComparer.OrdinalIgnoreCase
                );
            }

            var transport = new StdioClientTransport(
                new StdioClientTransportOptions
                {
                    Name = "mcpb-discovery",
                    Command = command,
                    Arguments = args.ToArray(),
                    WorkingDirectory = dir,
                    EnvironmentVariables = envVars,
                }
            );
            logInfo?.Invoke(
                $"Discovering tools & prompts using: {command} {string.Join(' ', args)}"
            );
            ValueTask HandleServerLog(JsonRpcNotification notification, CancellationToken token)
            {
                if (notification.Params is null)
                {
                    return ValueTask.CompletedTask;
                }

                try
                {
                    var logParams =
                        notification.Params.Deserialize<LoggingMessageNotificationParams>();
                    if (logParams == null)
                    {
                        return ValueTask.CompletedTask;
                    }

                    string? message = null;
                    if (logParams.Data is JsonElement dataElement)
                    {
                        if (dataElement.ValueKind == JsonValueKind.String)
                        {
                            message = dataElement.GetString();
                        }
                        else if (
                            dataElement.ValueKind != JsonValueKind.Null
                            && dataElement.ValueKind != JsonValueKind.Undefined
                        )
                        {
                            message = dataElement.ToString();
                        }
                    }

                    var loggerName = string.IsNullOrWhiteSpace(logParams.Logger)
                        ? "server"
                        : logParams.Logger;
                    var text = string.IsNullOrWhiteSpace(message)
                        ? "(no details provided)"
                        : message!;
                    var formatted = $"[{loggerName}] {text}";
                    if (logParams.Level >= LoggingLevel.Error)
                    {
                        logWarning?.Invoke($"MCP server error: {formatted}");
                    }
                    else if (logParams.Level >= LoggingLevel.Warning)
                    {
                        logWarning?.Invoke($"MCP server warning: {formatted}");
                    }
                    else
                    {
                        logInfo?.Invoke($"MCP server log ({logParams.Level}): {formatted}");
                    }
                }
                catch (Exception ex)
                {
                    logWarning?.Invoke(
                        $"Failed to process MCP server log notification: {ex.Message}"
                    );
                }

                return ValueTask.CompletedTask;
            }

            var clientOptions = new McpClientOptions
            {
                InitializationTimeout = DiscoveryInitializationTimeout,
                Handlers = new McpClientHandlers
                {
                    NotificationHandlers = new[]
                    {
                        new KeyValuePair<
                            string,
                            Func<JsonRpcNotification, CancellationToken, ValueTask>
                        >(NotificationMethods.LoggingMessageNotification, HandleServerLog),
                    },
                },
            };

            await using var client = await McpClient.CreateAsync(
                transport,
                clientOptions,
                cancellationToken: cts.Token
            );
            reportedServerName = client.ServerInfo?.Name;
            reportedServerVersion = client.ServerInfo?.Version;
            clientCreated = true;

            // Capture initialize response using McpClient properties
            // Filter out null properties to match JsonIgnoreCondition.WhenWritingNull behavior
            try
            {
                // Serialize and filter capabilities
                object? capabilities = null;
                JsonElement capabilitiesElement = default;
                bool hasCapabilitiesElement = false;
                if (client.ServerCapabilities != null)
                {
                    var capJson = JsonSerializer.Serialize(client.ServerCapabilities);
                    var capElement = JsonSerializer.Deserialize<JsonElement>(capJson);
                    capabilitiesElement = capElement;
                    hasCapabilitiesElement = true;
                    capabilities = FilterNullProperties(capElement);
                }

                if (hasCapabilitiesElement)
                {
                    supportsToolsList = SupportsCapability(capabilitiesElement, "tools");
                    supportsPromptsList = SupportsCapability(capabilitiesElement, "prompts");
                }

                // Serialize and filter serverInfo
                object? serverInfo = null;
                if (client.ServerInfo != null)
                {
                    var infoJson = JsonSerializer.Serialize(client.ServerInfo);
                    var infoElement = JsonSerializer.Deserialize<JsonElement>(infoJson);
                    serverInfo = FilterNullProperties(infoElement);
                }

                var instructions = string.IsNullOrWhiteSpace(client.ServerInstructions)
                    ? null
                    : client.ServerInstructions;

                initializeResponse = new McpbInitializeResult
                {
                    ProtocolVersion = client.NegotiatedProtocolVersion,
                    Capabilities = capabilities,
                    ServerInfo = serverInfo,
                    Instructions = instructions,
                };
            }
            catch (Exception ex)
            {
                logWarning?.Invoke($"Failed to capture initialize response: {ex.Message}");
            }

            try
            {
                await client.PingAsync(cts.Token);
            }
            catch (OperationCanceledException)
            {
                logWarning?.Invoke(
                    "MCP server ping timed out during discovery; aborting capability checks."
                );
                return new CapabilityDiscoveryResult(
                    DeduplicateTools(toolInfos),
                    DeduplicatePrompts(promptInfos),
                    initializeResponse,
                    toolsListResponse,
                    reportedServerName,
                    reportedServerVersion
                );
            }
            catch (Exception ex)
            {
                if (ex is McpException)
                {
                    LogMcpFailure("ping", ex, logWarning);
                }
                else
                {
                    logWarning?.Invoke($"MCP server ping failed during discovery: {ex.Message}");
                }

                return new CapabilityDiscoveryResult(
                    DeduplicateTools(toolInfos),
                    DeduplicatePrompts(promptInfos),
                    initializeResponse,
                    toolsListResponse,
                    reportedServerName,
                    reportedServerVersion
                );
            }

            IList<McpClientTool>? tools = null;
            if (supportsToolsList)
            {
                try
                {
                    tools = await client.ListToolsAsync(null, cts.Token);
                }
                catch (OperationCanceledException)
                {
                    logWarning?.Invoke("tools/list request timed out during discovery.");
                }
                catch (Exception ex)
                {
                    if (ex is McpException)
                    {
                        LogMcpFailure("tools/list", ex, logWarning);
                    }
                    else
                    {
                        logWarning?.Invoke($"tools/list request failed: {ex.Message}");
                    }
                }
            }
            else
            {
                logInfo?.Invoke(
                    "Server capabilities did not include 'tools'; skipping tools/list request."
                );
            }

            if (tools != null)
            {
                // Capture tools/list response using typed Tool objects
                // Filter out null properties to match JsonIgnoreCondition.WhenWritingNull behavior
                try
                {
                    var toolsList = new List<object>();
                    foreach (var tool in tools)
                    {
                        // Serialize the tool and parse to JsonElement
                        var json = JsonSerializer.Serialize(tool.ProtocolTool);
                        var element = JsonSerializer.Deserialize<JsonElement>(json);

                        // Filter out null properties recursively
                        var filtered = FilterNullProperties(element);
                        toolsList.Add(filtered);
                    }
                    toolsListResponse = new McpbToolsListResult { Tools = toolsList };
                }
                catch (Exception ex)
                {
                    logWarning?.Invoke($"Failed to capture tools/list response: {ex.Message}");
                }

                foreach (var tool in tools)
                {
                    if (string.IsNullOrWhiteSpace(tool.Name))
                        continue;
                    var manifestTool = new McpbManifestTool
                    {
                        Name = tool.Name,
                        Description = string.IsNullOrWhiteSpace(tool.Description)
                            ? null
                            : tool.Description,
                    };
                    toolInfos.Add(manifestTool);
                }
            }
            IList<McpClientPrompt>? prompts = null;
            if (supportsPromptsList)
            {
                try
                {
                    prompts = await client.ListPromptsAsync(cts.Token);
                }
                catch (OperationCanceledException)
                {
                    logWarning?.Invoke("prompt list request timed out during discovery.");
                }
                catch (Exception ex)
                {
                    if (ex is McpException)
                    {
                        LogMcpFailure("prompts/list", ex, logWarning);
                    }
                    else
                    {
                        logWarning?.Invoke($"Prompt discovery skipped: {ex.Message}");
                    }
                }
            }
            else
            {
                logInfo?.Invoke(
                    "Server capabilities did not include 'prompts'; skipping prompts/list request."
                );
            }

            if (prompts != null)
            {
                foreach (var prompt in prompts)
                {
                    if (string.IsNullOrWhiteSpace(prompt.Name))
                        continue;
                    var manifestPrompt = new McpbManifestPrompt
                    {
                        Name = prompt.Name,
                        Description = string.IsNullOrWhiteSpace(prompt.Description)
                            ? null
                            : prompt.Description,
                        Arguments = prompt
                            .ProtocolPrompt?.Arguments?.Select(a => a.Name)
                            .Where(n => !string.IsNullOrWhiteSpace(n))
                            .Distinct(StringComparer.Ordinal)
                            .ToList(),
                    };
                    if (manifestPrompt.Arguments != null && manifestPrompt.Arguments.Count == 0)
                    {
                        manifestPrompt.Arguments = null;
                    }
                    try
                    {
                        var promptResult = await client.GetPromptAsync(
                            prompt.Name,
                            cancellationToken: cts.Token
                        );
                        manifestPrompt.Text = ExtractPromptText(promptResult);
                    }
                    catch (OperationCanceledException)
                    {
                        logWarning?.Invoke(
                            $"Prompt '{prompt.Name}' content fetch timed out during discovery."
                        );
                        manifestPrompt.Text = string.Empty;
                    }
                    catch (Exception ex)
                    {
                        if (ex is McpException)
                        {
                            LogMcpFailure($"prompt content fetch '{prompt.Name}'", ex, logWarning);
                        }
                        else
                        {
                            logWarning?.Invoke(
                                $"Prompt '{prompt.Name}' content fetch failed: {ex.Message}"
                            );
                        }
                        manifestPrompt.Text = string.Empty;
                    }
                    promptInfos.Add(manifestPrompt);
                }
            }
        }
        catch (OperationCanceledException) when (clientCreated)
        {
            logWarning?.Invoke("MCP client discovery timed out.");
        }
        catch (Exception ex) when (clientCreated)
        {
            if (ex is McpException)
            {
                LogMcpFailure("discovery", ex, logWarning);
            }
            else
            {
                logWarning?.Invoke($"MCP client discovery failed: {ex.Message}");
            }
        }

        return new CapabilityDiscoveryResult(
            DeduplicateTools(toolInfos),
            DeduplicatePrompts(promptInfos),
            initializeResponse,
            toolsListResponse,
            reportedServerName,
            reportedServerVersion
        );
    }

    private static void LogMcpFailure(string operation, Exception ex, Action<string>? logWarning)
    {
        var details = FormatMcpError(ex);
        logWarning?.Invoke($"MCP server error during {operation}: {details}");
    }

    private static bool SupportsCapability(JsonElement capabilitiesElement, string capabilityName)
    {
        if (capabilitiesElement.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        foreach (var property in capabilitiesElement.EnumerateObject())
        {
            if (string.Equals(property.Name, capabilityName, StringComparison.OrdinalIgnoreCase))
            {
                var kind = property.Value.ValueKind;
                return kind != JsonValueKind.Null && kind != JsonValueKind.Undefined;
            }
        }

        return false;
    }

    private static string FormatMcpError(Exception ex)
    {
        if (ex is McpException)
        {
            var message = ex.Message;
            var type = ex.GetType();
            if (
                string.Equals(
                    type.FullName,
                    "ModelContextProtocol.McpProtocolException",
                    StringComparison.Ordinal
                )
            )
            {
                var errorCodeProperty = type.GetProperty("ErrorCode");
                if (errorCodeProperty?.GetValue(ex) is Enum errorCode)
                {
                    message += $" (code {Convert.ToInt32(errorCode)} {errorCode})";
                }
            }

            return message;
        }

        return ex.Message;
    }

    internal static string NormalizePathForPlatform(string value)
    {
        if (string.IsNullOrEmpty(value))
            return value;
        if (value.Contains("://"))
            return value;
        if (value.StartsWith("-"))
            return value;
        var sep = Path.DirectorySeparatorChar;
        return value.Replace('\\', sep).Replace('/', sep);
    }

    internal static string ExpandToken(
        string value,
        string dir,
        IReadOnlyDictionary<string, IReadOnlyList<string>>? userConfigOverrides = null
    )
    {
        if (string.IsNullOrEmpty(value))
            return value;
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string desktop = SafeGetSpecial(
            Environment.SpecialFolder.Desktop,
            Path.Combine(home, "Desktop")
        );
        string documents = SafeGetSpecial(
            Environment.SpecialFolder.MyDocuments,
            Path.Combine(home, "Documents")
        );
        string downloads = Path.Combine(home, "Downloads");
        string sep = Path.DirectorySeparatorChar.ToString();
        var overrides = userConfigOverrides ?? EmptyUserConfigOverrides;
        return Regex.Replace(
            value,
            "\\$\\{([^}]+)\\}",
            m =>
            {
                var token = m.Groups[1].Value;
                if (string.Equals(token, "__dirname", StringComparison.OrdinalIgnoreCase))
                    return dir.Replace('\\', '/');
                if (string.Equals(token, "HOME", StringComparison.OrdinalIgnoreCase))
                    return home;
                if (string.Equals(token, "DESKTOP", StringComparison.OrdinalIgnoreCase))
                    return desktop;
                if (string.Equals(token, "DOCUMENTS", StringComparison.OrdinalIgnoreCase))
                    return documents;
                if (string.Equals(token, "DOWNLOADS", StringComparison.OrdinalIgnoreCase))
                    return downloads;
                if (
                    string.Equals(token, "pathSeparator", StringComparison.OrdinalIgnoreCase)
                    || token == "/"
                )
                    return sep;
                if (token.StartsWith("user_config.", StringComparison.OrdinalIgnoreCase))
                {
                    var key = token.Substring("user_config.".Length);
                    if (
                        overrides.TryGetValue(key, out var provided)
                        && provided != null
                        && provided.Count > 0
                    )
                    {
                        return provided[0] ?? string.Empty;
                    }
                    return string.Empty;
                }
                return m.Value;
            }
        );
    }

    private static IEnumerable<string> ExpandArgumentValues(
        string value,
        string dir,
        IReadOnlyDictionary<string, IReadOnlyList<string>> userConfigOverrides
    )
    {
        if (string.IsNullOrWhiteSpace(value))
            yield break;

        if (
            TryGetStandaloneUserConfigKey(value, out var key)
            && userConfigOverrides.TryGetValue(key, out var values)
            && values != null
            && values.Count > 0
        )
        {
            foreach (var userValue in values)
            {
                yield return userValue ?? string.Empty;
            }
            yield break;
        }

        yield return ExpandToken(value, dir, userConfigOverrides);
    }

    private static bool TryGetStandaloneUserConfigKey(string value, out string key)
    {
        key = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var trimmed = value.Trim();
        if (!string.Equals(trimmed, value, StringComparison.Ordinal))
            return false;

        const string prefix = "${user_config.";
        const string suffix = "}";
        if (
            !trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            || !trimmed.EndsWith(suffix, StringComparison.Ordinal)
        )
            return false;

        var innerLength = trimmed.Length - prefix.Length - suffix.Length;
        if (innerLength <= 0)
            return false;

        key = trimmed.Substring(prefix.Length, innerLength);
        return true;
    }

    private static void EnsureRequiredUserConfigProvided(
        McpbManifest manifest,
        string command,
        IEnumerable<string> args,
        IReadOnlyDictionary<string, IReadOnlyList<string>> providedUserConfig
    )
    {
        if (manifest.UserConfig == null || manifest.UserConfig.Count == 0)
            return;

        var referenced = new HashSet<string>(StringComparer.Ordinal);
        AddUserConfigReferences(command, referenced);
        foreach (var arg in args)
        {
            AddUserConfigReferences(arg, referenced);
        }

        if (referenced.Count == 0)
            return;

        var missing = new List<string>();
        foreach (var key in referenced)
        {
            if (manifest.UserConfig.TryGetValue(key, out var option) && option?.Required == true)
            {
                if (
                    !providedUserConfig.TryGetValue(key, out var values)
                    || values == null
                    || values.Count == 0
                    || values.Any(string.IsNullOrWhiteSpace)
                )
                {
                    missing.Add(key);
                }
            }
        }

        if (missing.Count == 0)
            return;

        var suffix = missing.Count > 1 ? "s" : string.Empty;
        var keys = string.Join(", ", missing.Select(k => $"'{k}'"));
        var suggestion = string.Join(" ", missing.Select(k => $"--user_config {k}=<value>"));
        throw new UserConfigRequiredException(
            $"Discovery requires user_config value{suffix} for {keys}. Provide value{suffix} via {suggestion}."
        );
    }

    private static void AddUserConfigReferences(string? value, HashSet<string> collector)
    {
        if (string.IsNullOrWhiteSpace(value))
            return;
        foreach (Match match in UserConfigTokenRegex.Matches(value))
        {
            var key = match.Groups[1].Value?.Trim();
            if (!string.IsNullOrEmpty(key))
            {
                collector.Add(key);
            }
        }
    }

    private static string SafeGetSpecial(Environment.SpecialFolder folder, string fallback)
    {
        try
        {
            var p = Environment.GetFolderPath(folder);
            return string.IsNullOrEmpty(p) ? fallback : p;
        }
        catch
        {
            return fallback;
        }
    }

    private static List<McpbManifestTool>? TryParseToolOverride(string envVar)
    {
        var json = Environment.GetEnvironmentVariable(envVar);
        if (string.IsNullOrWhiteSpace(json))
            return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
                return null;
            var list = new List<McpbManifestTool>();
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                if (el.ValueKind == JsonValueKind.String)
                {
                    var name = el.GetString();
                    if (!string.IsNullOrWhiteSpace(name))
                    {
                        list.Add(new McpbManifestTool { Name = name! });
                    }
                    continue;
                }

                if (
                    el.ValueKind != JsonValueKind.Object
                    || !el.TryGetProperty("name", out var nameProp)
                    || nameProp.ValueKind != JsonValueKind.String
                )
                {
                    continue;
                }

                var tool = new McpbManifestTool { Name = nameProp.GetString() ?? string.Empty };

                if (
                    el.TryGetProperty("description", out var descProp)
                    && descProp.ValueKind == JsonValueKind.String
                )
                {
                    var desc = descProp.GetString();
                    tool.Description = string.IsNullOrWhiteSpace(desc) ? null : desc;
                }

                list.Add(tool);
            }

            return list.Count == 0 ? null : DeduplicateTools(list);
        }
        catch
        {
            return null;
        }
    }

    private static List<McpbManifestPrompt>? TryParsePromptOverride(string envVar)
    {
        var json = Environment.GetEnvironmentVariable(envVar);
        if (string.IsNullOrWhiteSpace(json))
            return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
                return null;
            var list = new List<McpbManifestPrompt>();
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                if (el.ValueKind == JsonValueKind.String)
                {
                    var name = el.GetString();
                    if (!string.IsNullOrWhiteSpace(name))
                        list.Add(new McpbManifestPrompt { Name = name!, Text = string.Empty });
                    continue;
                }

                if (
                    el.ValueKind != JsonValueKind.Object
                    || !el.TryGetProperty("name", out var nameProp)
                    || nameProp.ValueKind != JsonValueKind.String
                )
                {
                    continue;
                }

                var prompt = new McpbManifestPrompt
                {
                    Name = nameProp.GetString() ?? string.Empty,
                    Text = string.Empty,
                };

                if (
                    el.TryGetProperty("description", out var descProp)
                    && descProp.ValueKind == JsonValueKind.String
                )
                {
                    var desc = descProp.GetString();
                    prompt.Description = string.IsNullOrWhiteSpace(desc) ? null : desc;
                }

                if (
                    el.TryGetProperty("arguments", out var argsProp)
                    && argsProp.ValueKind == JsonValueKind.Array
                )
                {
                    var args = new List<string>();
                    foreach (var arg in argsProp.EnumerateArray())
                    {
                        if (arg.ValueKind == JsonValueKind.String)
                        {
                            var argName = arg.GetString();
                            if (!string.IsNullOrWhiteSpace(argName))
                                args.Add(argName!);
                        }
                    }
                    prompt.Arguments = args.Count > 0 ? args : null;
                }

                if (
                    el.TryGetProperty("text", out var textProp)
                    && textProp.ValueKind == JsonValueKind.String
                )
                {
                    prompt.Text = textProp.GetString() ?? string.Empty;
                }

                list.Add(prompt);
            }

            return list.Count == 0 ? null : DeduplicatePrompts(list);
        }
        catch
        {
            return null;
        }
    }

    private static McpbInitializeResult? TryParseInitializeOverride(string envVar)
    {
        var json = Environment.GetEnvironmentVariable(envVar);
        if (string.IsNullOrWhiteSpace(json))
            return null;
        try
        {
            return JsonSerializer.Deserialize(json, McpbJsonContext.Default.McpbInitializeResult);
        }
        catch
        {
            return null;
        }
    }

    private static McpbToolsListResult? TryParseToolsListOverride(string envVar)
    {
        var json = Environment.GetEnvironmentVariable(envVar);
        if (string.IsNullOrWhiteSpace(json))
            return null;
        try
        {
            return JsonSerializer.Deserialize(json, McpbJsonContext.Default.McpbToolsListResult);
        }
        catch
        {
            return null;
        }
    }

    private static List<McpbManifestTool> DeduplicateTools(IEnumerable<McpbManifestTool> tools)
    {
        return tools
            .Where(t => !string.IsNullOrWhiteSpace(t.Name))
            .GroupBy(t => t.Name, StringComparer.Ordinal)
            .Select(g => MergeToolGroup(g))
            .OrderBy(t => t.Name, StringComparer.Ordinal)
            .ToList();
    }

    private static McpbManifestTool MergeToolGroup(IEnumerable<McpbManifestTool> group)
    {
        var first = group.First();
        if (!string.IsNullOrWhiteSpace(first.Description))
            return first;
        var description = group
            .Select(t => t.Description)
            .FirstOrDefault(d => !string.IsNullOrWhiteSpace(d));
        return new McpbManifestTool
        {
            Name = first.Name,
            Description = string.IsNullOrWhiteSpace(description) ? null : description,
        };
    }

    private static List<McpbManifestPrompt> DeduplicatePrompts(
        IEnumerable<McpbManifestPrompt> prompts
    )
    {
        return prompts
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .GroupBy(p => p.Name, StringComparer.Ordinal)
            .Select(g => MergePromptGroup(g))
            .OrderBy(p => p.Name, StringComparer.Ordinal)
            .ToList();
    }

    private static McpbManifestPrompt MergePromptGroup(IEnumerable<McpbManifestPrompt> group)
    {
        var first = group.First();
        var description = !string.IsNullOrWhiteSpace(first.Description)
            ? first.Description
            : group.Select(p => p.Description).FirstOrDefault(d => !string.IsNullOrWhiteSpace(d));
        var aggregatedArgs =
            first.Arguments != null && first.Arguments.Count > 0
                ? new List<string>(first.Arguments)
                : group
                    .SelectMany(p => p.Arguments ?? new List<string>())
                    .Distinct(StringComparer.Ordinal)
                    .ToList();

        var text = !string.IsNullOrWhiteSpace(first.Text)
            ? first.Text
            : group.Select(p => p.Text).FirstOrDefault(t => !string.IsNullOrWhiteSpace(t))
                ?? string.Empty;

        return new McpbManifestPrompt
        {
            Name = first.Name,
            Description = string.IsNullOrWhiteSpace(description) ? null : description,
            Arguments = aggregatedArgs.Count > 0 ? aggregatedArgs : null,
            Text = text,
        };
    }

    private static string ExtractPromptText(GetPromptResult? promptResult)
    {
        if (promptResult?.Messages == null)
            return string.Empty;
        var builder = new StringBuilder();
        foreach (var message in promptResult.Messages)
        {
            if (message?.Content == null)
                continue;
            AppendContentBlocks(builder, message.Content);
        }
        return builder.ToString();
    }

    private static void AppendContentBlocks(StringBuilder builder, object content)
    {
        switch (content)
        {
            case null:
                return;
            case TextContentBlock textBlock:
                AppendText(builder, textBlock);
                return;
            case IEnumerable<ContentBlock> enumerableBlocks:
                foreach (var block in enumerableBlocks)
                {
                    AppendText(builder, block as TextContentBlock);
                }
                return;
            case ContentBlock singleBlock:
                AppendText(builder, singleBlock as TextContentBlock);
                return;
        }
    }

    private static void AppendText(StringBuilder builder, TextContentBlock? textBlock)
    {
        if (textBlock == null || string.IsNullOrWhiteSpace(textBlock.Text))
            return;
        if (builder.Length > 0)
            builder.AppendLine();
        builder.Append(textBlock.Text);
    }

    internal static List<string> GetToolMetadataDifferences(
        IEnumerable<McpbManifestTool>? manifestTools,
        IEnumerable<McpbManifestTool> discoveredTools
    )
    {
        var differences = new List<string>();
        if (manifestTools == null)
            return differences;
        var manifestByName = manifestTools
            .Where(t => !string.IsNullOrWhiteSpace(t.Name))
            .ToDictionary(t => t.Name, StringComparer.Ordinal);

        foreach (var tool in discoveredTools)
        {
            if (string.IsNullOrWhiteSpace(tool.Name))
                continue;
            if (!manifestByName.TryGetValue(tool.Name, out var existing))
                continue;

            if (!StringEqualsNormalized(existing.Description, tool.Description))
            {
                differences.Add(
                    $"Tool '{tool.Name}' description differs (manifest: {FormatValue(existing.Description)}, discovered: {FormatValue(tool.Description)})."
                );
            }
        }

        return differences;
    }

    internal static List<string> GetPromptMetadataDifferences(
        IEnumerable<McpbManifestPrompt>? manifestPrompts,
        IEnumerable<McpbManifestPrompt> discoveredPrompts
    )
    {
        var differences = new List<string>();
        if (manifestPrompts == null)
            return differences;
        var manifestByName = manifestPrompts
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .ToDictionary(p => p.Name, StringComparer.Ordinal);

        foreach (var prompt in discoveredPrompts)
        {
            if (string.IsNullOrWhiteSpace(prompt.Name))
                continue;
            if (!manifestByName.TryGetValue(prompt.Name, out var existing))
                continue;

            if (!StringEqualsNormalized(existing.Description, prompt.Description))
            {
                differences.Add(
                    $"Prompt '{prompt.Name}' description differs (manifest: {FormatValue(existing.Description)}, discovered: {FormatValue(prompt.Description)})."
                );
            }

            var manifestArgs = NormalizeArguments(existing.Arguments);
            var discoveredArgs = NormalizeArguments(prompt.Arguments);
            if (!manifestArgs.SequenceEqual(discoveredArgs, StringComparer.Ordinal))
            {
                differences.Add(
                    $"Prompt '{prompt.Name}' arguments differ (manifest: {FormatArguments(manifestArgs)}, discovered: {FormatArguments(discoveredArgs)})."
                );
            }

            var manifestText = NormalizeString(existing.Text);
            var discoveredText = NormalizeString(prompt.Text);
            if (manifestText == null && discoveredText != null)
            {
                differences.Add(
                    $"Prompt '{prompt.Name}' text differs (manifest length {existing.Text?.Length ?? 0}, discovered length {prompt.Text?.Length ?? 0})."
                );
            }
        }

        return differences;
    }

    internal static List<string> GetPromptTextWarnings(
        IEnumerable<McpbManifestPrompt>? manifestPrompts,
        IEnumerable<McpbManifestPrompt> discoveredPrompts
    )
    {
        var warnings = new List<string>();
        var manifestByName = manifestPrompts
            ?.Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .ToDictionary(p => p.Name, StringComparer.Ordinal);

        foreach (var prompt in discoveredPrompts)
        {
            if (string.IsNullOrWhiteSpace(prompt.Name))
                continue;
            var discoveredText = NormalizeString(prompt.Text);
            if (discoveredText != null)
                continue;

            McpbManifestPrompt? existing = null;
            if (manifestByName != null)
            {
                manifestByName.TryGetValue(prompt.Name, out existing);
            }
            var existingHasText = existing != null && !string.IsNullOrWhiteSpace(existing.Text);
            if (existingHasText)
            {
                warnings.Add(
                    $"Prompt '{prompt.Name}' did not return text during discovery; keeping manifest text."
                );
            }
            else
            {
                warnings.Add(
                    $"Prompt '{prompt.Name}' did not return text during discovery; consider adding text to manifest manually."
                );
            }
        }

        return warnings;
    }

    internal static List<McpbManifestPrompt> MergePromptMetadata(
        IEnumerable<McpbManifestPrompt>? manifestPrompts,
        IEnumerable<McpbManifestPrompt> discoveredPrompts
    )
    {
        var manifestByName = manifestPrompts
            ?.Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .ToDictionary(p => p.Name, StringComparer.Ordinal);

        return discoveredPrompts
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .Select(p =>
            {
                McpbManifestPrompt? existing = null;
                if (manifestByName != null)
                {
                    manifestByName.TryGetValue(p.Name, out existing);
                }
                var mergedText =
                    existing != null && !string.IsNullOrWhiteSpace(existing.Text)
                        ? existing.Text!
                        : (!string.IsNullOrWhiteSpace(p.Text) ? p.Text! : string.Empty);
                return new McpbManifestPrompt
                {
                    Name = p.Name,
                    Description = p.Description,
                    Arguments =
                        p.Arguments != null && p.Arguments.Count > 0
                            ? new List<string>(p.Arguments)
                            : null,
                    Text = mergedText,
                };
            })
            .ToList();
    }

    internal static CapabilityComparisonResult CompareTools(
        IEnumerable<McpbManifestTool>? manifestTools,
        IEnumerable<McpbManifestTool> discoveredTools
    )
    {
        var summaryTerms = new List<string>();
        var messages = new List<string>();

        var manifestNames =
            manifestTools
                ?.Where(t => !string.IsNullOrWhiteSpace(t.Name))
                .Select(t => t.Name)
                .ToList() ?? new List<string>();
        manifestNames.Sort(StringComparer.Ordinal);

        var discoveredNames = discoveredTools
            .Where(t => !string.IsNullOrWhiteSpace(t.Name))
            .Select(t => t.Name)
            .ToList();
        discoveredNames.Sort(StringComparer.Ordinal);

        bool namesDiffer = !manifestNames.SequenceEqual(discoveredNames, StringComparer.Ordinal);
        if (namesDiffer)
        {
            summaryTerms.Add("tool names");
            var sb = new StringBuilder();
            sb.AppendLine("Tool list mismatch:");
            sb.AppendLine("  Manifest:   [" + string.Join(", ", manifestNames) + "]");
            sb.Append("  Discovered: [" + string.Join(", ", discoveredNames) + "]");
            messages.Add(sb.ToString());
        }

        var metadataDiffs = GetToolMetadataDifferences(manifestTools, discoveredTools);
        bool metadataDiffer = metadataDiffs.Count > 0;
        if (metadataDiffer)
        {
            summaryTerms.Add("tool metadata");
            var sb = new StringBuilder();
            sb.AppendLine("Tool metadata mismatch:");
            foreach (var diff in metadataDiffs)
            {
                sb.AppendLine("  " + diff);
            }
            messages.Add(sb.ToString().TrimEnd());
        }

        return new CapabilityComparisonResult(namesDiffer, metadataDiffer, summaryTerms, messages);
    }

    internal static CapabilityComparisonResult ComparePrompts(
        IEnumerable<McpbManifestPrompt>? manifestPrompts,
        IEnumerable<McpbManifestPrompt> discoveredPrompts
    )
    {
        var summaryTerms = new List<string>();
        var messages = new List<string>();

        var manifestNames =
            manifestPrompts
                ?.Where(p => !string.IsNullOrWhiteSpace(p.Name))
                .Select(p => p.Name)
                .ToList() ?? new List<string>();
        manifestNames.Sort(StringComparer.Ordinal);

        var discoveredNames = discoveredPrompts
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .Select(p => p.Name)
            .ToList();
        discoveredNames.Sort(StringComparer.Ordinal);

        bool namesDiffer = !manifestNames.SequenceEqual(discoveredNames, StringComparer.Ordinal);
        if (namesDiffer)
        {
            summaryTerms.Add("prompt names");
            var sb = new StringBuilder();
            sb.AppendLine("Prompt list mismatch:");
            sb.AppendLine("  Manifest:   [" + string.Join(", ", manifestNames) + "]");
            sb.Append("  Discovered: [" + string.Join(", ", discoveredNames) + "]");
            messages.Add(sb.ToString());
        }

        var metadataDiffs = GetPromptMetadataDifferences(manifestPrompts, discoveredPrompts);
        bool metadataDiffer = metadataDiffs.Count > 0;
        if (metadataDiffer)
        {
            summaryTerms.Add("prompt metadata");
            var sb = new StringBuilder();
            sb.AppendLine("Prompt metadata mismatch:");
            foreach (var diff in metadataDiffs)
            {
                sb.AppendLine("  " + diff);
            }
            messages.Add(sb.ToString().TrimEnd());
        }

        return new CapabilityComparisonResult(namesDiffer, metadataDiffer, summaryTerms, messages);
    }

    internal static StaticResponseComparisonResult CompareStaticResponses(
        McpbManifest manifest,
        McpbInitializeResult? initializeResponse,
        McpbToolsListResult? toolsListResponse
    )
    {
        var summaryTerms = new List<string>();
        var messages = new List<string>();
        bool initializeDiffers = false;
        bool toolsListDiffers = false;

        var windowsMeta = GetWindowsMeta(manifest);
        var staticResponses = windowsMeta.StaticResponses;

        if (initializeResponse != null)
        {
            var expected = BuildInitializeStaticResponse(initializeResponse);
            if (staticResponses?.Initialize == null)
            {
                initializeDiffers = true;
                summaryTerms.Add("static_responses.initialize");
                messages.Add(
                    "Missing _meta.static_responses.initialize; discovery returned an initialize payload."
                );
            }
            else if (!AreJsonEquivalent(staticResponses.Initialize, expected))
            {
                initializeDiffers = true;
                summaryTerms.Add("static_responses.initialize");
                messages.Add(
                    "_meta.static_responses.initialize differs from discovered initialize payload."
                );
            }
        }

        if (toolsListResponse != null)
        {
            if (staticResponses?.ToolsList == null)
            {
                toolsListDiffers = true;
                summaryTerms.Add("static_responses.tools/list");
                messages.Add(
                    "Missing _meta.static_responses.\"tools/list\"; discovery returned a tools/list payload."
                );
            }
            else if (!AreJsonEquivalent(staticResponses.ToolsList, toolsListResponse))
            {
                toolsListDiffers = true;
                summaryTerms.Add("static_responses.tools/list");
                messages.Add(
                    "_meta.static_responses.\"tools/list\" differs from discovered tools/list payload."
                );
            }
        }

        return new StaticResponseComparisonResult(
            initializeDiffers,
            toolsListDiffers,
            summaryTerms,
            messages
        );
    }

    internal static bool ApplyWindowsMetaStaticResponses(
        McpbManifest manifest,
        McpbInitializeResult? initializeResponse,
        McpbToolsListResult? toolsListResponse
    )
    {
        if (initializeResponse == null && toolsListResponse == null)
        {
            return false;
        }

        var windowsMeta = GetWindowsMeta(manifest);
        var staticResponses = windowsMeta.StaticResponses ?? new McpbStaticResponses();
        bool changed = false;

        if (initializeResponse != null)
        {
            var initializePayload = BuildInitializeStaticResponse(initializeResponse);
            if (!AreJsonEquivalent(staticResponses.Initialize, initializePayload))
            {
                staticResponses.Initialize = initializePayload;
                changed = true;
            }
        }

        if (toolsListResponse != null)
        {
            if (!AreJsonEquivalent(staticResponses.ToolsList, toolsListResponse))
            {
                staticResponses.ToolsList = toolsListResponse;
                changed = true;
            }
        }

        if (!changed)
        {
            return false;
        }

        windowsMeta.StaticResponses = staticResponses;
        SetWindowsMeta(manifest, windowsMeta);
        return true;
    }

    private static bool StringEqualsNormalized(string? a, string? b) =>
        string.Equals(NormalizeString(a), NormalizeString(b), StringComparison.Ordinal);

    private static string? NormalizeString(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;

    private static Dictionary<string, object> BuildInitializeStaticResponse(
        McpbInitializeResult response
    )
    {
        var result = new Dictionary<string, object>();
        if (!string.IsNullOrWhiteSpace(response.ProtocolVersion))
        {
            result["protocolVersion"] = response.ProtocolVersion!;
        }
        if (response.Capabilities != null)
        {
            result["capabilities"] = response.Capabilities;
        }
        if (response.ServerInfo != null)
        {
            result["serverInfo"] = response.ServerInfo;
        }
        if (!string.IsNullOrWhiteSpace(response.Instructions))
        {
            result["instructions"] = response.Instructions!;
        }
        return result;
    }

    private static IReadOnlyList<string> NormalizeArguments(IReadOnlyCollection<string>? args)
    {
        if (args == null || args.Count == 0)
            return Array.Empty<string>();
        return args.Where(a => !string.IsNullOrWhiteSpace(a)).Select(a => a).ToArray();
    }

    private static string FormatArguments(IReadOnlyList<string> args)
    {
        if (args.Count == 0)
            return "[]";
        return "[" + string.Join(", ", args) + "]";
    }

    private static string FormatValue(string? value)
    {
        var normalized = NormalizeString(value);
        return normalized ?? "(none)";
    }

    private static McpbWindowsMeta GetWindowsMeta(McpbManifest manifest)
    {
        if (manifest.Meta == null)
        {
            return new McpbWindowsMeta();
        }

        if (!manifest.Meta.TryGetValue("com.microsoft.windows", out var windowsMetaDict))
        {
            return new McpbWindowsMeta();
        }

        try
        {
            var json = JsonSerializer.Serialize(windowsMetaDict, McpbJsonContext.WriteOptions);
            return JsonSerializer.Deserialize(json, McpbJsonContext.Default.McpbWindowsMeta)
                    as McpbWindowsMeta
                ?? new McpbWindowsMeta();
        }
        catch
        {
            return new McpbWindowsMeta();
        }
    }

    private static void SetWindowsMeta(McpbManifest manifest, McpbWindowsMeta windowsMeta)
    {
        manifest.Meta ??= new Dictionary<string, Dictionary<string, object>>(
            StringComparer.Ordinal
        );

        var json = JsonSerializer.Serialize(windowsMeta, McpbJsonContext.WriteOptions);
        var dict =
            JsonSerializer.Deserialize(json, McpbJsonContext.Default.DictionaryStringObject)
                as Dictionary<string, object>
            ?? new Dictionary<string, object>();

        manifest.Meta["com.microsoft.windows"] = dict;
    }

    private static bool AreJsonEquivalent(object? a, object? b)
    {
        if (ReferenceEquals(a, b))
            return true;
        if (a == null || b == null)
            return false;

        try
        {
            var jsonA = JsonSerializer.Serialize(a, McpbJsonContext.WriteOptions);
            var jsonB = JsonSerializer.Serialize(b, McpbJsonContext.WriteOptions);
            return string.Equals(jsonA, jsonB, StringComparison.Ordinal);
        }
        catch
        {
            return false;
        }
    }
}
