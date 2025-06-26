# Desktop Extensions (DXT)

Desktop Extensions (`.dxt`) are zip archives containing a local MCP server and a `manifest.json` that describes the server and its capabilities. The format is spiritually similar to Chrome extensions (`.crx`) or VS Code extensions (`.vsix`), enabling end users to install local MCP servers with a single click.

This repository provides three components: The extension specification in [MANIFEST.md](MANIFEST.md), a CLI tool for creating extensions (see [CLI.md](CLI.md)), and the code used by Claude for macOS and Windows to load and verify DXT extensions ([src/index.ts](src/index.ts)).

- For developers of local MCP servers, we aim to make distribution and installation of said servers convenient
- For developers of apps supporting local MCP servers, we aim to make it easy to add support for DXT extensions

Claude for macOS and Windows uses the code in this repository to enable single-click installation of local MCP servers, including a number of end user-friendly features - such as automatic updates, easy configuration of MCP servers and the variables and parameters they need, and a curated directory. We are committed to the open ecosystem around MCP servers and believe that its ability to be universally adopted by multiple applications and services has benefits developers aiming to connect AI tools to other apps and services. Consequently, we’re open-sourcing the Desktop Extension specification, toolchain, and the schemas and key functions used by Claude for macOS and Windows to implement its own support of Desktop Extensions. It is our hope that the `dxt` format doesn’t just make local MCP servers more portable for Claude, but other AI desktop applications, too.

# For Extension Developers

At the core, DXT are simple zip files containing your entire MCP server and a `manifest.json`. Consequently, turning a local MCP server into an extension is straightforward: You just have to put all your required files in a folder, create a `manifest.json`, and then create an archive.

To make this process easier, this package offers a CLI that helps you with the creation of both the `manifest.json` and the final `.dxt` file. To install it, run:

```sh
npm install -g @anthropic-ai/dxt
```

1. In a folder containing your local MCP server, run `dxt init`. This command will guide you through the creation of a `manifest.json`.
2. Run `dxt pack` to create a `dxt` file.
3. Now, any app implementing support for DXT can run your local MCP server. As an example, open the file with Claude for macOS and Windows to show an installation dialog.

You can find the full spec for the `manifest.json` and all its mandatory and optional fields in [MANIFEST.md](MANIFEST.md). Examples for extensions can be found in [examples](./examples/).

## Prompt Template for AI Tools

AI tools like Claude Code are particularly good at creating desktop extensions when informed about the spec. When prompting an AI coding tool to build an extension, briefly explain what your extension aims to do - then add the following context to your instructions.

> I want to build this as a Desktop Extension, abbreviated as "DXT". Please follow these steps:
>
> 1. **Read the specifications thoroughly:**
>    - https://github.com/anthropics/dxt/blob/main/README.md - DXT architecture overview, capabilities, and integration
>      patterns
>    - https://github.com/anthropics/dxt/blob/main/MANIFEST.md - Complete extension manifest structure and field definitions
>    - https://github.com/anthropics/dxt/tree/main/examples - Reference implementations including a "Hello World" example
> 2. **Create a proper extension structure:**
>    - Generate a valid manifest.json following the MANIFEST.md spec
>    - Implement an MCP server using @modelcontextprotocol/sdk with proper tool definitions
>    - Include proper error handling, security measures, and timeout management
> 3. **Follow best development practices:**
>    - Implement proper MCP protocol communication via stdio transport
>    - Structure tools with clear schemas, validation, and consistent JSON responses
>    - Make use of the fact that this extension will be running locally
>    - Add appropriate logging and debugging capabilities
>    - Include proper documentation and setup instructions
> 4. **Test considerations:**
>    - Validate that all tool calls return properly structured responses
>    - Verify manifest loads correctly and host integration works
>
> Generate complete, production-ready code that can be immediately tested. Focus on defensive programming, clear error messages, and following the exact DXT specifications to ensure compatibility with the ecosystem.

## Directory Structures

### Minimal Extension

A `manifest.json` is the only required file.

### Example: Node.js Extension

```
extension.dxt (ZIP file)
├── manifest.json         # Required: Extension metadata and configuration
├── server/               # Server files
│   └── index.js          # Main entry point
├── node_modules/         # Bundled dependencies
├── package.json          # Optional: NPM package definition
├── icon.png              # Optional: Extension icon
└── assets/               # Optional: Additional assets
```

### Example: Python Extension

```
extension.dxt (ZIP file)
├── manifest.json         # Required: Extension metadata and configuration
├── server/               # Server files
│   ├── main.py           # Main entry point
│   └── utils.py          # Additional modules
├── lib/                  # Bundled Python packages
├── requirements.txt      # Optional: Python dependencies list
└── icon.png              # Optional: Extension icon
```

### Example: Binary Extension

```
extension.dxt (ZIP file)
├── manifest.json         # Required: Extension metadata and configuration
├── server/               # Server files
│   ├── my-server         # Unix executable
│   ├── my-server.exe     # Windows executable
└── icon.png              # Optional: Extension icon
```

### Bundling Dependencies

**Python Extensions:**

- Bundle all required packages in `server/lib/` directory
- OR bundle a complete virtual environment in `server/venv/`
- Use tools like `pip-tools`, `poetry`, or `pipenv` to create reproducible bundles
- Set `PYTHONPATH` to include bundled packages via `mcp_config.env`

**Node.js Extensions:**

- Run `npm install --production` to create `node_modules`
- Bundle the entire `node_modules` directory with your extension
- Use `npm ci` or `yarn install --frozen-lockfile` for reproducible builds
- Server entry point specified in manifest.json's `server.entry_point`

**Binary Extensions:**

- Static linking preferred for maximum compatibility
- Include all required shared libraries if dynamic linking used
- Test on clean systems without development tools
