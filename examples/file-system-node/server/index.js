#!/usr/bin/env node

/**
 * Entry point for the Filesystem MCP server extension
 * This wraps the @modelcontextprotocol/server-filesystem package
 */

// Get allowed directories from command line arguments
const args = process.argv.slice(2);

// Use dynamic require since we need CommonJS compatibility
const loadServer = async () => {
  try {
    // Save original argv
    const originalArgv = process.argv;
    
    // The filesystem server expects directories as command line arguments
    process.argv = [process.argv[0], process.argv[1], ...args];
    
    // Dynamically import the ESM module
    await import('@modelcontextprotocol/server-filesystem/dist/index.js');
    
    // Restore original argv
    process.argv = originalArgv;
  } catch (error) {
    console.error('Failed to load @modelcontextprotocol/server-filesystem:', error);
    process.exit(1);
  }
};

// Execute the async function
loadServer();