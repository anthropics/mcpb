#!/usr/bin/env python3
"""
Example MCP Server demonstrating PyPI-based deployment with uvx.

This server shows how to create an MCP Bundle that uses dynamic dependency
resolution via PyPI and uvx instead of bundling all dependencies.
"""

import logging
import os
from datetime import datetime, timezone

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if os.getenv("DEBUG") == "true" else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create server instance
app = Server("example-pypi-mcp")


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        Tool(
            name="echo",
            description="Echo back a message (demonstrates basic tool functionality)",
            inputSchema={
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Message to echo back"
                    }
                },
                "required": ["message"]
            }
        ),
        Tool(
            name="get_timestamp",
            description="Get current timestamp in ISO format",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""
    logger.info(f"Tool called: {name} with arguments: {arguments}")

    if name == "echo":
        message = arguments.get("message", "")
        api_key = os.getenv("API_KEY", "not-set")
        return [
            TextContent(
                type="text",
                text=f"Echo: {message}\n\nAPI Key configured: {api_key[:10]}..." if len(api_key) > 10 else api_key
            )
        ]

    elif name == "get_timestamp":
        timestamp = datetime.now(timezone.utc).isoformat()
        return [
            TextContent(
                type="text",
                text=f"Current UTC timestamp: {timestamp}"
            )
        ]

    else:
        raise ValueError(f"Unknown tool: {name}")


def main():
    """Main entry point for the server."""
    logger.info("Starting Example PyPI MCP Server")
    logger.info(f"API_KEY environment variable: {'set' if os.getenv('API_KEY') else 'not set'}")
    logger.info(f"DEBUG mode: {os.getenv('DEBUG', 'false')}")

    # Run the server using stdio transport
    import asyncio
    asyncio.run(stdio_server(app))


if __name__ == "__main__":
    main()
