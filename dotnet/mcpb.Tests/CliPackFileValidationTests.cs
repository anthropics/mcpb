using System.Text.Json;
using Xunit;
using System.IO;
using Mcpb.Json;

namespace Mcpb.Tests;

public class CliPackFileValidationTests
{
    private string CreateTempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "mcpb_cli_pack_files_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        Directory.CreateDirectory(Path.Combine(dir, "server"));
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

    private Mcpb.Core.McpbManifest BaseManifest() => new Mcpb.Core.McpbManifest
    {
        Name = "demo",
        Description = "desc",
        Author = new Mcpb.Core.McpbManifestAuthor { Name = "A" },
        Icon = "icon.png",
        Screenshots = new List<string> { "shots/s1.png" },
        Server = new Mcpb.Core.McpbManifestServer
        {
            Type = "node",
            EntryPoint = "server/index.js",
            McpConfig = new Mcpb.Core.McpServerConfigWithOverrides { Command = "node", Args = new List<string> { "${__dirname}/server/index.js" } }
        }
    };

    [Fact]
    public void Pack_MissingIcon_Fails()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        Directory.CreateDirectory(Path.Combine(dir, "shots"));
        File.WriteAllText(Path.Combine(dir, "shots", "s1.png"), "fake");
        var manifest = BaseManifest();
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        var (code, _, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.NotEqual(0, code);
        Assert.Contains("Missing icon file", stderr);
    }

    [Fact]
    public void Pack_MissingEntryPoint_Fails()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
        Directory.CreateDirectory(Path.Combine(dir, "shots"));
        File.WriteAllText(Path.Combine(dir, "shots", "s1.png"), "fake");
        var manifest = BaseManifest();
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        var (code, _, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.NotEqual(0, code);
        Assert.Contains("Missing entry_point file", stderr);
    }

    [Fact]
    public void Pack_MissingScreenshot_Fails()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        var manifest = BaseManifest();
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        var (code, _, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.NotEqual(0, code);
        Assert.Contains("Missing screenshot file", stderr);
    }

    [Fact]
    public void Pack_PathLikeCommandMissing_Fails()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        Directory.CreateDirectory(Path.Combine(dir, "shots"));
        File.WriteAllText(Path.Combine(dir, "shots", "s1.png"), "fake");
        var manifest = BaseManifest();
        // Make command path-like to trigger validation
        manifest.Server.McpConfig.Command = "${__dirname}/server/missing.js";
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        var (code, _, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.NotEqual(0, code);
        Assert.Contains("Missing server.command file", stderr);
    }

    [Fact]
    public void Pack_AllFilesPresent_Succeeds()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "icon.png"), "fakeicon");
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        Directory.CreateDirectory(Path.Combine(dir, "shots"));
        File.WriteAllText(Path.Combine(dir, "shots", "s1.png"), "fake");
        var manifest = BaseManifest();
        // Ensure command not path-like (node) so validation doesn't require it to exist as file
        File.WriteAllText(Path.Combine(dir, "manifest.json"), JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions));
        var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.Equal(0, code);
        Assert.Contains("demo@", stdout);
        Assert.DoesNotContain("Missing", stderr);
    }
}
