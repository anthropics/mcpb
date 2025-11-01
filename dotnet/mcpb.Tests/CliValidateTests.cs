using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Mcpb.Json;
using Xunit;
using Xunit.Abstractions;
using System.Linq;

namespace Mcpb.Tests;

public class CliValidateTests
{
    private readonly ITestOutputHelper _output;

    public CliValidateTests(ITestOutputHelper output)
    {
        _output = output;
    }
    private string CreateTempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "mcpb_cli_validate_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }
    private (int exitCode, string stdout, string stderr) InvokeCli(string workingDir, params string[] args)
    {
        var root = Mcpb.Commands.CliRoot.Build();
        var prev = Directory.GetCurrentDirectory();
        Directory.SetCurrentDirectory(workingDir);
        using var swOut = new StringWriter();
        using var swErr = new StringWriter();
        try
        {
            var code = CommandRunner.Invoke(root, args, swOut, swErr);
            return (code, swOut.ToString(), swErr.ToString());
        }
        finally { Directory.SetCurrentDirectory(prev); }
    }
    [Fact]
    public void Validate_ValidManifest_Succeeds()
    {
        var dir = CreateTempDir();
        var manifest = new Mcpb.Core.McpbManifest { Name = "ok", Description = "desc", Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" }, Server = new Mcpb.Core.McpbManifestServer { Type = "binary", EntryPoint = "server/ok", McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/ok" } } };
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        var (code, stdout, stderr) = InvokeCli(dir, "validate", "manifest.json");
        Assert.Equal(0, code);
        Assert.Contains("Manifest is valid!", stdout);
        Assert.True(string.IsNullOrWhiteSpace(stderr));
    }

    [Fact]
    public void Validate_WithDirnameOnly_UsesDefaultManifest()
    {
        var dir = CreateTempDir();
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "ok",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/ok",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/ok" }
            },
            Tools = new List<Mcpb.Core.McpbManifestTool>
            {
                new() { Name = "dummy", Description = "fake" }
            },
            Prompts = new List<Mcpb.Core.McpbManifestPrompt>
            {
                new() { Name = "prompt1", Description = "desc", Text = "body" }
            }
        };
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "ok"), "binary");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"dummy\",\"description\":\"fake\"}]");
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"prompt1\",\"description\":\"desc\",\"text\":\"body\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "validate", "--dirname", dir);
            _output.WriteLine("STDOUT: " + stdout);
            _output.WriteLine("STDERR: " + stderr);
            Assert.Equal(0, code);
            Assert.Contains("Manifest is valid!", stdout);
            Assert.True(string.IsNullOrWhiteSpace(stderr));
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Validate_MissingDescription_Fails()
    {
        var dir = CreateTempDir();
        // Build JSON manually without description
        var json = "{" +
            "\"manifest_version\":\"0.2\"," +
            "\"name\":\"ok\"," +
            "\"version\":\"1.0.0\"," +
            "\"author\":{\"name\":\"A\"}," +
            "\"server\":{\"type\":\"binary\",\"entry_point\":\"server/ok\",\"mcp_config\":{\"command\":\"${__dirname}/server/ok\"}}" +
            "}";
        File.WriteAllText(Path.Combine(dir, "manifest.json"), json);
        var (code2, stdout2, stderr2) = InvokeCli(dir, "validate", "manifest.json");
        Assert.NotEqual(0, code2);
        Assert.Contains("description is required", stderr2);
    }

    [Fact]
    public void Validate_DxtVersionOnly_Warns()
    {
        var dir = CreateTempDir();
        // JSON with only dxt_version (deprecated) no manifest_version
        var json = "{" +
            "\"dxt_version\":\"0.2\"," +
            "\"name\":\"ok\"," +
            "\"version\":\"1.0.0\"," +
            "\"description\":\"desc\"," +
            "\"author\":{\"name\":\"A\"}," +
            "\"server\":{\"type\":\"binary\",\"entry_point\":\"server/ok\",\"mcp_config\":{\"command\":\"${__dirname}/server/ok\"}}" +
            "}";
        File.WriteAllText(Path.Combine(dir, "manifest.json"), json);
        var (code3, stdout3, stderr3) = InvokeCli(dir, "validate", "manifest.json");
        Assert.Equal(0, code3);
        Assert.Contains("Manifest is valid!", stdout3);
        Assert.Contains("deprecated", stdout3 + stderr3, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_WithDirnameMissingFiles_Fails()
    {
        var dir = CreateTempDir();
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Icon = "icon.png",
            Screenshots = new List<string> { "shots/s1.png" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            }
        };
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        // Intentionally leave out icon to trigger failure
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));

        var (code, stdout, stderr) = InvokeCli(dir, "validate", "manifest.json", "--dirname", dir);
        Assert.NotEqual(0, code);
        Assert.Contains("Missing icon file", stdout + stderr);
    }

    [Fact]
    public void Validate_WithDirnameMismatchFailsWithoutUpdate()
    {
        var dir = CreateTempDir();
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            },
            Tools = new List<Mcpb.Core.McpbManifestTool> { new Mcpb.Core.McpbManifestTool { Name = "a" } },
            Prompts = new List<Mcpb.Core.McpbManifestPrompt> { new Mcpb.Core.McpbManifestPrompt { Name = "p1", Text = "existing" } }
        };
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"Tool A\"},{\"name\":\"b\",\"description\":\"Tool B\"}]");
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt A\",\"arguments\":[\"topic\"],\"text\":\"Prompt A body\"},{\"name\":\"p2\",\"description\":\"Prompt B\",\"arguments\":[\"topic\",\"style\"],\"text\":\"Prompt B body\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "validate", "manifest.json", "--dirname", dir);
            Assert.NotEqual(0, code);
            _output.WriteLine("STDOUT: " + stdout);
            _output.WriteLine("STDERR: " + stderr);
            Assert.Contains("Tool list mismatch", stdout + stderr);
            Assert.Contains("Prompt list mismatch", stdout + stderr);
            Assert.Contains("Use --update", stdout + stderr);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Validate_WithDirnameUpdate_RewritesManifest()
    {
        var dir = CreateTempDir();
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            },
            Tools = new List<Mcpb.Core.McpbManifestTool> { new Mcpb.Core.McpbManifestTool { Name = "a" } },
            Prompts = new List<Mcpb.Core.McpbManifestPrompt> { new Mcpb.Core.McpbManifestPrompt { Name = "p1", Text = "existing" } }
        };
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"Tool A\"},{\"name\":\"b\",\"description\":\"Tool B\"}]");
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt A\",\"arguments\":[\"topic\"],\"text\":\"Prompt A body\"},{\"name\":\"p2\",\"description\":\"Prompt B\",\"arguments\":[\"topic\",\"style\"],\"text\":\"Prompt B body\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "validate", "manifest.json", "--dirname", dir, "--update");
            _output.WriteLine("STDOUT: " + stdout);
            _output.WriteLine("STDERR: " + stderr);
            Assert.Equal(0, code);
            Assert.Contains("Updated manifest.json capabilities", stdout + stderr);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(Path.Combine(dir, "manifest.json")), McpbJsonContext.Default.McpbManifest)!;
            Assert.Equal(2, updated.Tools!.Count);
            Assert.Equal(2, updated.Prompts!.Count);
            Assert.Equal(false, updated.ToolsGenerated);
            Assert.Equal(false, updated.PromptsGenerated);
            var toolB = Assert.Single(updated.Tools!.Where(t => t.Name == "b"));
            Assert.Equal("Tool B", toolB.Description);
            var promptB = Assert.Single(updated.Prompts!.Where(p => p.Name == "p2"));
            Assert.Equal("Prompt B", promptB.Description);
            Assert.Equal(new[] { "topic", "style" }, promptB.Arguments);
            Assert.Equal("Prompt B body", promptB.Text);
            var promptA = Assert.Single(updated.Prompts!.Where(p => p.Name == "p1"));
            Assert.Equal("existing", promptA.Text);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Validate_WithDirnameMetadataMismatchRequiresUpdate()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            },
            Tools = new List<Mcpb.Core.McpbManifestTool> { new() { Name = "a", Description = "legacy" } },
            Prompts = new List<Mcpb.Core.McpbManifestPrompt> { new() { Name = "p1", Description = "old", Arguments = new List<string> { "topic" }, Text = "Old body" } }
        };
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"fresh\"}]");
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt new\",\"arguments\":[\"topic\",\"style\"],\"text\":\"New body\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "validate", "manifest.json", "--dirname", dir);
            Assert.NotEqual(0, code);
            Assert.Contains("metadata mismatch", stdout + stderr, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("Use --update", stdout + stderr, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Validate_WithDirnameMetadataMismatch_UpdateRewritesManifest()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            },
            Tools = new List<Mcpb.Core.McpbManifestTool> { new() { Name = "a", Description = null } },
            Prompts = new List<Mcpb.Core.McpbManifestPrompt> { new() { Name = "p1", Description = null, Arguments = new List<string> { "topic" }, Text = "Old body" } }
        };
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"fresh\"}]");
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt new\",\"arguments\":[\"topic\",\"style\"],\"text\":\"New body\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "validate", "manifest.json", "--dirname", dir, "--update");
            Assert.Equal(0, code);
            Assert.Contains("Updated manifest.json capabilities", stdout + stderr);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(Path.Combine(dir, "manifest.json")), McpbJsonContext.Default.McpbManifest)!;
            var tool = Assert.Single(updated.Tools!, t => t.Name == "a");
            Assert.Equal("fresh", tool.Description);
            var prompt = Assert.Single(updated.Prompts!, p => p.Name == "p1");
            Assert.Equal("Prompt new", prompt.Description);
            Assert.Equal(new[] { "topic", "style" }, prompt.Arguments);
            Assert.Equal("Old body", prompt.Text);
            Assert.Equal(false, updated.ToolsGenerated);
            Assert.Equal(false, updated.PromptsGenerated);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Validate_Update_AddsPromptTextWhenMissing()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            },
            Prompts = new List<Mcpb.Core.McpbManifestPrompt>
            {
                new() { Name = "p1" }
            }
        };
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt new\",\"text\":\"New body\"}]");
        try
        {
            var (code, _, _) = InvokeCli(dir, "validate", "manifest.json", "--dirname", dir, "--update");
            Assert.Equal(0, code);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(Path.Combine(dir, "manifest.json")), McpbJsonContext.Default.McpbManifest)!;
            var prompt = Assert.Single(updated.Prompts!, p => p.Name == "p1");
            Assert.Equal("New body", prompt.Text);
            Assert.Equal(false, updated.PromptsGenerated);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Validate_Update_KeepsExistingGeneratedFlags()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            },
            Tools = new List<Mcpb.Core.McpbManifestTool> { new() { Name = "a" } },
            Prompts = new List<Mcpb.Core.McpbManifestPrompt> { new() { Name = "p1", Text = "existing" } },
            ToolsGenerated = true,
            PromptsGenerated = true
        };
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"Tool A\"}]");
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt A\",\"text\":\"Prompt body\"}]");
        try
        {
            var (code, _, _) = InvokeCli(dir, "validate", "manifest.json", "--dirname", dir, "--update");
            Assert.Equal(0, code);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(Path.Combine(dir, "manifest.json")), McpbJsonContext.Default.McpbManifest)!;
            Assert.True(updated.ToolsGenerated == true);
            Assert.True(updated.PromptsGenerated == true);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Validate_Update_WarnsIfPromptTextMissing()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            },
            Tools = new List<Mcpb.Core.McpbManifestTool> { new() { Name = "a", Description = "legacy" } },
            Prompts = new List<Mcpb.Core.McpbManifestPrompt> { new() { Name = "p1", Description = "old", Text = "existing" } }
        };
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"fresh\"}]");
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt new\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "validate", "manifest.json", "--dirname", dir, "--update");
            Assert.Equal(0, code);
            Assert.Contains("Updated manifest.json capabilities", stdout + stderr);
            Assert.Contains("Manifest is valid!", stdout);
            Assert.Contains("Prompt 'p1' did not return text during discovery", stdout + stderr, StringComparison.OrdinalIgnoreCase);
            var json = File.ReadAllText(Path.Combine(dir, "manifest.json"));
            Assert.Contains("\"text\": \"existing\"", json);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Validate_UpdateWithoutDirname_Fails()
    {
        var dir = CreateTempDir();
        var manifest = new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer
            {
                Type = "binary",
                EntryPoint = "server/demo",
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" }
            }
        };
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        var (code, stdout, stderr) = InvokeCli(dir, "validate", "manifest.json", "--update");
        Assert.NotEqual(0, code);
        Assert.Contains("requires --dirname", stdout + stderr, StringComparison.OrdinalIgnoreCase);
    }
}