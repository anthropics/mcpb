using System.CommandLine;
using Mcpb.Core;
using System.Text.Json;
using Mcpb.Json;
using System.Text.RegularExpressions;

namespace Mcpb.Commands;

public static class InitCommand
{
    public const string LatestMcpbSchemaVersion = "0.2"; // Latest schema version

    public static Command Create()
    {
        var directoryArg = new Argument<string?>("directory", () => Directory.GetCurrentDirectory(), "Target directory");
        var yesOption = new Option<bool>(new[] { "--yes", "-y" }, "Accept defaults (non-interactive)");
        var serverTypeOpt = new Option<string>("--server-type", () => "auto", "Server type: node|python|binary|auto");
        var entryPointOpt = new Option<string?>("--entry-point", description: "Override entry point (relative to manifest)");
        var cmd = new Command("init", "Create a new MCPB extension manifest") { directoryArg, yesOption, serverTypeOpt, entryPointOpt };
        cmd.SetHandler(async (string? dir, bool yes, string serverTypeOptValue, string? entryPointOverride) =>
        {
            var targetDir = Path.GetFullPath(dir ?? Directory.GetCurrentDirectory());
            Directory.CreateDirectory(targetDir);
            var manifestPath = Path.Combine(targetDir, "manifest.json");

            if (File.Exists(manifestPath) && !yes)
            {
                if (!PromptConfirm("manifest.json already exists. Overwrite?", false))
                {
                    Console.WriteLine("Cancelled");
                    return;
                }
            }

            if (!yes)
            {
                Console.WriteLine("This utility will help you create a manifest.json file for your MCPB bundle.");
                Console.WriteLine("Press Ctrl+C at any time to quit.\n");
            }
            else
            {
                Console.WriteLine("Creating manifest.json with default values...");
            }

            // Package.json style defaults (simplified: we look for package.json for name/version/description/author fields if present)
            var pkg = PackageJson.TryLoad(targetDir);

            // Basic info
            string name, authorName, displayName, version, description;
            if (yes)
            {
                name = pkg.Name ?? new DirectoryInfo(targetDir).Name;
                authorName = pkg.AuthorName ?? "Unknown Author";
                displayName = name;
                version = pkg.Version ?? "1.0.0";
                description = pkg.Description ?? "A MCPB bundle";
            }
            else
            {
                name = PromptRequired("Extension name:", pkg.Name ?? new DirectoryInfo(targetDir).Name);
                authorName = PromptRequired("Author name:", pkg.AuthorName ?? "Unknown Author");
                displayName = Prompt("Display name (optional):", name);
                version = PromptValidated("Version:", pkg.Version ?? "1.0.0", s => Regex.IsMatch(s, "^\\d+\\.\\d+\\.\\d+") ? null : "Version must follow semantic versioning (e.g., 1.0.0)");
                description = PromptRequired("Description:", pkg.Description ?? "");
            }

            // Long description
            string? longDescription = null;
            if (!yes && PromptConfirm("Add a detailed long description?", false))
            {
                longDescription = Prompt("Long description (supports basic markdown):", description);
            }

            // Author extras
            string authorEmail = yes ? (pkg.AuthorEmail ?? "") : Prompt("Author email (optional):", pkg.AuthorEmail ?? "");
            string authorUrl = yes ? (pkg.AuthorUrl ?? "") : Prompt("Author URL (optional):", pkg.AuthorUrl ?? "");

            // Server type
            string serverType = "binary"; // default differs from TS (binary for .NET)
            if (!yes)
            {
                serverType = PromptSelect("Server type:", new[] { "node", "python", "binary" }, "binary");
            }
            else if (!string.IsNullOrWhiteSpace(serverTypeOptValue) && serverTypeOptValue is "node" or "python" or "binary")
            {
                serverType = serverTypeOptValue;
            }

            string entryPoint = entryPointOverride ?? GetDefaultEntryPoint(serverType, pkg.Main);
            if (!yes)
            {
                entryPoint = Prompt("Entry point:", entryPoint);
            }

            var mcpConfig = CreateMcpConfig(serverType, entryPoint);

            // Tools
            var tools = new List<McpbManifestTool>();
            bool toolsGenerated = false;
            if (!yes && PromptConfirm("Does your MCP Server provide tools you want to advertise (optional)?", true))
            {
                bool addMore;
                do
                {
                    var tName = PromptRequired("Tool name:", "");
                    var tDesc = Prompt("Tool description (optional):", "");
                    tools.Add(new McpbManifestTool { Name = tName, Description = string.IsNullOrWhiteSpace(tDesc) ? null : tDesc });
                    addMore = PromptConfirm("Add another tool?", false);
                } while (addMore);
                toolsGenerated = PromptConfirm("Does your server generate additional tools at runtime?", false);
            }

            // Prompts
            var prompts = new List<McpbManifestPrompt>();
            bool promptsGenerated = false;
            if (!yes && PromptConfirm("Does your MCP Server provide prompts you want to advertise (optional)?", false))
            {
                bool addMore;
                do
                {
                    var pName = PromptRequired("Prompt name:", "");
                    var pDesc = Prompt("Prompt description (optional):", "");
                    var hasArgs = PromptConfirm("Does this prompt have arguments?", false);
                    List<string>? argsList = null;
                    if (hasArgs)
                    {
                        argsList = new();
                        bool addArg;
                        do
                        {
                            var aName = PromptValidated("Argument name:", "", v => string.IsNullOrWhiteSpace(v) ? "Argument name is required" : (argsList.Contains(v) ? "Argument names must be unique" : null));
                            argsList.Add(aName);
                            addArg = PromptConfirm("Add another argument?", false);
                        } while (addArg);
                    }
                    var promptTextMsg = hasArgs ? $"Prompt text (use ${{arguments.name}} for arguments: {string.Join(", ", argsList ?? new())}):" : "Prompt text:";
                    var pText = PromptRequired(promptTextMsg, "");
                    prompts.Add(new McpbManifestPrompt { Name = pName, Description = string.IsNullOrWhiteSpace(pDesc) ? null : pDesc, Arguments = argsList, Text = pText });
                    addMore = PromptConfirm("Add another prompt?", false);
                } while (addMore);
                promptsGenerated = PromptConfirm("Does your server generate additional prompts at runtime?", false);
            }

            // Optional URLs
            string homepage = yes ? "" : PromptUrl("Homepage URL (optional):");
            string documentation = yes ? "" : PromptUrl("Documentation URL (optional):");
            string support = yes ? "" : PromptUrl("Support URL (optional):");

            // Visual assets
            string icon = "";
            List<string> screenshots = new();
            if (!yes)
            {
                icon = PromptPathOptional("Icon file path (optional, relative to manifest):");
                if (PromptConfirm("Add screenshots?", false))
                {
                    bool addShot;
                    do
                    {
                        var shot = PromptValidated("Screenshot file path (relative to manifest):", "", v => string.IsNullOrWhiteSpace(v) ? "Screenshot path is required" : (v.Contains("..") ? "Relative paths cannot include '..'" : null));
                        screenshots.Add(shot);
                        addShot = PromptConfirm("Add another screenshot?", false);
                    } while (addShot);
                }
            }

            // Compatibility
            McpbManifestCompatibility? compatibility = null;
            if (!yes && PromptConfirm("Add compatibility constraints?", false))
            {
                List<string>? platforms = null;
                if (PromptConfirm("Specify supported platforms?", false))
                {
                    platforms = new List<string>();
                    if (PromptConfirm("Support macOS (darwin)?", true)) platforms.Add("darwin");
                    if (PromptConfirm("Support Windows (win32)?", true)) platforms.Add("win32");
                    if (PromptConfirm("Support Linux?", true)) platforms.Add("linux");
                    if (platforms.Count == 0) platforms = null;
                }
                McpbManifestCompatibilityRuntimes? runtimes = null;
                if (serverType != "binary" && PromptConfirm("Specify runtime version constraints?", false))
                {
                    runtimes = new McpbManifestCompatibilityRuntimes();
                    if (serverType == "python")
                        runtimes.Python = PromptRequired("Python version constraint (e.g., >=3.8,<4.0):", "");
                    else if (serverType == "node")
                        runtimes.Node = PromptRequired("Node.js version constraint (e.g., >=16.0.0):", "");
                }
                compatibility = new McpbManifestCompatibility { Platforms = platforms, Runtimes = runtimes };
            }

            // user_config
            Dictionary<string, McpbUserConfigOption>? userConfig = null;
            if (!yes && PromptConfirm("Add user-configurable options?", false))
            {
                userConfig = new();
                bool addOpt;
                do
                {
                    var key = PromptValidated("Configuration option key (unique identifier):", "", v => string.IsNullOrWhiteSpace(v) ? "Key is required" : (userConfig.ContainsKey(v) ? "Key must be unique" : null));
                    var type = PromptSelect("Option type:", new[] { "string", "number", "boolean", "directory", "file" }, "string");
                    var title = PromptRequired("Option title (human-readable name):", "");
                    var desc = PromptRequired("Option description:", "");
                    var required = PromptConfirm("Is this option required?", false);
                    var sensitive = PromptConfirm("Is this option sensitive (like a password)?", false);
                    var opt = new McpbUserConfigOption { Type = type, Title = title, Description = desc, Sensitive = sensitive, Required = required };
                    if (!required)
                    {
                        if (type == "boolean")
                        {
                            opt.Default = PromptConfirm("Default value:", false);
                        }
                        else if (type == "number")
                        {
                            var defStr = Prompt("Default value (number, optional):", "");
                            if (double.TryParse(defStr, out var defVal)) opt.Default = defVal;
                        }
                        else
                        {
                            var defVal = Prompt("Default value (optional):", "");
                            if (!string.IsNullOrWhiteSpace(defVal)) opt.Default = defVal;
                        }
                    }
                    if (type == "number" && PromptConfirm("Add min/max constraints?", false))
                    {
                        var minStr = Prompt("Minimum value (optional):", "");
                        if (double.TryParse(minStr, out var minVal)) opt.Min = minVal;
                        var maxStr = Prompt("Maximum value (optional):", "");
                        if (double.TryParse(maxStr, out var maxVal)) opt.Max = maxVal;
                    }
                    userConfig[key] = opt;
                    addOpt = PromptConfirm("Add another configuration option?", false);
                } while (addOpt);
            }

            // Optional fields (keywords, license, repo)
            string keywordsCsv = yes ? "" : Prompt("Keywords (comma-separated, optional):", "");
            string license = yes ? (pkg.License ?? "MIT") : Prompt("License:", pkg.License ?? "MIT");
            McpbManifestRepository? repository = null;
            if (!yes && PromptConfirm("Add repository information?", !string.IsNullOrWhiteSpace(pkg.RepositoryUrl)))
            {
                var repoUrl = Prompt("Repository URL:", pkg.RepositoryUrl ?? "");
                if (!string.IsNullOrWhiteSpace(repoUrl)) repository = new McpbManifestRepository { Type = "git", Url = repoUrl };
            }
            else if (yes && !string.IsNullOrWhiteSpace(pkg.RepositoryUrl))
            {
                repository = new McpbManifestRepository { Type = "git", Url = pkg.RepositoryUrl! };
            }

            var manifest = new McpbManifest
            {
                ManifestVersion = LatestMcpbSchemaVersion,
                Name = name,
                DisplayName = displayName != name ? displayName : null,
                Version = version,
                Description = description,
                LongDescription = longDescription,
                Author = new McpbManifestAuthor { Name = authorName, Email = string.IsNullOrWhiteSpace(authorEmail) ? null : authorEmail, Url = string.IsNullOrWhiteSpace(authorUrl) ? null : authorUrl },
                Homepage = string.IsNullOrWhiteSpace(homepage) ? null : homepage,
                Documentation = string.IsNullOrWhiteSpace(documentation) ? null : documentation,
                Support = string.IsNullOrWhiteSpace(support) ? null : support,
                Icon = string.IsNullOrWhiteSpace(icon) ? null : icon,
                Screenshots = screenshots.Count > 0 ? screenshots : null,
                Server = new McpbManifestServer { Type = serverType, EntryPoint = entryPoint, McpConfig = mcpConfig },
                Tools = tools.Count > 0 ? tools : null,
                ToolsGenerated = toolsGenerated ? true : null,
                Prompts = prompts.Count > 0 ? prompts : null,
                PromptsGenerated = promptsGenerated ? true : null,
                Compatibility = compatibility,
                UserConfig = userConfig,
                Keywords = string.IsNullOrWhiteSpace(keywordsCsv) ? null : keywordsCsv.Split(',').Select(k => k.Trim()).Where(k => k.Length > 0).ToList(),
                License = string.IsNullOrWhiteSpace(license) ? null : license,
                Repository = repository
            };

            var json = JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions);
            await File.WriteAllTextAsync(manifestPath, json + "\n");
            Console.WriteLine($"\nCreated manifest.json at {manifestPath}");
            Console.WriteLine("\nNext steps:");
            Console.WriteLine("1. Ensure all your production dependencies are in this directory");
            Console.WriteLine("2. Run 'mcpb pack' to create your .mcpb file");
        }, directoryArg, yesOption, serverTypeOpt, entryPointOpt);
        return cmd;
    }

    #region Prompt Helpers
    private static bool PromptConfirm(string message, bool defaultValue)
    {
        Console.Write(message + (defaultValue ? " (Y/n): " : " (y/N): "));
        var input = Console.ReadLine();
        if (string.IsNullOrWhiteSpace(input)) return defaultValue;
        input = input.Trim().ToLowerInvariant();
        return input is "y" or "yes";
    }
    private static string Prompt(string message, string defaultValue)
    {
        Console.Write(string.IsNullOrEmpty(defaultValue) ? message + " " : message + " [" + defaultValue + "]: ");
        var input = Console.ReadLine();
        return string.IsNullOrWhiteSpace(input) ? defaultValue : input.Trim();
    }
    private static string PromptRequired(string message, string defaultValue)
    {
        while (true)
        {
            var v = Prompt(message, defaultValue);
            if (!string.IsNullOrWhiteSpace(v)) return v;
            Console.WriteLine("  Value is required");
        }
    }
    private static string PromptValidated(string message, string defaultValue, Func<string, string?> validator)
    {
        while (true)
        {
            var v = Prompt(message, defaultValue);
            var err = validator(v);
            if (err == null) return v;
            Console.WriteLine("  " + err);
        }
    }
    private static string PromptSelect(string message, string[] options, string defaultValue)
    {
        Console.WriteLine(message + " " + string.Join("/", options.Select(o => o == defaultValue ? $"[{o}]" : o)) + ": ");
        while (true)
        {
            var inp = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(inp)) return defaultValue;
            inp = inp.Trim().ToLowerInvariant();
            if (options.Contains(inp)) return inp;
            Console.WriteLine("  Invalid choice");
        }
    }
    private static string PromptUrl(string message)
    {
        while (true)
        {
            Console.Write(message + " ");
            var inp = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(inp)) return "";
            if (Uri.TryCreate(inp, UriKind.Absolute, out _)) return inp.Trim();
            Console.WriteLine("  Must be a valid URL (e.g., https://example.com)");
        }
    }
    private static string PromptPathOptional(string message)
    {
        while (true)
        {
            Console.Write(message + " ");
            var inp = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(inp)) return "";
            if (inp.Contains("..")) { Console.WriteLine("  Relative paths cannot include '..'"); continue; }
            return inp.Trim();
        }
    }

    private static string GetDefaultEntryPoint(string serverType, string? pkgMain) => serverType switch
    {
        "node" => string.IsNullOrWhiteSpace(pkgMain) ? "server/index.js" : pkgMain!,
        "python" => "server/main.py",
        _ => OperatingSystem.IsWindows() ? "server/my-server.exe" : "server/my-server",
    };
    private static McpServerConfigWithOverrides CreateMcpConfig(string serverType, string entryPoint)
    {
        return new McpServerConfigWithOverrides
        {
            Command = serverType switch
            {
                "node" => "node",
                "python" => "python",
                _ => "${__dirname}/" + entryPoint
            },
            Args = serverType switch
            {
                "node" => new List<string> { "${__dirname}/" + entryPoint },
                "python" => new List<string> { "${__dirname}/" + entryPoint },
                _ => new List<string>()
            },
            Env = serverType switch
            {
                "python" => new Dictionary<string, string> { { "PYTHONPATH", "${__dirname}/server/lib" } },
                _ => new Dictionary<string, string>()
            }
        };
    }

    // Minimal package.json probing
    private record PackageProbe(string? Name, string? Version, string? Description, string? AuthorName, string? AuthorEmail, string? AuthorUrl, string? Main, string? License, string? RepositoryUrl);
    private static class PackageJson
    {
        public static PackageProbe TryLoad(string dir)
        {
            try
            {
                var file = Path.Combine(dir, "package.json");
                if (!File.Exists(file)) return new PackageProbe(null, null, null, null, null, null, null, null, null);
                using var doc = JsonDocument.Parse(File.ReadAllText(file));
                string? Get(params string[] path)
                {
                    JsonElement cur = doc.RootElement;
                    foreach (var p in path)
                    {
                        if (cur.ValueKind == JsonValueKind.Object && cur.TryGetProperty(p, out var next)) cur = next; else return null;
                    }
                    return cur.ValueKind switch { JsonValueKind.String => cur.GetString(), _ => null };
                }
                var name = Get("name");
                var version = Get("version");
                var description = Get("description");
                var main = Get("main");
                var authorName = Get("author", "name") ?? Get("author");
                var authorEmail = Get("author", "email");
                var authorUrl = Get("author", "url");
                var license = Get("license");
                var repoUrl = Get("repository", "url") ?? Get("repository");
                return new PackageProbe(name, version, description, authorName, authorEmail, authorUrl, main, license, repoUrl);
            }
            catch { return new PackageProbe(null, null, null, null, null, null, null, null, null); }
        }
    }
    #endregion
}