# DXT Examples

This directory contains example Desktop Extensions that demonstrate the DXT format and manifest structure. These are **reference implementations** designed to illustrate how to build DXT extensions.

## ✅ Updated Examples

**Updated!** These examples have been refreshed to match current best practices and working implementations:

- Demonstrations of the DXT manifest format
- Templates for building your own extensions  
- Up-to-date MCP server implementations for testing

Note: While updated, these examples are primarily for learning and should be thoroughly tested before production use.

## Examples Included

| Example               | Type    | Demonstrates                                      |
| --------------------- | ------- | ------------------------------------------------- |
| `hello-world-node`    | Node.js | Basic MCP server with simple time tool           |
| `universal-cli-based` | Node.js | Complete Smart Tree implementation (v2.0.7)      |
| `chrome-applescript`  | Node.js | Browser automation via AppleScript (macOS only)  |
| `file-manager-python` | Python  | File system operations and path handling         |

## Recommended Starting Points

- **Basic MCP Server**: Start with `hello-world-node` for simple tool implementations
- **Advanced Features**: Use `universal-cli-based` for complex CLI-based tools with auto-installation
- **Python Development**: Use `file-manager-python` for Python-based MCP servers
- **Platform-Specific**: Use `chrome-applescript` for macOS automation

## Usage

Each example includes its own `manifest.json` and can be packed with:

```bash
dxt pack examples/hello-world-node
dxt pack examples/universal-cli-based
```

The `universal-cli-based` example is particularly useful as it demonstrates:
- Auto-downloading and installing CLI binaries
- Cross-platform support (Windows, macOS, Linux)  
- 22 specialized MCP tools
- Update checking and management
- Comprehensive manifest with all DXT features

Use these as starting points for your own extensions!
