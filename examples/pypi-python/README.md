# PyPI-Based MCP Server Example

This example demonstrates creating an MCP Bundle that uses PyPI and `uvx` for dynamic dependency resolution.

## How It Works

1. Bundle contains only source code and package metadata (< 1 MB)
2. Claude Desktop runs `uvx --native-tls example-pypi-mcp@latest`
3. `uvx` fetches dependencies from PyPI and caches them locally

## Key Configuration

**manifest.json:**
```json
{
  "mcp_config": {
    "command": "uvx",
    "args": ["--native-tls", "example-pypi-mcp@latest"]
  }
}
```

**pyproject.toml:**
```toml
[project]
name = "example-pypi-mcp"

[project.scripts]
example-pypi-mcp = "example_pypi_mcp.main:main"
```

## Usage

Users need `uv` installed (`pip install uv`). When Claude Desktop runs the server, `uvx` automatically fetches the package from PyPI on first use.
