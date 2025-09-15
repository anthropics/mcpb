#!/usr/bin/env python3

import os
import sys
import argparse

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="File Manager MCP Server")
    parser.add_argument(
        "--workspace", default=os.path.expanduser("~/Documents"), help="Workspace directory"
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    args = parser.parse_args()

    # Debug output if enabled
    if args.debug:
        print("Starting File Manager MCP Server...", file=sys.stderr)
        print(f"Workspace: {args.workspace}", file=sys.stderr)

    # Import and run the server
    from .server import mcp
    mcp.run()

if __name__ == "__main__":
    main()