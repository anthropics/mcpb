using System;
using System.IO;
using System.Text.Json;
using Mcpb.Json;
using Xunit;

namespace Mcpb.Tests;

public class CliPackFileValidationTests
{
    private string CreateTempDir()
    {
        var dir = Path.Combine(
            Path.GetTempPath(),
            "mcpb_cli_pack_files_" + Guid.NewGuid().ToString("N")
        );
        Directory.CreateDirectory(dir);
        Directory.CreateDirectory(Path.Combine(dir, "server"));
        return dir;
    }

    private (int exitCode, string stdout, string stderr) InvokeCli(
        string workingDir,
        params string[] args
    )
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
        finally
        {
            Directory.SetCurrentDirectory(prev);
        }
    }

    private Mcpb.Core.McpbManifest BaseManifest() =>
        new Mcpb.Core.McpbManifest
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
                McpConfig = new Mcpb.Core.McpServerConfigWithOverrides
                {
                    Command = "node",
                    Args = new List<string> { "${__dirname}/server/index.js" },
                },
            },
        };

    [Fact]
    public void Pack_MissingIcon_Fails()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        Directory.CreateDirectory(Path.Combine(dir, "shots"));
        File.WriteAllText(Path.Combine(dir, "shots", "s1.png"), "fake");
        var manifest = BaseManifest();
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
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
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
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
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
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
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
        var (code, _, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.NotEqual(0, code);
        Assert.Contains("Missing server.command file", stderr);
    }

    [Fact]
    public void Pack_CommandWindowsAlias_Succeeds()
    {
        var aliasDir = Path.Combine(
            Path.GetTempPath(),
            "mcpb_windows_alias_" + Guid.NewGuid().ToString("N")
        );
        Directory.CreateDirectory(aliasDir);
        var aliasName = "alias-command.exe";
        File.WriteAllText(Path.Combine(aliasDir, aliasName), "alias");
        var previousAliases = Environment.GetEnvironmentVariable("MCPB_WINDOWS_APP_ALIAS_DIRS");
        Environment.SetEnvironmentVariable("MCPB_WINDOWS_APP_ALIAS_DIRS", aliasDir);
        try
        {
            var dir = CreateTempDir();
            File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
            File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
            Directory.CreateDirectory(Path.Combine(dir, "shots"));
            File.WriteAllText(Path.Combine(dir, "shots", "s1.png"), "fake");
            var manifest = BaseManifest();
            manifest.Server.McpConfig.Command = aliasName;
            File.WriteAllText(
                Path.Combine(dir, "manifest.json"),
                JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
            );
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
            Assert.Equal(0, code);
            Assert.Contains("demo@", stdout);
            Assert.DoesNotContain("Missing server.command", stderr);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_WINDOWS_APP_ALIAS_DIRS", previousAliases);
            try
            {
                Directory.Delete(aliasDir, true);
            }
            catch
            {
                // Ignore cleanup failures in tests
            }
        }
    }

    [Fact]
    public void Pack_EntryPointWindowsAlias_Succeeds()
    {
        var aliasDir = Path.Combine(
            Path.GetTempPath(),
            "mcpb_windows_alias_" + Guid.NewGuid().ToString("N")
        );
        Directory.CreateDirectory(aliasDir);
        var aliasName = "alias-entry.exe";
        File.WriteAllText(Path.Combine(aliasDir, aliasName), "alias");
        var previousAliases = Environment.GetEnvironmentVariable("MCPB_WINDOWS_APP_ALIAS_DIRS");
        Environment.SetEnvironmentVariable("MCPB_WINDOWS_APP_ALIAS_DIRS", aliasDir);
        try
        {
            var dir = CreateTempDir();
            File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
            File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
            Directory.CreateDirectory(Path.Combine(dir, "shots"));
            File.WriteAllText(Path.Combine(dir, "shots", "s1.png"), "fake");
            var manifest = BaseManifest();
            manifest.Server.EntryPoint = aliasName;
            File.WriteAllText(
                Path.Combine(dir, "manifest.json"),
                JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
            );
            var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
            Assert.Equal(0, code);
            Assert.Contains("demo@", stdout);
            Assert.DoesNotContain("Missing entry_point", stderr);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_WINDOWS_APP_ALIAS_DIRS", previousAliases);
            try
            {
                Directory.Delete(aliasDir, true);
            }
            catch
            {
                // Ignore cleanup failures in tests
            }
        }
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
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
        var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.Equal(0, code);
        Assert.Contains("demo@", stdout);
        Assert.DoesNotContain("Missing", stderr);
    }

    [Fact]
    public void Pack_MissingIconsFile_Fails()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        var manifest = BaseManifest();
        manifest.ManifestVersion = "0.3";
        manifest.Icons = new List<Mcpb.Core.McpbManifestIcon>
        {
            new() { Src = "icon-16.png", Size = "16x16" },
        };
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
        var (code, _, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.NotEqual(0, code);
        Assert.Contains("Missing icons[0] file", stderr);
    }

    [Fact]
    public void Pack_IconsFilePresent_Succeeds()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
        File.WriteAllText(Path.Combine(dir, "icon-16.png"), "fake16");
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        var manifest = BaseManifest();
        manifest.ManifestVersion = "0.3";
        manifest.Screenshots = null; // Remove screenshots requirement for this test
        manifest.Icons = new List<Mcpb.Core.McpbManifestIcon>
        {
            new() { Src = "icon-16.png", Size = "16x16" },
        };
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
        var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.True(code == 0, $"Pack failed with code {code}. Stderr: {stderr}");
        Assert.Contains("demo@", stdout);
    }

    [Fact]
    public void Pack_MissingLocalizationResources_Fails()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        var manifest = BaseManifest();
        manifest.ManifestVersion = "0.3";
        manifest.Localization = new Mcpb.Core.McpbManifestLocalization
        {
            Resources = "locales/${locale}/messages.json",
            DefaultLocale = "en-US",
        };
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
        var (code, _, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.NotEqual(0, code);
        Assert.Contains("Missing localization resources", stderr);
    }

    [Fact]
    public void Pack_LocalizationResourcesPresent_Succeeds()
    {
        var dir = CreateTempDir();
        File.WriteAllText(Path.Combine(dir, "icon.png"), "fake");
        File.WriteAllText(Path.Combine(dir, "server", "index.js"), "// js");
        Directory.CreateDirectory(Path.Combine(dir, "locales", "en-US"));
        File.WriteAllText(Path.Combine(dir, "locales", "en-US", "messages.json"), "{}");
        var manifest = BaseManifest();
        manifest.ManifestVersion = "0.3";
        manifest.Screenshots = null; // Remove screenshots requirement for this test
        manifest.Localization = new Mcpb.Core.McpbManifestLocalization
        {
            Resources = "locales/${locale}/messages.json",
            DefaultLocale = "en-US",
        };
        File.WriteAllText(
            Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
        var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--no-discover");
        Assert.True(code == 0, $"Pack failed with code {code}. Stderr: {stderr}");
        Assert.Contains("demo@", stdout);
    }
}
