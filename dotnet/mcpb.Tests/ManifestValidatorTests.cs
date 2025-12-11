using System.Collections.Generic;
using Mcpb.Core;
using Xunit;

namespace Mcpb.Tests;

public class ManifestValidatorTests
{
    private McpbManifest BaseManifest() => new()
    {
        ManifestVersion = "0.2",
        Name = "test",
        Version = "1.0.0",
        Description = "desc",
        Author = new McpbManifestAuthor { Name = "Author" },
        Server = new McpbManifestServer
        {
            Type = "binary",
            EntryPoint = "server/test",
            McpConfig = new McpServerConfigWithOverrides { Command = "${__dirname}/server/test" }
        }
    };

    [Fact]
    public void ValidManifest_Passes()
    {
        var m = BaseManifest();
        var issues = ManifestValidator.Validate(m);
        Assert.Empty(issues);
    }

    [Fact]
    public void MissingRequiredFields_Fails()
    {
        var m = new McpbManifest(); // many missing
        var issues = ManifestValidator.Validate(m);
        // Because defaults populate most fields, only name should be missing
        Assert.Single(issues);
        Assert.Equal("name", issues[0].Path);
    }

    [Fact]
    public void ManifestVersionMissing_Fails()
    {
        var m = BaseManifest();
        m.ManifestVersion = "";
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "manifest_version");
    }

    [Fact]
    public void DxtVersionOnly_WarnsDeprecatedButPassesRequirement()
    {
        var m = BaseManifest();
        m.ManifestVersion = ""; // remove manifest_version
                                // set deprecated dxt_version via reflection (property exists)
        m.GetType().GetProperty("DxtVersion")!.SetValue(m, "0.2");
        var issues = ManifestValidator.Validate(m);
        Assert.DoesNotContain(issues, i => i.Path == "manifest_version");
        Assert.Contains(issues, i => i.Path == "dxt_version" && i.Message.Contains("deprecated"));
    }

    [Fact]
    public void NeitherVersionPresent_Fails()
    {
        var m = BaseManifest();
        m.ManifestVersion = "";
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "manifest_version");
    }

    [Fact]
    public void InvalidServerType_Fails()
    {
        var m = BaseManifest();
        m.Server.Type = "rust"; // unsupported
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "server.type");
    }

    [Fact]
    public void InvalidVersionFormat_Fails()
    {
        var m = BaseManifest();
        m.Version = "1.0"; // not full semver
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "version");
    }

    [Fact]
    public void PromptMissingText_ProducesWarning()
    {
        var m = BaseManifest();
        m.Prompts = new List<McpbManifestPrompt> { new() { Name = "dyn", Text = string.Empty } };
        var issues = ManifestValidator.Validate(m);
        var warning = Assert.Single(issues, i => i.Path == "prompts[0].text");
        Assert.Equal(ValidationSeverity.Warning, warning.Severity);
    }

    [Fact]
    public void ValidLocalization_Passes()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        m.Localization = new McpbManifestLocalization
        {
            Resources = "locales/${locale}/messages.json",
            DefaultLocale = "en-US"
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Empty(issues);
    }

    [Fact]
    public void LocalizationWithDefaults_Passes()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        // Resources and DefaultLocale are optional with defaults
        m.Localization = new McpbManifestLocalization
        {
            Resources = null, // defaults to "mcpb-resources/${locale}.json"
            DefaultLocale = null // defaults to "en-US"
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Empty(issues);
    }

    [Fact]
    public void LocalizationResourcesWithoutPlaceholder_Fails()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        m.Localization = new McpbManifestLocalization
        {
            Resources = "locales/messages.json",
            DefaultLocale = "en-US"
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "localization.resources" && i.Message.Contains("placeholder"));
    }

    [Fact]
    public void LocalizationEmptyObject_PassesWithDefaults()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        // Empty localization object should use defaults
        m.Localization = new McpbManifestLocalization();
        var issues = ManifestValidator.Validate(m);
        Assert.Empty(issues);
    }

    [Fact]
    public void LocalizationInvalidDefaultLocale_Fails()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        m.Localization = new McpbManifestLocalization
        {
            Resources = "locales/${locale}/messages.json",
            DefaultLocale = "invalid locale"
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "localization.default_locale" && i.Message.Contains("BCP 47"));
    }

    [Fact]
    public void ValidIcons_Passes()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        m.Icons = new List<McpbManifestIcon>
        {
            new() { Src = "icon-16.png", Size = "16x16" },
            new() { Src = "icon-32.png", Size = "32x32", Theme = "light" }
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Empty(issues);
    }

    [Fact]
    public void IconMissingSrc_Fails()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        m.Icons = new List<McpbManifestIcon>
        {
            new() { Src = "", Size = "16x16" }
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "icons[0].src");
    }

    [Fact]
    public void IconMissingSize_Fails()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        m.Icons = new List<McpbManifestIcon>
        {
            new() { Src = "icon.png", Size = "" }
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "icons[0].size");
    }

    [Fact]
    public void IconInvalidSizeFormat_Fails()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        m.Icons = new List<McpbManifestIcon>
        {
            new() { Src = "icon.png", Size = "16" }
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "icons[0].size" && i.Message.Contains("WIDTHxHEIGHT"));
    }

    [Fact]
    public void IconEmptyTheme_Fails()
    {
        var m = BaseManifest();
        m.ManifestVersion = "0.3";
        m.Icons = new List<McpbManifestIcon>
        {
            new() { Src = "icon.png", Size = "16x16", Theme = "" }
        };
        var issues = ManifestValidator.Validate(m);
        Assert.Contains(issues, i => i.Path == "icons[0].theme" && i.Message.Contains("empty"));
    }
}
