using System;
using System.Collections.Generic;
using System.Linq;

namespace Mcpb.Commands;

internal static class UserConfigOptionParser
{
    public static bool TryParse(
        IEnumerable<string>? values,
        out Dictionary<string, IReadOnlyList<string>> result,
        out string? error
    )
    {
        result = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        var temp = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        error = null;
        if (values == null)
        {
            return true;
        }

        foreach (var raw in values)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                error = "--user_config values cannot be empty";
                return false;
            }

            var separatorIndex = raw.IndexOf('=');
            if (separatorIndex <= 0)
            {
                error = $"Invalid --user_config value '{raw}'. Use name=value.";
                return false;
            }

            var key = raw.Substring(0, separatorIndex);
            var value = raw.Substring(separatorIndex + 1);
            if (string.IsNullOrWhiteSpace(key))
            {
                error = $"Invalid --user_config value '{raw}'. Key cannot be empty.";
                return false;
            }

            if (!temp.TryGetValue(key, out var valueList))
            {
                valueList = new List<string>();
                temp[key] = valueList;
            }

            valueList.Add(value);
        }

        result = temp.ToDictionary(
            kvp => kvp.Key,
            kvp => (IReadOnlyList<string>)kvp.Value,
            StringComparer.Ordinal
        );
        return true;
    }
}
