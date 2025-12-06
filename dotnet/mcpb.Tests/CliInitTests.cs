using System.Text.Json;
using Xunit;
using Mcpb.Json;
using Mcpb.Core;

namespace Mcpb.Tests;

public class CliInitTests
{
    [Fact]
    public void InitYes_CreatesManifestWithBinaryDefaults()
    {
        var temp = Path.Combine(Path.GetTempPath(), "mcpb_cli_init_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
    var root = Mcpb.Commands.CliRoot.Build();
        var prevCwd = Directory.GetCurrentDirectory();
        Directory.SetCurrentDirectory(temp);
        try
        {
            using var swOut = new StringWriter();
            using var swErr = new StringWriter();
            var code = CommandRunner.Invoke(root, new[]{"init","--yes"}, swOut, swErr);
            Assert.Equal(0, code);
        }
        finally { Directory.SetCurrentDirectory(prevCwd); }
        var manifestPath = Path.Combine(temp, "manifest.json");
        Assert.True(File.Exists(manifestPath), "manifest.json not created");
        var json = File.ReadAllText(manifestPath);
        var manifest = JsonSerializer.Deserialize(json, McpbJsonContext.Default.McpbManifest)!;
        Assert.Equal("0.2", manifest.ManifestVersion);
        Assert.Equal("binary", manifest.Server.Type);
        Assert.False(string.IsNullOrWhiteSpace(manifest.Server.EntryPoint));
        Assert.NotNull(manifest.Author);
        // Ensure display name not set unless different
        if (manifest.DisplayName != null) Assert.NotEqual(manifest.Name, manifest.DisplayName);
    }
}