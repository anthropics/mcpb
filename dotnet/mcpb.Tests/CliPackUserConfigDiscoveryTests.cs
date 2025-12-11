using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Mcpb.Core;
using Mcpb.Json;
using Xunit;

namespace Mcpb.Tests;

public class CliPackUserConfigDiscoveryTests
{
    private string CreateTempDir()
    {
        var dir = Path.Combine(
            Path.GetTempPath(),
            "mcpb_cli_pack_uc_" + Guid.NewGuid().ToString("N")
        );
        Directory.CreateDirectory(dir);
        return dir;
    }

    private (int exitCode, string stdout, string stderr) InvokeCli(
        string workingDir,
        params string[] args
    )
    {
        var root = Mcpb.Commands.CliRoot.Build();
        var previous = Directory.GetCurrentDirectory();
        Directory.SetCurrentDirectory(workingDir);
        using var stdoutWriter = new StringWriter();
        using var stderrWriter = new StringWriter();
        try
        {
            var code = CommandRunner.Invoke(root, args, stdoutWriter, stderrWriter);
            return (code, stdoutWriter.ToString(), stderrWriter.ToString());
        }
        finally
        {
            Directory.SetCurrentDirectory(previous);
        }
    }

    private McpbManifest CreateManifest()
    {
        return new McpbManifest
        {
            Name = "demo",
            Description = "desc",
            Author = new McpbManifestAuthor { Name = "Author" },
            Server = new McpbManifestServer
            {
                Type = "node",
                EntryPoint = "server/index.js",
                McpConfig = new McpServerConfigWithOverrides
                {
                    Command = "node",
                    Args = new List<string>
                    {
                        "${__dirname}/server/index.js",
                        "--api-key=${user_config.api_key}",
                    },
                },
            },
            UserConfig = new Dictionary<string, McpbUserConfigOption>
            {
                ["api_key"] = new McpbUserConfigOption
                {
                    Title = "API Key",
                    Description = "API key for the service",
                    Type = "string",
                    Required = true,
                },
            },
            Tools = new List<McpbManifestTool>(),
        };
    }

    private McpbManifest CreateMultiValueManifest()
    {
        return new McpbManifest
        {
            Name = "multi",
            Description = "multi",
            Author = new McpbManifestAuthor { Name = "Author" },
            Server = new McpbManifestServer
            {
                Type = "node",
                EntryPoint = "server/index.js",
                McpConfig = new McpServerConfigWithOverrides
                {
                    Command = "node",
                    Args = new List<string>
                    {
                        "${__dirname}/server/index.js",
                        "--allow",
                        "${user_config.allowed_directories}",
                    },
                },
            },
            UserConfig = new Dictionary<string, McpbUserConfigOption>
            {
                ["allowed_directories"] = new McpbUserConfigOption
                {
                    Title = "Dirs",
                    Description = "Allowed directories",
                    Type = "directory",
                    Required = true,
                    Multiple = true,
                },
            },
            Tools = new List<McpbManifestTool>(),
        };
    }

    private void WriteManifest(string dir, McpbManifest manifest)
    {
        var manifestPath = Path.Combine(dir, "manifest.json");
        File.WriteAllText(
            manifestPath,
            JsonSerializer.Serialize(manifest, McpbJsonContext.WriteOptions)
        );
    }

    private void WriteServerFiles(string dir)
    {
        var serverDir = Path.Combine(dir, "server");
        Directory.CreateDirectory(serverDir);
        File.WriteAllText(Path.Combine(serverDir, "index.js"), "console.log('hello');");
    }

    [Fact]
    public void Pack_DiscoveryFails_WhenRequiredUserConfigMissing()
    {
        var dir = CreateTempDir();
        WriteServerFiles(dir);
        WriteManifest(dir, CreateManifest());

        var (code, stdout, stderr) = InvokeCli(dir, "pack", dir, "--no-discover=false");

        Assert.NotEqual(0, code);
        var combined = stdout + stderr;
        Assert.Contains("user_config", combined, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("api_key", combined, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("--user_config", combined, StringComparison.Ordinal);
    }

    [Fact]
    public void Pack_DiscoverySucceeds_WhenUserConfigProvided()
    {
        var dir = CreateTempDir();
        WriteServerFiles(dir);
        WriteManifest(dir, CreateManifest());
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(
                dir,
                "pack",
                dir,
                "--user_config",
                "api_key=secret",
                "--no-discover=false"
            );

            Assert.Equal(0, code);
            Assert.Contains("demo@", stdout);
            Assert.DoesNotContain("user_config", stderr, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
        }
    }

    [Fact]
    public void Pack_Discovery_ExpandsMultipleUserConfigValues()
    {
        var dir = CreateTempDir();
        WriteServerFiles(dir);
        WriteManifest(dir, CreateMultiValueManifest());
        Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", "[]");
        try
        {
            var (code, stdout, stderr) = InvokeCli(
                dir,
                "pack",
                dir,
                "--user_config",
                "allowed_directories=/data/a",
                "--user_config",
                "allowed_directories=/data/b",
                "--no-discover=false"
            );

            Assert.Equal(0, code);
            var normalizedStdout = stdout.Replace('\\', '/');
            Assert.Contains("/data/a /data/b", normalizedStdout);
            Assert.DoesNotContain("user_config", stderr, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MCPB_TOOL_DISCOVERY_JSON", null);
        }
    }
}
