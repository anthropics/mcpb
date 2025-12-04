using System.Text.Json.Serialization;

namespace Mcpb.Core;

public class McpServerConfig
{
    [JsonPropertyName("command")] public string Command { get; set; } = "node";
    [JsonPropertyName("args")] public List<string>? Args { get; set; } = new();
    [JsonPropertyName("env")] public Dictionary<string, string>? Env { get; set; }
}

public class McpServerConfigWithOverrides : McpServerConfig
{
    [JsonPropertyName("platform_overrides")] public Dictionary<string, McpServerConfig?>? PlatformOverrides { get; set; }
}

public class McpbManifestServer
{
    [JsonPropertyName("type")] public string Type { get; set; } = "node"; // python|node|binary
    [JsonPropertyName("entry_point")] public string EntryPoint { get; set; } = "server/index.js";
    [JsonPropertyName("mcp_config")] public McpServerConfigWithOverrides McpConfig { get; set; } = new();
}

public class McpbManifestAuthor
{
    [JsonPropertyName("name")] public string Name { get; set; } = "Unknown Author";
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("url")] public string? Url { get; set; }
}

public class McpbManifestRepository
{
    [JsonPropertyName("type")] public string Type { get; set; } = "git";
    [JsonPropertyName("url")] public string Url { get; set; } = string.Empty;
}

public class McpbManifestCompatibilityRuntimes
{
    [JsonPropertyName("python")] public string? Python { get; set; }
    [JsonPropertyName("node")] public string? Node { get; set; }
}

public class McpbManifestCompatibility
{
    [JsonPropertyName("claude_desktop")] public string? ClaudeDesktop { get; set; }
    [JsonPropertyName("platforms")] public List<string>? Platforms { get; set; }
    [JsonPropertyName("runtimes")] public McpbManifestCompatibilityRuntimes? Runtimes { get; set; }
}

public class McpbManifestTool
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string? Description { get; set; }
}

public class McpbManifestPrompt
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("arguments")] public List<string>? Arguments { get; set; }
    [JsonPropertyName("text")] public string Text { get; set; } = string.Empty;
}

