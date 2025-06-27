# DXT Examples

This directory contains example Desktop Extensions that demonstrate the DXT format and manifest structure. These are **reference implementations** designed to illustrate how to build DXT extensions.

## ⚠️ Not Production Ready

**Important:** These examples are **NOT intended for production use**. They serve as:

- Demonstrations of the DXT manifest format
- Templates for building your own extensions  
- Simple MCP server implementations for testing

But, the MCP servers themselves are not robust secure production ready servers and should not be relied upon for production use. 

## Examples Included

| Example | Type | Demonstrates |
|---------|------|-------------|
| `hello-world-node` | Node.js | Basic MCP server with simple time tool |
| `chrome-applescript` | Node.js | Browser automation via AppleScript |
| `file-manager-python` | Python | File system operations and path handling |

## Usage

Each example includes its own `manifest.json` and can be packed with:

```bash
dxt pack examples/hello-world-node
```

Use these as starting points for your own extensions, but ensure you implement proper security measures before deploying to users.