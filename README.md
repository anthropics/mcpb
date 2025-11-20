# MCP Bundles (MCPB)

> **⚠️ IMPORTANT NOTICE: This project is being renamed from DXT (Desktop Extensions) to MCPB (MCP Bundles)**
>
> If you're looking for the DXT tools, they have been renamed to MCPB. Please update your dependencies and tooling:
>
> - `dxt` CLI is now `mcpb`
> - `.dxt` files are now `.mcpb` files
> - `@anthropic-ai/dxt` package will be moved to `@anthropic-ai/mcpb`

MCP Bundles (`.mcpb`) are zip archives containing a local MCP server and a `manifest.json` that describes the server and its capabilities. The format is spiritually similar to Chrome extensions (`.crx`) or VS Code extensions (`.vsix`), enabling end users to install local MCP servers with a single click.

This repository provides three components: The bundle specification in [MANIFEST.md](MANIFEST.md), a CLI tool for creating bundles (see [CLI.md](CLI.md)), and the code used by Claude for macOS and Windows to load and verify MCPB bundles ([src/index.ts](src/index.ts)).

- For developers of local MCP servers, we aim to make distribution and installation of said servers convenient
- For developers of apps supporting local MCP servers, we aim to make it easy to add support for MCPB bundles

Claude for macOS and Windows uses the code in this repository to enable single-click installation of local MCP servers, including a number of end user-friendly features - such as automatic updates, easy configuration of MCP servers and the variables and parameters they need, and a curated directory. We are committed to the open ecosystem around MCP servers and believe that its ability to be universally adopted by multiple applications and services has benefits developers aiming to connect AI tools to other apps and services. Consequently, we're open-sourcing the MCP Bundle specification, toolchain, and the schemas and key functions used by Claude for macOS and Windows to implement its own support of MCP Bundles. It is our hope that the `mcpb` format doesn't just make local MCP servers more portable for Claude, but other AI desktop applications, too.

# For Bundle Developers

At the core, MCPB are simple zip files containing your entire MCP server and a `manifest.json`. Consequently, turning a local MCP server into a bundle is straightforward: You just have to put all your required files in a folder, create a `manifest.json`, and then create an archive.

To make this process easier, this package offers a CLI that helps you with the creation of both the `manifest.json` and the final `.mcpb` file. To install it, run:

```sh
npm install -g @anthropic-ai/mcpb
```

1. In a folder containing your local MCP server, run `mcpb init`. This command will guide you through the creation of a `manifest.json`.
2. Run `mcpb pack` to create a `mcpb` file.
3. Now, any app implementing support for MCPB can run your local MCP server. As an example, open the file with Claude for macOS and Windows to show an installation dialog.

You can find the full spec for the `manifest.json` and all its mandatory and optional fields in [MANIFEST.md](MANIFEST.md). Examples for bundles can be found in [examples](./examples/).

## Prompt Template for AI Tools

AI tools like Claude Code are particularly good at creating MCP bundles when informed about the spec. When prompting an AI coding tool to build a bundle, briefly explain what your bundle aims to do - then add the following context to your instructions.

> I want to build this as a MCP Bundle, abbreviated as "MCPB". Please follow these steps:
>
> 1. **Read the specifications thoroughly:**
>    - https://github.com/anthropics/mcpb/blob/main/README.md - MCPB architecture overview, capabilities, and integration
>      patterns
>    - https://github.com/anthropics/mcpb/blob/main/MANIFEST.md - Complete bundle manifest structure and field definitions
>    - https://github.com/anthropics/mcpb/tree/main/examples - Reference implementations including a "Hello World" example
> 2. **Create a proper bundle structure:**
>    - Generate a valid manifest.json following the MANIFEST.md spec
>    - Implement an MCP server using @modelcontextprotocol/sdk with proper tool definitions
>    - Include proper error handling, security measures, and timeout management
> 3. **Follow best development practices:**
>    - Implement proper MCP protocol communication via stdio transport
>    - Structure tools with clear schemas, validation, and consistent JSON responses
>    - Make use of the fact that this bundle will be running locally
>    - Add appropriate logging and debugging capabilities
>    - Include proper documentation and setup instructions
> 4. **Test considerations:**
>    - Validate that all tool calls return properly structured responses
>    - Verify manifest loads correctly and host integration works
>
> Generate complete, production-ready code that can be immediately tested. Focus on defensive programming, clear error messages, and following the exact MCPB specifications to ensure compatibility with the ecosystem.

