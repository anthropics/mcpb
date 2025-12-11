using System.Collections.Generic;
using System.Text.Json;
using Mcpb.Core;
using Mcpb.Json;
using Xunit;

namespace Mcpb.Tests;

public class MetaFieldTests
{
    [Fact]
    public void Manifest_CanHaveMeta()
    {
        var manifest = new McpbManifest
        {
            ManifestVersion = "0.2",
            Name = "test",
            Version = "1.0.0",
            Description = "Test manifest",
            Author = new McpbManifestAuthor { Name = "Test Author" },
            Server = new McpbManifestServer
            {
                Type = "node",
                EntryPoint = "server/index.js",
                McpConfig = new McpServerConfigWithOverrides
                {
                    Command = "node",
                    Args = new List<string> { "server/index.js" }
                }
            },
            Meta = new Dictionary<string, Dictionary<string, object>>
            {
                ["com.microsoft.windows"] = new Dictionary<string, object>
                {
                    ["package_family_name"] = "TestPackage_123",
                    ["channel"] = "stable"
                }
            }
        };

        var json = JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions);
        Assert.Contains("\"_meta\"", json);
        Assert.Contains("\"com.microsoft.windows\"", json);
        Assert.Contains("\"package_family_name\"", json);

        var deserialized = JsonSerializer.Deserialize<McpbManifest>(json, McpbJsonContext.Default.McpbManifest);
        Assert.NotNull(deserialized);
        Assert.NotNull(deserialized.Meta);
        Assert.True(deserialized.Meta.ContainsKey("com.microsoft.windows"));
    }

    [Fact]
    public void Manifest_MetaIsOptional()
    {
        var manifest = new McpbManifest
        {
            ManifestVersion = "0.2",
            Name = "test",
            Version = "1.0.0",
            Description = "Test manifest",
            Author = new McpbManifestAuthor { Name = "Test Author" },
            Server = new McpbManifestServer
            {
                Type = "node",
                EntryPoint = "server/index.js",
                McpConfig = new McpServerConfigWithOverrides
                {
                    Command = "node",
                    Args = new List<string> { "server/index.js" }
                }
            }
        };

        var json = JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions);
        Assert.DoesNotContain("\"_meta\"", json);
    }

    [Fact]
    public void Manifest_CanDeserializeWithWindowsMeta()
    {
        var json = @"{
            ""manifest_version"": ""0.2"",
            ""name"": ""test"",
            ""version"": ""1.0.0"",
            ""description"": ""Test manifest"",
            ""author"": { ""name"": ""Test Author"" },
            ""server"": {
                ""type"": ""node"",
                ""entry_point"": ""server/index.js"",
                ""mcp_config"": {
                    ""command"": ""node"",
                    ""args"": [""server/index.js""]
                }
            },
            ""_meta"": {
                ""com.microsoft.windows"": {
                    ""static_responses"": {
                        ""initialize"": {
                            ""protocolVersion"": ""2025-06-18"",
                            ""serverInfo"": {
                                ""name"": ""test"",
                                ""version"": ""1.0.0""
                            }
                        },
                        ""tools/list"": {
                            ""tools"": [
                                {
                                    ""name"": ""tool1"",
                                    ""description"": ""First tool"",
                                    ""inputSchema"": {
                                        ""type"": ""object"",
                                        ""properties"": {
                                            ""query"": {
                                                ""type"": ""string"",
                                                ""description"": ""Search query""
                                            }
                                        }
                                    },
                                    ""outputSchema"": {
                                        ""type"": ""object"",
                                        ""properties"": {
                                            ""results"": {
                                                ""type"": ""array""
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        }";

        var manifest = JsonSerializer.Deserialize<McpbManifest>(json, McpbJsonContext.Default.McpbManifest);
        Assert.NotNull(manifest);
        Assert.NotNull(manifest.Meta);
        Assert.True(manifest.Meta.ContainsKey("com.microsoft.windows"));
        
        // Verify we can extract the Windows meta
        var windowsMeta = GetWindowsMetaFromManifest(manifest);
        Assert.NotNull(windowsMeta);
        Assert.NotNull(windowsMeta.StaticResponses);
        Assert.NotNull(windowsMeta.StaticResponses.Initialize);
        Assert.NotNull(windowsMeta.StaticResponses.ToolsList);
        Assert.NotNull(windowsMeta.StaticResponses.ToolsList.Tools);
        Assert.Single(windowsMeta.StaticResponses.ToolsList.Tools);
        
        // Verify the tool has the expected structure with inputSchema and outputSchema
        var toolJson = JsonSerializer.Serialize(windowsMeta.StaticResponses.ToolsList.Tools[0]);
        Assert.Contains("\"inputSchema\"", toolJson);
        Assert.Contains("\"outputSchema\"", toolJson);
        Assert.Contains("\"query\"", toolJson);
        Assert.Contains("\"results\"", toolJson);
    }
    
    [Fact]
    public void StaticResponses_ContainInputAndOutputSchemas()
    {
        // This test verifies that tool schemas include both inputSchema and outputSchema
        var initResult = new McpbInitializeResult
        {
            ProtocolVersion = "2025-06-18",
            Capabilities = new { tools = new { listChanged = (object?)null } },
            ServerInfo = new { name = "test-server", version = "1.0.0" },
            Instructions = null
        };

        var toolsListResult = new McpbToolsListResult
        {
            Tools = new List<object>
            {
                new
                {
                    name = "search_tool",
                    description = "A search tool",
                    inputSchema = new
                    {
                        type = "object",
                        properties = new
                        {
                            query = new { type = "string", description = "Search query" },
                            maxResults = new { type = "number", description = "Max results" }
                        },
                        required = new[] { "query" }
                    },
                    outputSchema = new
                    {
                        type = "object",
                        properties = new
                        {
                            results = new { type = "array" },
                            count = new { type = "number" }
                        }
                    }
                }
            }
        };

        var staticResponses = new McpbStaticResponses
        {
            Initialize = initResult,
            ToolsList = toolsListResult
        };

        // Serialize to verify structure
        var json = JsonSerializer.Serialize(staticResponses, new JsonSerializerOptions { WriteIndented = true });
        
        // Output to test logs for CI verification
        Console.WriteLine("=== Static Responses Structure ===");
        Console.WriteLine(json);
        Console.WriteLine("=== End Static Responses ===");

        // Verify the JSON contains expected schemas
        Assert.Contains("\"inputSchema\"", json);
        Assert.Contains("\"outputSchema\"", json);
        Assert.Contains("\"query\"", json);
        Assert.Contains("\"maxResults\"", json);
        Assert.Contains("\"results\"", json);
        Assert.Contains("\"protocolVersion\"", json);
        Assert.Contains("2025-06-18", json);
    }
    
    private static McpbWindowsMeta? GetWindowsMetaFromManifest(McpbManifest manifest)
    {
        if (manifest.Meta == null || !manifest.Meta.TryGetValue("com.microsoft.windows", out var windowsMetaDict))
        {
            return null;
        }
        
        try
        {
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };
            var json = JsonSerializer.Serialize(windowsMetaDict, options);
            return JsonSerializer.Deserialize<McpbWindowsMeta>(json, options);
        }
        catch
        {
            return null;
        }
    }
}
