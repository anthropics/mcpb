# Zscaler MCP Server - Fixed Configuration

The Zscaler MCP package is published to PyPI at: https://pypi.org/project/zscaler-mcp/

This document shows the correct manifest configuration for using the PyPI+uvx deployment pattern.

## Problem with Current Submission

**Current manifest.json (BROKEN):**
```json
{
  "server": {
    "type": "python",
    "mcp_config": {
      "command": "python",  // ← WRONG for PyPI deployment
      "args": ["-m", "zscaler_mcp.server"],
      "env": {
        "PYTHONPATH": "${BUNDLE_ROOT}:${PYTHONPATH}",  // ← Wrong variable
        "ZSCALER_CLIENT_ID": "${user_config.client_id}",
        "ZSCALER_CLIENT_SECRET": "${user_config.client_secret}"
      }
    }
  }
}
```

**Issues:**
1. Uses `"command": "python"` but no dependencies bundled
2. Uses deprecated `${BUNDLE_ROOT}` variable
3. Mismatch between manifest and README documentation

## Fixed Configuration

**Corrected manifest.json:**
```json
{
  "$schema": "../../dist/mcpb-manifest.schema.json",
  "manifest_version": "0.3",
  "name": "zscaler-mcp",
  "display_name": "Zscaler MCP Server",
  "version": "0.4.0",
  "description": "Zscaler MCP Server - Connect AI agents with Zscaler Zero Trust Exchange",
  "long_description": "Model Context Protocol (MCP) server for Zscaler Zero Trust Exchange. Provides read-only access to Zscaler security policies, rules, and configurations via AI agents like Claude.",
  "author": {
    "name": "Zscaler, Inc.",
    "email": "bd-devrel@zscaler.com"
  },
  "server": {
    "type": "python",
    "entry_point": "src/zscaler_mcp/server.py",
    "mcp_config": {
      "command": "uvx",
      "args": [
        "--native-tls",
        "zscaler-mcp@latest"
      ],
      "env": {
        "ZSCALER_CLIENT_ID": "${user_config.client_id}",
        "ZSCALER_CLIENT_SECRET": "${user_config.client_secret}",
        "ZSCALER_CLOUD": "${user_config.cloud}"
      }
    }
  },
  "user_config": {
    "client_id": {
      "type": "string",
      "title": "Zscaler Client ID",
      "description": "Your Zscaler API client ID",
      "sensitive": true,
      "required": true
    },
    "client_secret": {
      "type": "string",
      "title": "Zscaler Client Secret",
      "description": "Your Zscaler API client secret",
      "sensitive": true,
      "required": true
    },
    "cloud": {
      "type": "string",
      "title": "Zscaler Cloud",
      "description": "Your Zscaler cloud identifier (e.g., zscaler.net, zscalerone.net)",
      "required": true,
      "default": "zscaler.net"
    }
  },
  "keywords": ["zscaler", "mcp", "security", "zero-trust"],
  "license": "MIT",
  "compatibility": {
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "python": ">=3.11.0 <4.0.0"
    }
  },
  "privacy_policies": []
}
```

## Key Changes

1. **✅ Changed command:** `"python"` → `"uvx"`
2. **✅ Changed args:** `["-m", "zscaler_mcp.server"]` → `["--native-tls", "zscaler-mcp@latest"]`
3. **✅ Removed PYTHONPATH:** Not needed with uvx (it handles dependencies)
4. **✅ Removed BUNDLE_ROOT:** Not needed (and deprecated)
5. **✅ Added manifest_version:** Updated to 0.3

## Testing the Fix

### 1. Verify PyPI package works

```bash
# Install uv if not already installed
pip install uv

# Test the package directly
uvx --native-tls zscaler-mcp@latest

# Should start the MCP server and wait for stdio input
```

### 2. Create the bundle

```bash
# Use the corrected manifest.json
mcpb pack . zscaler-mcp.mcpb
```

### 3. Verify bundle contents

```bash
mcpb info zscaler-mcp.mcpb
```

Expected bundle size: < 1 MB (no bundled dependencies)

### 4. Install in Claude Desktop

Open the `.mcpb` file with Claude Desktop. The server should:
1. Execute `uvx --native-tls zscaler-mcp@latest`
2. `uvx` fetches the package from PyPI on first run
3. Dependencies cached to `~/.cache/uv/`
4. Server starts successfully

## User Requirements

**Users must have `uv` installed:**
```bash
# Via pip
pip install uv

# Or via Homebrew
brew install uv

# Or via cargo
cargo install uv
```

## Bundle Structure (Corrected)

```
zscaler-mcp.mcpb (< 500 KB)
├── manifest.json          # Updated with uvx configuration
├── pyproject.toml         # PyPI package metadata
├── README.md              # Documentation
└── src/
    └── zscaler_mcp/       # Source code (for reference/auditing)
```

**No `server/lib/` directory needed** - dependencies fetched from PyPI at runtime.

## Comparison: Before vs After

| Aspect | Broken (Oct 2025) | Fixed (PyPI Model) |
|--------|-------------------|-------------------|
| Command | `python` | `uvx` |
| Args | `["-m", "zscaler_mcp.server"]` | `["--native-tls", "zscaler-mcp@latest"]` |
| PYTHONPATH | Set (incorrectly) | Not needed |
| Bundle size | 483 KB (broken) | < 500 KB (working) |
| Dependencies | Missing | Fetched from PyPI |
| Works? | ❌ No | ✅ Yes |

## Alternative: Traditional Bundling

If you prefer to bundle dependencies instead of using PyPI:

```json
{
  "mcp_config": {
    "command": "python",
    "args": ["${__dirname}/server/main.py"],
    "env": {
      "PYTHONPATH": "${__dirname}/server/lib",
      "ZSCALER_CLIENT_ID": "${user_config.client_id}",
      "ZSCALER_CLIENT_SECRET": "${user_config.client_secret}",
      "ZSCALER_CLOUD": "${user_config.cloud}"
    }
  }
}
```

Then bundle dependencies:
```bash
pip install --target server/lib zscaler-mcp
```

Bundle size: ~50-100 MB (with all dependencies)

## Recommendation

**Use the PyPI+uvx model** (corrected configuration above) because:
- ✅ Zscaler package already published to PyPI
- ✅ Much smaller bundle size
- ✅ Automatic updates with `@latest` tag
- ✅ Aligns with modern Python packaging practices
- ✅ Matches what README documents

The traditional bundling approach would work but is unnecessary given the package is already on PyPI.
