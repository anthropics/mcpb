using Xunit;
using System.IO;

namespace Mcpb.Tests;

public class PathNormalizationTests
{
    [Theory]
    [InlineData("server/launch.js", "server")]
    [InlineData("server\\launch.js", "server")]
    [InlineData("subdir/nested\\script.py", "subdir")] // mixed separators
    public void NormalizePath_RewritesSeparators(string raw, string expectedFirstSegment)
    {
        var norm = Mcpb.Commands.ManifestCommandHelpers.NormalizePathForPlatform(raw);
        var sep = Path.DirectorySeparatorChar;
        // Ensure we converted both kinds of slashes into the platform separator only
        if (sep == '/')
        {
            Assert.DoesNotContain('\\', norm);
        }
        else
        {
            Assert.DoesNotContain('/', norm);
        }
        var first = norm.Split(sep)[0];
        Assert.Equal(expectedFirstSegment, first);
    }

    [Fact]
    public void NormalizePath_LeavesUrls()
    {
        var raw = "http://example.com/path/with/slash";
        var norm = Mcpb.Commands.ManifestCommandHelpers.NormalizePathForPlatform(raw);
        Assert.Equal(raw, norm); // unchanged
    }

    [Fact]
    public void NormalizePath_LeavesFlags()
    {
        var raw = "--flag=value";
        var norm = Mcpb.Commands.ManifestCommandHelpers.NormalizePathForPlatform(raw);
        Assert.Equal(raw, norm);
    }
}
