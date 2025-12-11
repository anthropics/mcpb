using Mcpb.Core;
using Xunit;

namespace Mcpb.Tests;

public class ManifestDefaultsTests
{
    [Fact]
    public void AutoDetect_Node()
    {
        using var dir = new TempDir();
        Directory.CreateDirectory(Path.Combine(dir.Path, "server"));
        File.WriteAllText(Path.Combine(dir.Path, "package.json"), "{}" );
        File.WriteAllText(Path.Combine(dir.Path, "server","index.js"), "console.log('hi')");
        var m = ManifestDefaults.Create(dir.Path);
        Assert.Equal("node", m.Server.Type);
        Assert.Equal("server/index.js", m.Server.EntryPoint);
    }

    [Fact]
    public void AutoDetect_Python()
    {
        using var dir = new TempDir();
        Directory.CreateDirectory(Path.Combine(dir.Path, "server"));
        File.WriteAllText(Path.Combine(dir.Path, "server","main.py"), "print('hi')");
        var m = ManifestDefaults.Create(dir.Path);
        Assert.Equal("python", m.Server.Type);
    }

    [Fact]
    public void AutoDetect_Binary_Fallback()
    {
        using var dir = new TempDir();
        var m = ManifestDefaults.Create(dir.Path);
        Assert.Equal("binary", m.Server.Type);
    }

    private sealed class TempDir : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "mcpbtest_" + Guid.NewGuid().ToString("N"));
        public TempDir() { Directory.CreateDirectory(Path); }
        public void Dispose() { try { Directory.Delete(Path, true); } catch { } }
    }
}