public class McpbUserConfigOption
{
    [JsonPropertyName("type")] public string Type { get; set; } = "string"; // string|number|boolean|directory|file
    [JsonPropertyName("title")] public string Title { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string Description { get; set; } = string.Empty;
    [JsonPropertyName("required")] public bool? Required { get; set; }
    [JsonPropertyName("default")] public object? Default { get; set; }
    [JsonPropertyName("multiple")] public bool? Multiple { get; set; }
    [JsonPropertyName("sensitive")] public bool? Sensitive { get; set; }
    [JsonPropertyName("min")] public double? Min { get; set; }
    [JsonPropertyName("max")] public double? Max { get; set; }
}

public class McpbInitializeResult
{
    [JsonPropertyName("protocolVersion")] public string? ProtocolVersion { get; set; }
    [JsonPropertyName("capabilities")] public object? Capabilities { get; set; }
    [JsonPropertyName("serverInfo")] public object? ServerInfo { get; set; }
    [JsonPropertyName("instructions")] public string? Instructions { get; set; }
}

public class McpbToolsListResult
{
    [JsonPropertyName("tools")] public List<object>? Tools { get; set; }
}

public class McpbStaticResponses
{
    [JsonPropertyName("initialize")] public object? Initialize { get; set; }
    [JsonPropertyName("tools/list")] public McpbToolsListResult? ToolsList { get; set; }
}

public class McpbWindowsMeta
{
    [JsonPropertyName("static_responses")] public McpbStaticResponses? StaticResponses { get; set; }
}

public class McpbManifest
{
    [JsonPropertyName("$schema")] public string? Schema { get; set; }
    // Deprecated: prefer manifest_version
    [JsonPropertyName("dxt_version")] public string? DxtVersion { get; set; }
    [JsonPropertyName("manifest_version")] public string ManifestVersion { get; set; } = "0.2";
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("display_name")] public string? DisplayName { get; set; }
    [JsonPropertyName("version")] public string Version { get; set; } = "1.0.0";
    [JsonPropertyName("description")] public string Description { get; set; } = "A MCPB bundle";
    [JsonPropertyName("long_description")] public string? LongDescription { get; set; }
    [JsonPropertyName("author")] public McpbManifestAuthor Author { get; set; } = new();
    [JsonPropertyName("repository")] public McpbManifestRepository? Repository { get; set; }
    [JsonPropertyName("homepage")] public string? Homepage { get; set; }
    [JsonPropertyName("documentation")] public string? Documentation { get; set; }
    [JsonPropertyName("support")] public string? Support { get; set; }
    [JsonPropertyName("icon")] public string? Icon { get; set; }
    [JsonPropertyName("screenshots")] public List<string>? Screenshots { get; set; }
    [JsonPropertyName("server")] public McpbManifestServer Server { get; set; } = new();
    [JsonPropertyName("tools")] public List<McpbManifestTool>? Tools { get; set; }
    [JsonPropertyName("tools_generated")] public bool? ToolsGenerated { get; set; }
    [JsonPropertyName("prompts")] public List<McpbManifestPrompt>? Prompts { get; set; }
    [JsonPropertyName("prompts_generated")] public bool? PromptsGenerated { get; set; }
    [JsonPropertyName("keywords")] public List<string>? Keywords { get; set; }
    [JsonPropertyName("license")] public string? License { get; set; } = "MIT";
    [JsonPropertyName("privacy_policies")] public List<string>? PrivacyPolicies { get; set; }
    [JsonPropertyName("compatibility")] public McpbManifestCompatibility? Compatibility { get; set; }
    [JsonPropertyName("user_config")] public Dictionary<string, McpbUserConfigOption>? UserConfig { get; set; }
    [JsonPropertyName("_meta")] public Dictionary<string, Dictionary<string, object>>? Meta { get; set; }
}

public static class ManifestDefaults
{
    public static McpbManifest Create(string dir) => Create(dir, DetectServerType(dir), null);

    public static McpbManifest Create(string dir, string serverType, string? entryPoint)
    {
        var name = new DirectoryInfo(dir).Name;
        if (string.IsNullOrWhiteSpace(serverType)) serverType = "binary";
        bool isWindows = OperatingSystem.IsWindows();
        entryPoint ??= serverType switch
        {
            "node" => "server/index.js",
            "python" => "server/main.py",
            _ => isWindows ? $"server/{name}.exe" : $"server/{name}" // binary
        };
        return new McpbManifest
        {
            Name = name,
            Author = new McpbManifestAuthor { Name = "Unknown Author" },
            Server = new McpbManifestServer
            {
                Type = serverType,
                EntryPoint = entryPoint,
                McpConfig = new McpServerConfigWithOverrides
                {
                    Command = serverType switch
                    {
                        "node" => "node",
                        "python" => "python",
                        _ => isWindows ? "${__dirname}/" + entryPoint : "${__dirname}/" + entryPoint
                    },
                    Args = serverType switch
                    {
                        "node" => new List<string> { "${__dirname}/" + entryPoint },
                        "python" => new List<string> { "${__dirname}/" + entryPoint },
                        _ => new List<string>()
                    },
                    Env = new Dictionary<string, string>()
                }
            },
            Keywords = new List<string>()
        };
    }

    private static string DetectServerType(string dir)
    {
        // Heuristics: prefer node if package.json + server/index.js, python if server/main.py, else binary
        bool hasNode = File.Exists(Path.Combine(dir, "package.json")) && File.Exists(Path.Combine(dir, "server", "index.js"));
        bool hasPython = File.Exists(Path.Combine(dir, "server", "main.py"));
        return hasNode ? "node" : (hasPython ? "python" : "binary");
    }
}
