# DXT Manifest.json Spec

Current version: `0.1`
Last updated: 2025-06-17

## Manifest Schema

The `manifest.json` file contains all extension metadata and configuration. Most fields are optional.

A basic `manifest.json` with just the required fields looks like this:

```json
{
  "dxt_version": "0.1", // DXT spec version this manifest conforms to
  "name": "my-extension", // Machine-readable name (used for CLI, APIs)
  "version": "1.0.0", // Semantic version of your extension
  "description": "A simple MCP extension", // Brief description of what the extension does
  "author": {
    // Author information (required)
    "name": "Extension Author" // Author's name (required field)
  },
  "server": {
    // Server configuration (required)
    "type": "node", // Server type: "node", "python", or "binary"
    "entry_point": "server/index.js", // Path to the main server file
    "mcp_config": {
      // MCP server configuration
      "command": "node", // Command to run the server
      "args": [
        // Arguments passed to the command
        "${__dirname}/server/index.js" // ${__dirname} is replaced with the extension's directory
      ]
    }
  }
}
```

```json
{
  "dxt_version": "0.1",
  "name": "my-extension",
  "version": "1.0.0",
  "description": "A simple MCP extension",
  "author": {
    "name": "Extension Author"
  },
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "API_KEY": "${user_config.api_key}"
      }
    }
  },
  "user_config": {
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your API key for authentication",
      "sensitive": true,
      "required": true
    }
  }
}
```

A full `manifest.json` with most of the optional fields looks like this:

```json
{
  "dxt_version": "0.1",
  "name": "My MCP Extension",
  "display_name": "My Awesome MCP Extension",
  "version": "1.0.0",
  "description": "A brief description of what this extension does",
  "long_description": "A detailed description that can include multiple paragraphs explaining the extension's functionality, use cases, and features. It supports basic markdown.",
  "author": {
    "name": "Your Name",
    "email": "yourname@example.com",
    "url": "https://your-website.com"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/my-mcp-extension"
  },
  "homepage": "https://example.com/my-extension",
  "documentation": "https://docs.example.com/my-extension",
  "support": "https://github.com/your-username/my-extension/issues",
  "icon": "icon.png",
  "screenshots": [
    "assets/screenshots/screenshot1.png",
    "assets/screenshots/screenshot2.png"
  ],
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["server/index.js"],
      "env": {
        "ALLOWED_DIRECTORIES": "${user_config.allowed_directories}"
      }
    }
  },
  "tools": [
    {
      "name": "search_files",
      "description": "Search for files in a directory"
    }
  ],
  "prompts": [
    {
      "name": "poetry",
      "description": "Have the LLM write poetry",
      "arguments": ["topic"],
      "text": "Write a creative poem about the following topic: ${arguments.topic}"
    }
  ],
  "tools_generated": true,
  "keywords": ["api", "automation", "productivity"],
  "license": "MIT",
  "compatibility": {
    "claude_desktop": ">=1.0.0",
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "python": ">=3.8",
      "node": ">=16.0.0"
    }
  },
  "user_config": {
    "allowed_directories": {
      "type": "directory",
      "title": "Allowed Directories",
      "description": "Directories the server can access",
      "multiple": true,
      "required": true,
      "default": ["${HOME}/Desktop"]
    },
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your API key for authentication",
      "sensitive": true,
      "required": false
    },
    "max_file_size": {
      "type": "number",
      "title": "Maximum File Size (MB)",
      "description": "Maximum file size to process",
      "default": 10,
      "min": 1,
      "max": 100
    }
  }
}
```

## Field Definitions

### Required Fields

- **dxt_version**: Specification version this extension conforms to
- **name**: Machine-readable name (used for CLI, APIs)
- **version**: Semantic version (semver)
- **description**: Brief description
- **author**: Author information object with name (required), email (optional), and url (optional)
- **server**: Server configuration object

### Optional Fields

