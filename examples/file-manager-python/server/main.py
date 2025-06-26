#!/usr/bin/env python3

import os
import sys
import argparse
from pathlib import Path
from mcp.server.fastmcp import FastMCP

# Parse command line arguments
parser = argparse.ArgumentParser(description="File Manager MCP Server")
parser.add_argument(
    "--workspace", default=os.path.expanduser("~/Documents"), help="Workspace directory"
)
parser.add_argument("--debug", action="store_true", help="Enable debug mode")
args = parser.parse_args()

# Initialize server
mcp = FastMCP("file-manager-python")


@mcp.tool()
def list_files(path: str) -> str:
    """List files in a directory"""
    path_obj = Path(path)

    if not path_obj.exists():
        return f"Directory not found: {path}"

    if not path_obj.is_dir():
        return f"Path is not a directory: {path}"

    try:
        files = []
        for item in path_obj.iterdir():
            file_type = "directory" if item.is_dir() else "file"
            files.append(f"{item.name} ({file_type})")

        if not files:
            return f"Directory is empty: {path}"

        file_list = "\n".join(files)
        return f"Files in {path}:\n{file_list}"

    except PermissionError:
        return f"Permission denied accessing: {path}"
    except Exception as e:
        return f"Error listing directory: {str(e)}"


@mcp.tool()
def read_file(path: str) -> str:
    """Read file contents"""
    path_obj = Path(path)

    if not path_obj.exists():
        return f"File not found: {path}"

    if not path_obj.is_file():
        return f"Path is not a file: {path}"

    try:
        with path_obj.open("r", encoding="utf-8") as f:
            content = f.read()

        return f"Contents of {path}:\n{content}"

    except UnicodeDecodeError:
        return f"File is not text or uses unsupported encoding: {path}"
    except PermissionError:
        return f"Permission denied reading: {path}"
    except Exception as e:
        return f"Error reading file: {str(e)}"


@mcp.tool()
def get_file_info(path: str) -> str:
    """Get information about a file"""
    path_obj = Path(path)

    if not path_obj.exists():
        return f"Path not found: {path}"

    try:
        stat_info = path_obj.stat()
        file_type = "directory" if path_obj.is_dir() else "file"

        info = [
            f"Path: {path}",
            f"Type: {file_type}",
            f"Size: {stat_info.st_size} bytes",
            f"Modified: {stat_info.st_mtime}",
            f"Created: {stat_info.st_ctime}",
        ]

        info_text = "\n".join(info)
        return f"File Info:\n{info_text}"

    except PermissionError:
        return f"Permission denied accessing: {path}"
    except Exception as e:
        return f"Error getting file info: {str(e)}"


# Main execution
if __name__ == "__main__":
    # Debug output if enabled
    if args.debug:
        print("Starting File Manager MCP Server...", file=sys.stderr)
        print(f"Workspace: {args.workspace}", file=sys.stderr)

    # Run the server
    mcp.run()