## Directory Structures

### Minimal Bundle

A `manifest.json` is the only required file.

### Example: Node.js Bundle

```
bundle.mcpb (ZIP file)
├── manifest.json         # Required: Bundle metadata and configuration
├── server/               # Server files
│   └── index.js          # Main entry point
├── node_modules/         # Bundled dependencies
├── package.json          # Optional: NPM package definition
├── icon.png              # Optional: Bundle icon
└── assets/               # Optional: Additional assets
```

### Example: Python Bundle

```
bundle.mcpb (ZIP file)
├── manifest.json         # Required: Bundle metadata and configuration
├── server/               # Server files
│   ├── main.py           # Main entry point
│   └── utils.py          # Additional modules
├── lib/                  # Bundled Python packages
├── requirements.txt      # Optional: Python dependencies list
└── icon.png              # Optional: Bundle icon
```

### Example: Binary Bundle

```
bundle.mcpb (ZIP file)
├── manifest.json         # Required: Bundle metadata and configuration
├── server/               # Server files
│   ├── my-server         # Unix executable
│   ├── my-server.exe     # Windows executable
└── icon.png              # Optional: Bundle icon
```

### Language Choice Recommendation

**We recommend implementing MCP servers in Node.js** rather than Python to reduce installation friction. Node.js ships with Claude for macOS and Windows, which means your bundle will work out-of-the-box for users without requiring them to install additional Python runtimes (or you to package them manually).

### Bundling Dependencies

#### Traditional Bundling (Recommended for Maximum Compatibility)

**Python Bundles:**

- Bundle all required packages in `server/lib/` directory
- OR bundle a complete virtual environment in `server/venv/`
- Use tools like `pip-tools`, `poetry`, or `pipenv` to create reproducible bundles
- Set `PYTHONPATH` to include bundled packages via `mcp_config.env`

**Node.js Bundles:**

- Run `npm install --production` to create `node_modules`
- Bundle the entire `node_modules` directory with your bundle
- Use `npm ci` or `yarn install --frozen-lockfile` for reproducible builds
- Server entry point specified in manifest.json's `server.entry_point`

**Binary Bundles:**

- Static linking preferred for maximum compatibility
- Include all required shared libraries if dynamic linking used
- Test on clean systems without development tools

#### Alternative: PyPI-Based Deployment for Python (Advanced)

For Python packages published to PyPI, you can use `uvx` for dynamic dependency resolution instead of bundling dependencies. This approach trades bundle size for an external dependency requirement.

**When to use PyPI deployment:**
- You're already publishing your package to PyPI
- You want smaller bundle sizes (< 1 MB vs 50+ MB)
- You need the ability to push updates without resubmitting bundles
- Your users can install additional tools

**Requirements:**
- Your package must be published to PyPI
- Users must have `uv` installed globally (via `pip install uv` or `brew install uv`)
- Internet connection required at first launch (for dependency fetching)

**Manifest configuration:**

```json
{
  "server": {
    "type": "python",
    "entry_point": "src/your_package/main.py",
    "mcp_config": {
      "command": "uvx",
      "args": [
        "--native-tls",
        "your-package-name@latest"
      ],
      "env": {
        "API_KEY": "${user_config.api_key}"
      }
    }
  }
}
```

**PyPI package requirements (`pyproject.toml`):**

```toml
[project]
name = "your-package-name"  # Must match uvx args
version = "1.0.0"
dependencies = [
  "mcp[cli]>=1.11.0",
  # Your other dependencies
]

[project.scripts]
your-package-name = "your_package.main:main"
```

**Bundle structure:**

```
bundle.mcpb (< 1 MB)
├── manifest.json
├── pyproject.toml         # PyPI package definition
├── uv.lock                # Lockfile for reproducibility
└── src/
    └── your_package/
        └── main.py        # Source code (for reference/auditing)
```

**How it works:**
1. Claude Desktop executes: `uvx --native-tls your-package-name@latest`
2. `uvx` (like `npx` for Python) fetches the package from PyPI
3. Dependencies are installed to `~/.cache/uv/` (cached for future runs)
4. The package entry point is executed

**Trade-offs:**

| Aspect | Traditional Bundling | PyPI + uvx |
|--------|---------------------|------------|
| Bundle size | 50-100 MB | < 1 MB |
| User requirements | None (works offline) | `uv` must be installed |
| Internet required | No | Yes (first run) |
| Updates | Requires new bundle | `@latest` auto-updates |
| Compatibility | Maximum | Requires modern Python |

