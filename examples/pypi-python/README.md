# PyPI-Based MCP Server Example

This example demonstrates how to create an MCP Bundle that uses **PyPI and uvx** for dynamic dependency resolution instead of bundling all dependencies directly in the `.mcpb` file.

## Overview

This deployment pattern results in:
- **Smaller bundle sizes** (< 1 MB vs 50+ MB for traditional bundling)
- **Automatic updates** via `@latest` tag
- **Cleaner development** workflow aligned with modern Python packaging

However, it requires:
- Users to have `uv` installed globally
- Internet connection at first launch (for dependency fetching)

## How It Works

1. **Bundle Contents**: Only source code, `pyproject.toml`, and lockfile
2. **Execution**: Claude Desktop runs `uvx --native-tls example-pypi-mcp@latest`
3. **Dependencies**: `uvx` fetches the package from PyPI and installs dependencies to `~/.cache/uv/`
4. **Caching**: Subsequent runs use cached dependencies (offline after first run)

## Comparison with Traditional Bundling

| Aspect | Traditional Bundling | PyPI + uvx (This Example) |
|--------|---------------------|---------------------------|
| Bundle size | 50-100 MB | < 1 MB |
| User requirements | None | `uv` must be installed |
| Internet required | No | Yes (first run) |
| Updates | Requires new bundle submission | `@latest` auto-updates |
| Offline support | Full | After first run |

## File Structure

```
pypi-python/
├── manifest.json              # MCPB manifest with uvx configuration
├── pyproject.toml             # PyPI package definition
├── README.md                  # This file
└── src/
    └── example_pypi_mcp/
        ├── __init__.py
        └── main.py            # MCP server implementation
```

## Key Configuration: manifest.json

The critical difference from traditional bundles is in the `mcp_config`:

```json
{
  "server": {
    "type": "python",
    "entry_point": "src/example_pypi_mcp/main.py",
    "mcp_config": {
      "command": "uvx",  // ← Uses uvx instead of python
      "args": [
        "--native-tls",
        "example-pypi-mcp@latest"  // ← Package name from PyPI
      ],
      "env": {
        "API_KEY": "${user_config.api_key}"
      }
    }
  }
}
```

**Important notes:**
- `entry_point` is included for reference but not used at runtime
- `command: "uvx"` tells Claude Desktop to use uvx for execution
- Package name in `args` must match `[project.name]` in `pyproject.toml`

## Key Configuration: pyproject.toml

The package must define a console script entry point:

```toml
[project]
name = "example-pypi-mcp"  # Must match uvx args

[project.scripts]
example-pypi-mcp = "example_pypi_mcp.main:main"  # Entry point
```

## Building This Example

**Important:** This example is for demonstration purposes only and should not be uploaded to PyPI (note the `"Private :: Do Not Upload"` classifier).

### 1. Create the bundle

```bash
cd examples/pypi-python
mcpb pack . example-pypi-mcp.mcpb
```

### 2. For real deployment, publish to PyPI

```bash
# Install build tools
pip install build twine

# Build the package
python -m build

# Upload to PyPI (requires account)
twine upload dist/*
```

### 3. Users install uv

```bash
# Via pip
pip install uv

# Or via Homebrew (macOS/Linux)
brew install uv
```

### 4. Install in Claude Desktop

Open the `.mcpb` file with Claude Desktop. It will:
1. Extract bundle contents
2. Parse manifest.json
3. Configure the server to run via `uvx`

On first use, `uvx` will fetch dependencies from PyPI.

## When to Use This Pattern

**Use PyPI deployment when:**
- ✅ You're already publishing your package to PyPI
- ✅ You want minimal bundle sizes
- ✅ You need to push updates without resubmitting bundles
- ✅ Your target users are comfortable installing tools

**Use traditional bundling when:**
- ✅ You want maximum compatibility (works for everyone)
- ✅ You need offline support from the start
- ✅ You're not publishing to PyPI
- ✅ You want zero external dependencies

## Testing

### Local Testing (without PyPI)

```bash
# Install in development mode
pip install -e .

# Run directly
python -m example_pypi_mcp.main

# Or via installed script
example-pypi-mcp
```

### Testing with uvx (without PyPI upload)

```bash
# Use local directory
uvx --from . example-pypi-mcp
```

## Real-World Example

The **Braze MCP Server** uses this pattern in production:
- Repository: https://github.com/braze-inc/braze_mcp_server
- PyPI: https://pypi.org/project/braze-mcp-server/
- Bundle size: ~800 KB (vs. potential 50+ MB with bundled dependencies)

## Additional Resources

- [uv documentation](https://github.com/astral-sh/uv)
- [Python Packaging Guide](https://packaging.python.org/)
- [MCPB Manifest Specification](../../MANIFEST.md)
- [MCPB README](../../README.md)
