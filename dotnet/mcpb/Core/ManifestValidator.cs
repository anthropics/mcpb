using Mcpb.Core;
using System.Text.RegularExpressions;

namespace Mcpb.Core;

public enum ValidationSeverity
{
    Error,
    Warning
}

public record ValidationIssue(string Path, string Message, ValidationSeverity Severity = ValidationSeverity.Error);

public static class ManifestValidator
{
    public static List<ValidationIssue> Validate(McpbManifest m, HashSet<string>? rootProps = null)
    {
        var issues = new List<ValidationIssue>();
        bool Has(string? s) => !string.IsNullOrWhiteSpace(s);

        if (Environment.GetEnvironmentVariable("MCPB_DEBUG_VALIDATE") == "1")
        {
            Console.WriteLine("DBG_VALIDATE:DescriptionPropertyValue=" + (m.Description == null ? "<null>" : m.Description));
            Console.WriteLine("DBG_VALIDATE:RootProps=" + (rootProps == null ? "<none>" : string.Join(",", rootProps)));
        }

        var dxtPropInfo = m.GetType().GetProperty("DxtVersion");
        var dxtValue = dxtPropInfo != null ? (string?)dxtPropInfo.GetValue(m) : null;

        bool manifestPropPresent = rootProps?.Contains("manifest_version") == true;
        bool dxtPropPresent = rootProps?.Contains("dxt_version") == true;
        bool manifestValPresent = Has(m.ManifestVersion);
        bool dxtValPresent = Has(dxtValue);

        // Canonical logic: manifest_version supersedes dxt_version. Only warn if ONLY dxt_version present.
        if (rootProps != null)
        {
            bool effectiveManifest = manifestPropPresent && manifestValPresent;
            bool effectiveDxt = dxtPropPresent && dxtValPresent;
            if (!effectiveManifest && !effectiveDxt)
                issues.Add(new("manifest_version", "either manifest_version or deprecated dxt_version is required"));
            else if (!effectiveManifest && effectiveDxt)
                issues.Add(new("dxt_version", "dxt_version is deprecated; use manifest_version", ValidationSeverity.Warning));
            else if (effectiveManifest && effectiveDxt && !string.Equals(m.ManifestVersion, dxtValue, StringComparison.Ordinal))
                issues.Add(new("dxt_version", "dxt_version value differs from manifest_version (manifest_version is canonical)"));
        }
        else
        {
            bool effectiveManifest = manifestValPresent;
            bool effectiveDxt = dxtValPresent && !manifestValPresent;
            if (!effectiveManifest && !dxtValPresent)
                issues.Add(new("manifest_version", "either manifest_version or deprecated dxt_version is required"));
            else if (effectiveDxt)
                issues.Add(new("dxt_version", "dxt_version is deprecated; use manifest_version", ValidationSeverity.Warning));
        }

        // (Removed experimental dynamic required detection; explicit checks below suffice)

        bool RootMissing(string p) => rootProps != null && !rootProps.Contains(p);

        if (RootMissing("name") || !Has(m.Name)) issues.Add(new("name", "name is required"));
        if (RootMissing("version") || !Has(m.Version)) issues.Add(new("version", "version is required"));
        if (RootMissing("description") || !Has(m.Description)) issues.Add(new("description", "description is required"));
        if (m.Author == null) issues.Add(new("author", "author object is required"));
        else if (!Has(m.Author.Name)) issues.Add(new("author.name", "author.name is required"));
        if (RootMissing("server") || m.Server == null) issues.Add(new("server", "server is required"));
        else
        {
            if (string.IsNullOrWhiteSpace(m.Server.Type)) issues.Add(new("server.type", "server.type is required"));
            else if (m.Server.Type is not ("python" or "node" or "binary")) issues.Add(new("server.type", "server.type must be one of python|node|binary"));
            if (string.IsNullOrWhiteSpace(m.Server.EntryPoint)) issues.Add(new("server.entry_point", "server.entry_point is required"));
            if (m.Server.McpConfig == null) issues.Add(new("server.mcp_config", "server.mcp_config is required"));
            else if (string.IsNullOrWhiteSpace(m.Server.McpConfig.Command)) issues.Add(new("server.mcp_config.command", "command is required"));
        }

        if (Has(m.Version) && !Regex.IsMatch(m.Version, "^\\d+\\.\\d+\\.\\d+"))
            issues.Add(new("version", "version should look like MAJOR.MINOR.PATCH"));

        if (m.Author?.Email is string e && e.Length > 0 && !Regex.IsMatch(e, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
            issues.Add(new("author.email", "invalid email format"));

        void CheckUrl(string? url, string path)
        {
            if (!string.IsNullOrWhiteSpace(url) && !Uri.TryCreate(url, UriKind.Absolute, out _))
                issues.Add(new(path, "invalid url"));
        }
        CheckUrl(m.Homepage, "homepage");
        CheckUrl(m.Documentation, "documentation");
        CheckUrl(m.Support, "support");
        if (m.Repository != null) CheckUrl(m.Repository.Url, "repository.url");

        if (m.Tools != null)
            for (int i = 0; i < m.Tools.Count; i++)
                if (string.IsNullOrWhiteSpace(m.Tools[i].Name)) issues.Add(new($"tools[{i}].name", "tool name required"));

        if (m.Prompts != null)
            for (int i = 0; i < m.Prompts.Count; i++)
            {
                var prompt = m.Prompts[i];
                if (string.IsNullOrWhiteSpace(prompt.Name)) issues.Add(new($"prompts[{i}].name", "prompt name required"));
                if (string.IsNullOrWhiteSpace(prompt.Text))
                {
                    var message = Has(prompt.Name)
                        ? $"prompt '{prompt.Name}' text missing from discovery; consider setting text manually in the manifest"
                        : "prompt text missing from discovery; consider setting text manually in the manifest";
                    issues.Add(new($"prompts[{i}].text", message, ValidationSeverity.Warning));
                }
            }

        if (m.UserConfig != null)
            foreach (var kv in m.UserConfig)
            {
                var v = kv.Value;
                if (string.IsNullOrWhiteSpace(v.Title)) issues.Add(new($"user_config.{kv.Key}.title", "title required"));
                if (string.IsNullOrWhiteSpace(v.Description)) issues.Add(new($"user_config.{kv.Key}.description", "description required"));
                if (v.Type is not ("string" or "number" or "boolean" or "directory" or "file")) issues.Add(new($"user_config.{kv.Key}.type", "invalid type"));
                if (v.Min.HasValue && v.Max.HasValue && v.Min > v.Max) issues.Add(new($"user_config.{kv.Key}", "min cannot exceed max"));
            }

        return issues;
    }

    // Uses C# nullable metadata attributes to decide if property is nullable (optional)
    private static bool IsNullable(System.Reflection.PropertyInfo prop)
    {
        if (prop.PropertyType.IsValueType)
        {
            // Value types are required unless Nullable<T>
            return Nullable.GetUnderlyingType(prop.PropertyType) != null;
        }
        // Reference type: inspect NullableAttribute (2 => nullable, 1 => non-nullable)
        var nullable = prop.CustomAttributes.FirstOrDefault(a => a.AttributeType.FullName == "System.Runtime.CompilerServices.NullableAttribute");
        if (nullable != null && nullable.ConstructorArguments.Count == 1)
        {
            var arg = nullable.ConstructorArguments[0];
            if (arg.ArgumentType == typeof(byte))
            {
                var flag = (byte)arg.Value!;
                return flag == 2; // 2 means nullable
            }
            if (arg.ArgumentType == typeof(byte[]))
            {
                var vals = ((IEnumerable<System.Reflection.CustomAttributeTypedArgument>)arg.Value!).Select(v => (byte)v.Value!).ToArray();
                if (vals.Length > 0) return vals[0] == 2;
            }
        }
        // Fallback: assume non-nullable (required)
        return false;
    }

    public static List<ValidationIssue> ValidateJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var rootProps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (doc.RootElement.ValueKind == JsonValueKind.Object)
            foreach (var p in doc.RootElement.EnumerateObject()) rootProps.Add(p.Name);
        var manifest = JsonSerializer.Deserialize(json, Json.McpbJsonContext.Default.McpbManifest)!;
        // Fallback: if description property absent in raw JSON but default filled in object, ensure we still treat it as missing.
        if (!rootProps.Contains("description") && json.IndexOf("\"description\"", StringComparison.OrdinalIgnoreCase) < 0)
        {
            // Mark description as intentionally missing by clearing it so required check triggers.
            manifest.Description = string.Empty;
        }
        return Validate(manifest, rootProps);
    }
}