- **icon**: Path to a png icon file, either relative in the package or a https:// url.
- **display_name**: Human-friendly name for UI display
- **long_description**: Detailed description for extension stores, markdown
- **repository**: Source code repository information (type and url)
- **homepage**: Extension homepage URL
- **documentation**: Documentation URL
- **support**: Support/issues URL
- **screenshots**: Array of screenshot paths
- **tools**: Array of tools the extension provides
- **tools_generated**: Boolean indicating the server generates additional tools at runtime (default: false)
- **prompts**: Array of prompts the extension provides
- **prompts_generated**: Boolean indicating the server generates additional prompts at runtime (default: false)
- **keywords**: Search keywords
- **license**: License identifier
- **compatibility**: Compatibility requirements (client app version, platforms, and runtime versions)
- **user_config**: User-configurable options for the extension (see User Configuration section)

## Compatibility

The `compatibility` object specifies all requirements for running the extension. All fields, including the `compatibility` field itself, are optional. If you specify nothing, clients implementing DXT are encouraged to run the extension on any system.

```json
{
  "compatibility": {
    "claude_desktop": ">=1.0.0",
    "my_client": ">1.0.0",
    "other_client": ">=2.0.0 <3.0.0",
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "python": ">=3.8",
      "node": ">=16.0.0"
    }
  }
}
```

### Fields

#### Client Version Constraints

The compatibility object supports version constraints for any client application:

- **claude_desktop**: Minimum Claude Desktop version required (uses semver)
- **my_client**: Version constraint for a custom client (uses semver)
- **Other client names**: You can add version constraints for any client application

All client version constraints use semver syntax (e.g., `">=1.0.0"`, `">1.0.0 <2.0.0"`, `"^1.2.3"`).

#### System Requirements

- **platforms**: Array of supported platforms (`darwin`, `win32`, `linux`). These match Node.js `process.platform` and Python's `sys.platform` values. If omitted, all platforms are supported
- **runtimes**: Runtime version requirements
  - Only specify the runtime(s) your extension actually uses
  - For Python extensions: specify `python` version
  - For Node.js extensions: specify `node` version
  - Binary extensions don't need runtime specifications

**Note**: Use `darwin` for macOS, `win32` for Windows, and `linux` for Linux systems

### Examples

**Python Extension:**

```json
{
  "server": {
    "type": "python",
    "entry_point": "server/main.py"
  },
  "compatibility": {
    "claude_desktop": ">=0.10.0",
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "python": ">=3.8,<4.0"
    }
  }
}
```

**Node.js Extension that only supports macOS:**

```json
{
  "server": {
    "type": "node",
    "entry_point": "server/index.js"
  },
  "compatibility": {
    "claude_desktop": ">=0.10.0",
    "platforms": ["darwin"],
    "runtimes": {
      "node": ">=16.0.0"
    }
  }
}
```

**Binary Extension (no runtime needed):**

```json
{
  "server": {
    "type": "binary",
    "entry_point": "server/my-tool"
  },
  "compatibility": {
    "claude_desktop": ">=0.10.0",
    "platforms": ["darwin", "win32"]
  }
}
```

## Server Configuration

The `server` object defines how to run the MCP server:

### Server Types

1. **Python**: `server.type = "python"`
   - Requires `entry_point` to Python file
   - All dependencies must be bundled in the DXT
   - Can use `server/lib` for packages or `server/venv` for full virtual environment
   - Python runtime version specified in `compatibility.runtimes.python`

2. **Node.js**: `server.type = "node"`
   - Requires `entry_point` to JavaScript file
   - All dependencies must be bundled in `node_modules`
   - Node.js runtime version specified in `compatibility.runtimes.node`
   - Typically includes `package.json` at extension root for dependency management

3. **Binary**: `server.type = "binary"`
   - Pre-compiled executable with all dependencies included
   - Platform-specific binaries supported
   - Completely self-contained (no runtime requirements)

### MCP Configuration

The `mcp_config` object in the server configuration defines how the implementing app should execute the MCP server. This replaces the manual JSON configuration users currently need to write.