**Example:** The Braze MCP Server uses this pattern. See their [GitHub repository](https://github.com/braze-inc/braze_mcp_server) for a complete reference implementation.

### Using Variable Substitution for Portability

The manifest supports variable substitution for cross-platform compatibility:

**Available variables:**
- `${__dirname}` - Extension's installation directory
- `${HOME}` - User's home directory  
- `${DESKTOP}` - User's desktop folder
- `${DOCUMENTS}` - User's documents folder
- `${DOWNLOADS}` - User's downloads folder
- `${pathSeparator}` or `${/}` - Platform-specific separator
- `${user_config.KEY}` - User-configured values

**Common portability mistakes:**
```javascript
// ❌ WRONG - Hardcoded absolute paths
spawn('/usr/local/bin/node', ['script.js']);
spawn('C:\\Program Files\\tool\\bin.exe');

// ✅ CORRECT - Use runtime's executables
spawn(process.execPath, ['script.js']);

// ❌ WRONG - Assuming global packages
spawn('npx', ['some-command']);

// ✅ CORRECT - Bundle and reference locally
spawn('${__dirname}/node_modules/.bin/tool');
```

**Testing portability:**
1. Fresh VM without development tools
2. Different OS than development machine
3. Verify variable substitution works
4. Check all paths resolve correctly

## Testing Your MCPB

Before distributing your MCPB, follow this four-phase testing approach:

### Phase 1: Development Testing
- Unit tests for your server code
- Manual testing on your development machine
- Tool functionality verification
- Error handling validation

### Phase 2: Clean Environment Testing ⚠️ Critical
Test on a fresh system without development tools to catch portability issues:

**Using Docker (recommended):**
```bash
# Create clean test environment
docker run -it node:20 bash

# Copy ONLY your MCPB bundle (no global packages)
# Test installation exactly as users would
```

**What this catches:**
- Missing bundled dependencies
- Hardcoded paths
- Global package assumptions
- Platform-specific code issues

**Common issues found:**
- ❌ `spawn('/usr/local/bin/node')` - Hardcoded path
- ✅ `spawn(process.execPath)` - Runtime's own Node.js
- ❌ Assuming `npx` is globally installed
- ✅ Bundling all required executables

### Phase 3: Cross-Platform Testing
- Test on different OS than you developed on
- Verify paths work correctly on both macOS and Windows
- Use forward slashes in paths (automatically converted)
- Test platform-specific features with fallbacks

### Phase 4: Integration Testing
- Install in actual host application (Claude Desktop, etc.)
- Test complete end-to-end workflows
- Verify error messages are helpful
- Check performance and responsiveness

## Error Message Best Practices

Well-crafted error messages dramatically reduce support burden. Include three components:

### 1. What went wrong (specific diagnosis)
```javascript
// ❌ Generic
throw new Error("An error occurred");

// ✅ Specific  
throw new Error("Failed to read config file at path/to/config.json");
```

### 2. Why it happened (context)
```javascript
// ❌ Vague
return { isError: true, content: [{ type: "text", text: "Authentication failed" }] };

// ✅ Clear
return { 
  isError: true, 
  content: [{ 
    type: "text", 
    text: "API key is invalid or has expired. Generate a new key at Settings → API" 
  }] 
};
```

### 3. How to fix it (actionable steps)
```javascript
// ❌ Unhelpful
throw new Error("Check your settings");

// ✅ Actionable
throw new Error("Missing API key. Add it in Settings → Extensions → [Your Extension] → API Key field");
```

### Error Categories
Return structured errors via MCP protocol with clear `isError` flags:

- **Configuration errors** - Missing or invalid settings
- **Authentication errors** - Invalid credentials with regeneration instructions
- **Resource errors** - File not found, network unavailable with paths/URLs
- **Permission errors** - Access denied with required permission details
- **Validation errors** - Invalid input with expected format

# Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Development Setup

```sh
# Clone the repository
git clone https://github.com/anthropics/mcpb.git
cd mcpb

# Install dependencies
yarn

# Build the project
yarn build

# Run tests
yarn test
```

## Release Process

1. Update version in `package.json`
2. Create a pull request with version bump
3. After merge, create a GitHub release
4. Package will be automatically published to npm

# License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
