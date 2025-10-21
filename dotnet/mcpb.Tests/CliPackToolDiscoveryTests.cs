using System.Text.Json;
using Mcpb.Json;
using Xunit;
using System.IO;
using System.Linq;

namespace Mcpb.Tests;

public class CliPackToolDiscoveryTests
{
    private string CreateTempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "mcpb_cli_pack_" + Guid.NewGuid().ToString("N"));
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

    private Mcpb.Core.McpbManifest MakeManifest(IEnumerable<string> tools)
    {
        return new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer { Type = "binary", EntryPoint = "server/demo", McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" } },
            Tools = tools.Select(t => new Mcpb.Core.McpbManifestTool { Name = t }).ToList()
        };
    }

    [Fact]
    public void Pack_MatchingTools_Succeeds()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        // entry point expected: server/demo per manifest construction
        var manifest = MakeManifest(new[] { "a", "b" });
        manifest.Tools![0].Description = "Tool A";
        manifest.Tools![1].Description = "Tool B";
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"Tool A\"},{\"name\":\"b\",\"description\":\"Tool B\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--no-discover=false");
            Assert.Equal(0, code);
            Assert.Contains("demo@", stdout);
        }
        finally { Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null); }
    }

    [Fact]
    public void Pack_MismatchTools_Fails()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(MakeManifest(new[] { "a" }), McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"Tool A\"},{\"name\":\"b\",\"description\":\"Tool B\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir);
            Assert.NotEqual(0, code);
            Assert.Contains("Discovered capabilities differ", (stderr + stdout));
        }
        finally { Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null); }
    }

    [Fact]
    public void Pack_MismatchTools_Force_Succeeds()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(MakeManifest(new[] { "a" }), McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"Tool A\"},{\"name\":\"b\",\"description\":\"Tool B\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--force");
            Assert.Equal(0, code);
            Assert.Contains("Proceeding due to --force", stdout + stderr);
        }
        finally { Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null); }
    }

    [Fact]
    public void Pack_MismatchTools_Update_UpdatesManifest()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(MakeManifest(new[] { "a" }), McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"Tool A\"},{\"name\":\"b\",\"description\":\"Tool B\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--update");
            Assert.Equal(0, code);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(manifestPath), McpbJsonContext.Default.McpbManifest)!;
            var added = Assert.Single(updated.Tools!.Where(t => t.Name == "b"));
            Assert.Equal("Tool B", added.Description);
            Assert.Equal(2, updated.Tools!.Count);
            Assert.Equal(false, updated.ToolsGenerated);
        }
        finally { Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null); }
    }

    [Fact]
    public void Pack_ToolMetadataMismatch_FailsWithoutUpdate()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = MakeManifest(new[] { "a" });
        manifest.Tools![0].Description = "legacy";
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"fresh\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir);
            Assert.NotEqual(0, code);
            Assert.Contains("Tool metadata mismatch", stdout + stderr);
            Assert.Contains("description differs", stdout + stderr);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Pack_ToolMetadataMismatch_UpdateRewritesDescriptions()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = MakeManifest(new[] { "a" });
        manifest.Tools![0].Description = null;
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"fresh\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--update");
            Assert.Equal(0, code);
            Assert.Contains("Updated manifest.json capabilities", stdout + stderr);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(manifestPath), McpbJsonContext.Default.McpbManifest)!;
            Assert.Equal("fresh", updated.Tools!.Single(t => t.Name == "a").Description);
            Assert.Equal(false, updated.ToolsGenerated);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Pack_Update_KeepsExistingToolsGeneratedFlag()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = MakeManifest(new[] { "a" });
        manifest.ToolsGenerated = true;
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"fresh\"}]");
        try
        {
            var (code, _, _) = InvokeCli(dir, "pack", dir, "--update");
            Assert.Equal(0, code);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(manifestPath), McpbJsonContext.Default.McpbManifest)!;
            Assert.True(updated.ToolsGenerated == true);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Pack_Update_DoesNotEscapeApostrophes()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = MakeManifest(new[] { "a" });
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[{\"name\":\"a\",\"description\":\"Author's Tool\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--update");
            Assert.Equal(0, code);
            Assert.Contains("Updated manifest.json capabilities", stdout + stderr);
            var jsonText = File.ReadAllText(manifestPath);
            Assert.Contains("\"description\": \"Author's Tool\"", jsonText);
            Assert.DoesNotContain("\\u0027", jsonText);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(jsonText, McpbJsonContext.Default.McpbManifest)!;
            Assert.Equal("Author's Tool", updated.Tools!.Single(t => t.Name == "a").Description);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
        }
    }
}