**Python Example:**

```json
"mcp_config": {
  "command": "python",
  "args": ["server/main.py"],
  "env": {
    "PYTHONPATH": "server/lib"
  }
}
```

**Node.js Example:**

```json
"mcp_config": {
  "command": "node",
  "args": ["${__dirname}/server/index.js"],
  "env": {}
}
```

**Binary Example (Cross-Platform):**

```json
"mcp_config": {
  "command": "server/my-server",
  "args": ["--config", "server/config.json"],
  "env": {}
}
```

_Note: For binaries, apps will automatically append `.exe` on Windows_

**Platform-Specific Configurations:**
For cases where different platforms need different configurations, use platform-specific overrides:

```json
"mcp_config": {
  "command": "server/my-server",
  "args": ["--config", "server/config.json"],
  "env": {},
  "platform_overrides": {
    "win32": {
      "command": "server/my-server.exe",
      "args": ["--config", "server/config-windows.json"]
    },
    "darwin": {
      "env": {
        "DYLD_LIBRARY_PATH": "server/lib"
      }
    }
  }
}
```

When installing the extension, apps will automatically generate the appropriate MCP server configuration and add it to the user's settings, eliminating the need for manual JSON editing.

**Variable Substitution:**
The implementing desktop app will substitute variables in the `mcp_config` to make extensions more portable:

- **`${__dirname}`**: This variable is replaced with the absolute path to the extension's directory. This is useful for referencing files within the extension package.
- **`${HOME}`**: User's home directory
- **`${DESKTOP}`**: User's desktop directory
- **`${DOCUMENTS}`**: User's documents directory
- **`${DOWNLOADS}`**: User's downloads directory
- **`${pathSeparator}`** or **`${/}`**: Path separator for the current platform

Example:

```json
"mcp_config": {
  "command": "python",
  "args": ["${__dirname}/server/main.py"],
  "env": {
    "CONFIG_PATH": "${__dirname}/config/settings.json"
  }
}
```

This ensures that paths work correctly regardless of where the extension is installed on the user's system.

- **`${user_config}`**: Your extension can specify user-configured values that the implementing app will collect from users. Read on to learn more about user configuration.

## User Configuration

The `user_config` field allows extension developers to specify configuration options that can be presented to end users through the implementing app's user interface. These configurations are collected from users and passed to the MCP server at runtime.

### Configuration Schema

Each configuration option is defined as a key-value pair where the key is the configuration name and the value is an object with these properties:

- **type**: The data type of the configuration
  - `"string"`: Text input
  - `"number"`: Numeric input
  - `"boolean"`: Checkbox/toggle
  - `"directory"`: Directory picker
  - `"file"`: File picker
- **title**: Display name shown in the UI
- **description**: Help text explaining the configuration option
- **required**: Whether this field must be provided (default: false)
- **default**: Default value (supports variable substitution)
- **multiple**: For directory/file types, allow multiple selections (default: false)
- **sensitive**: For string types, mask input and store securely (default: false)
- **min/max**: For number types, validation constraints

### Variable Substitution in User Configuration

User configuration values support variable substitution in `mcp_config`:

- **`${user_config.KEY}`**: Replaced with the user-provided value for configuration KEY
- Arrays (from multiple selections) are expanded as separate arguments
- Environment variables are ideal for sensitive data
- Command arguments work well for paths and non-sensitive options

Available variables for default values:

- **`${HOME}`**: User's home directory
- **`${DESKTOP}`**: User's desktop directory
- **`${DOCUMENTS}`**: User's documents directory

### Examples

**Filesystem Extension with Directory Configuration:**

```json
{
  "user_config": {
    "allowed_directories": {
      "type": "directory",
      "title": "Allowed Directories",
      "description": "Select directories the filesystem server can access",
      "multiple": true,
      "required": true,
      "default": ["${HOME}/Desktop", "${HOME}/Documents"]
    }
  },
  "server": {
    "mcp_config": {
      "command": "node",
      "args": [
        "${__dirname}/server/index.js",
        "${user_config.allowed_directories}"
      ]
    }
  }
}
```

