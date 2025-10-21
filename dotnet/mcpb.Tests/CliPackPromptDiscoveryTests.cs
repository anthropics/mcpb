using System.Text.Json;
using Mcpb.Json;
using Xunit;
using System.IO;
using System.Linq;

namespace Mcpb.Tests;

public class CliPackPromptDiscoveryTests
{
    private string CreateTempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "mcpb_cli_pack_prompts_" + Guid.NewGuid().ToString("N"));
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

    private Mcpb.Core.McpbManifest MakeManifest(string[] prompts)
    {
        return new Mcpb.Core.McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
            Server = new Mcpb.Core.McpbManifestServer { Type = "binary", EntryPoint = "server/demo", McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "${__dirname}/server/demo" } },
            Prompts = prompts.Select(p => new Mcpb.Core.McpbManifestPrompt { Name = p, Text = "t" }).ToList()
        };
    }

    [Fact]
    public void Pack_PromptMismatch_Fails()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(MakeManifest(new[] { "p1" }), McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[\"p1\",\"p2\"]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir);
            Assert.NotEqual(0, code);
            Assert.Contains("Prompt list mismatch", stdout + stderr);
        }
        finally { Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null); }
    }

    [Fact]
    public void Pack_PromptMismatch_Update_Succeeds()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(MakeManifest(new[] { "p1" }), McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[\"p1\",\"p2\"]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--update");
            Assert.Equal(0, code);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(manifestPath), McpbJsonContext.Default.McpbManifest)!;
            Assert.Equal(2, updated.Prompts!.Count);
            Assert.Equal(false, updated.PromptsGenerated);
        }
        finally { Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null); }
    }

    [Fact]
    public void Pack_PromptMismatch_Force_Succeeds()
    {
        var dir = CreateTempDir();
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(MakeManifest(new[] { "p1" }), McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[\"p1\",\"p2\"]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--force");
            Assert.Equal(0, code);
            Assert.Contains("Proceeding due to --force", stdout + stderr);
        }
        finally { Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null); }
    }

    [Fact]
    public void Pack_Update_PreservesPromptTextWhenDiscoveryMissing()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = MakeManifest(new[] { "p1" });
        manifest.Prompts![0].Text = "existing body";
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt\"}]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--update");
            Assert.Equal(0, code);
            Assert.Contains("Prompt 'p1' did not return text during discovery", stdout + stderr);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(manifestPath), McpbJsonContext.Default.McpbManifest)!;
            Assert.Equal("existing body", updated.Prompts!.Single(p => p.Name == "p1").Text);
            Assert.Equal(false, updated.PromptsGenerated);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Pack_Update_DoesNotOverwriteExistingPromptText()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = MakeManifest(new[] { "p1" });
        manifest.Prompts![0].Text = "existing body";
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt\",\"text\":\"discovered body\"}]");
        try
        {
            var (code, _, _) = InvokeCli(dir, "pack", dir, "--update");
            Assert.Equal(0, code);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(manifestPath), McpbJsonContext.Default.McpbManifest)!;
            var prompt = Assert.Single(updated.Prompts!, p => p.Name == "p1");
            Assert.Equal("existing body", prompt.Text);
            Assert.Equal(false, updated.PromptsGenerated);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }
    [Fact]
    public void Pack_Update_KeepsExistingPromptsGeneratedFlag()
    {
        var dir = CreateTempDir();
        var manifestPath = Path.Combine(dir, "manifest.json");
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        File.WriteAllText(Path.Combine(dir, "server", "demo"), "binary");
        var manifest = MakeManifest(new[] { "p1" });
        manifest.PromptsGenerated = true;
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", "[{\"name\":\"p1\",\"description\":\"Prompt\",\"text\":\"body\"}]");
        try
        {
            var (code, _, _) = InvokeCli(dir, "pack", dir, "--update");
            Assert.Equal(0, code);
            var updated = JsonSerializer.Deserialize<Mcpb.Core.McpbManifest>(File.ReadAllText(manifestPath), McpbJsonContext.Default.McpbManifest)!;
            Assert.True(updated.PromptsGenerated == true);
            var prompt = Assert.Single(updated.Prompts!, p => p.Name == "p1");
            Assert.Equal("t", prompt.Text);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_PROMPT_DISCOVERY_JSON", null);
        }
    }
}
