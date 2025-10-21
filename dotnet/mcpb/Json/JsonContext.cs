using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Mcpb.Core;

namespace Mcpb.Json;

[JsonSerializable(typeof(McpbManifest))]
[JsonSerializable(typeof(Dictionary<string, string>))]
[JsonSerializable(typeof(Dictionary<string, object>))]
[JsonSerializable(typeof(Dictionary<string, Dictionary<string, object>>))]
[JsonSerializable(typeof(McpbWindowsMeta))]
[JsonSerializable(typeof(McpbStaticResponses))]
[JsonSerializable(typeof(McpbInitializeResult))]
[JsonSerializable(typeof(McpbToolsListResult))]
[JsonSerializable(typeof(System.Text.Json.JsonElement))]
[JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
public partial class McpbJsonContext : JsonSerializerContext
{
    private static JsonSerializerOptions? _writeOptions;

    public static JsonSerializerOptions WriteOptions
    {
        get
        {
            if (_writeOptions != null) return _writeOptions;

            var options = new JsonSerializerOptions(Default.Options)
            {
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
            };

            _writeOptions = options;
            return options;
        }
    }
}