**API Integration with Authentication:**

```json
{
  "user_config": {
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your API key for authentication",
      "sensitive": true,
      "required": true
    },
    "base_url": {
      "type": "string",
      "title": "API Base URL",
      "description": "The base URL for API requests",
      "default": "https://api.example.com",
      "required": false
    }
  },
  "server": {
    "mcp_config": {
      "command": "node",
      "args": ["server/index.js"],
      "env": {
        "API_KEY": "${user_config.api_key}",
        "BASE_URL": "${user_config.base_url}"
      }
    }
  }
}
```

**Database Connection Configuration:**

```json
{
  "user_config": {
    "database_path": {
      "type": "file",
      "title": "Database File",
      "description": "Path to your SQLite database file",
      "required": true
    },
    "read_only": {
      "type": "boolean",
      "title": "Read Only Mode",
      "description": "Open database in read-only mode",
      "default": true
    },
    "timeout": {
      "type": "number",
      "title": "Query Timeout (seconds)",
      "description": "Maximum time for query execution",
      "default": 30,
      "min": 1,
      "max": 300
    }
  },
  "server": {
    "mcp_config": {
      "command": "python",
      "args": [
        "server/main.py",
        "--database",
        "${user_config.database_path}",
        "--timeout",
        "${user_config.timeout}"
      ],
      "env": {
        "READ_ONLY": "${user_config.read_only}"
      }
    }
  }
}
```

### Implementation Notes

- **Array Expansion**: When a configuration with `multiple: true` is used in `args`, each value is expanded as a separate argument. For example, if the user selects directories `/home/user/docs` and `/home/user/projects`, the args `["${user_config.allowed_directories}"]` becomes `["/home/user/docs", "/home/user/projects"]`.

## Tools and Prompts

These fields describe the tools and prompts your MCP server provides. For servers that generate capabilities dynamically at runtime, you can use the `_generated` flags to indicate this.

Note: Resources are not included in the manifest because MCP resources are inherently dynamic - they represent URIs to data that the server discovers at runtime based on configuration, filesystem state, database connections, etc.

### Static Declaration

For servers with a fixed set of capabilities, list them in arrays.

#### Prompt Structure

Each prompt in the `prompts` array must include:

- **name**: The identifier for the prompt
- **description** (optional): Explanation of what the prompt does
- **arguments** (optional): Array of argument names that can be used in the prompt text
- **text**: The actual prompt text that uses template variables like `${arguments.topic}` or `${arguments.aspect}` as placeholders for MCP Client-supplied arguments. If your argument is named `language`, you'd add `${arguments.language} where you expect it to show up in the prompt.

Example:

```json
{
  "tools": [
    { "name": "search_files", "description": "Search for files" },
    { "name": "read_file", "description": "Read file contents" }
  ],
  "prompts": [
    {
      "name": "explain_code",
      "description": "Explain how code works",
      "arguments": ["code", "language"],
      "text": "Please explain the following ${arguments.language} code in detail:\n\n${arguments.code}"
    }
  ]
}
```

Implementing apps may choose to validate prompts at run-time against the declaration of your prompts in the manifest.

### Dynamic Generation

For servers that generate capabilities based on context, configuration, or runtime discovery, use the `_generated` flags:

```json
{
  "tools": [{ "name": "search", "description": "Search functionality" }],
  "tools_generated": true,
  "prompts_generated": true
}
```

This indicates that:

- The server provides at least the `search` tool (and possibly more)
- Additional tools are generated at runtime
- Prompts are generated at runtime

The `_generated` fields:

- **tools_generated**: Server generates additional tools beyond those listed (default: false)
- **prompts_generated**: Server generates additional prompts beyond those listed (default: false)

This helps implementing apps understand that querying the server at runtime will reveal more capabilities than what's declared in the manifest.
