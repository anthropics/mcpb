#!/usr/bin/env node

/**
 * Smart Tree MCP Server Wrapper
 * Ensures the correct binary is installed before running
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { install, getPlatformInfo } = require('./install');

// Check for updates (runs in background)
async function checkForUpdates() {
    try {
        const platformInfo = getPlatformInfo();
        const binaryPath = path.join(__dirname, platformInfo.binaryName);
        
        // Get current version
        const currentVersion = execSync(`"${binaryPath}" --version`, { encoding: 'utf8' })
            .trim()
            .replace(/^st\s+/, '');
        
        // Fetch latest release info
        const https = require('https');
        const latestRelease = await new Promise((resolve, reject) => {
            https.get({
                hostname: 'api.github.com',
                path: '/repos/8b-is/smart-tree/releases/latest',
                headers: {
                    'User-Agent': 'smart-tree-dxt',
                    'Accept': 'application/vnd.github.v3+json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });
        
        const latestVersion = latestRelease.tag_name.replace(/^v/, '');
        
        // Compare versions (simple string comparison)
        if (latestVersion !== currentVersion) {
            console.error(`\n📢 Smart Tree update available: ${currentVersion} → ${latestVersion}`);
            console.error('   Run the MCP server again to auto-update\n');
            
            // Create update marker file
            fs.writeFileSync(
                path.join(__dirname, '.update-available'),
                latestVersion
            );
        }
    } catch (err) {
        // Silently fail - don't interrupt normal operation
    }
}

// Pre-flight check: ensure binary is installed BEFORE MCP starts
async function ensureBinaryInstalled() {
    const platformInfo = getPlatformInfo();
    const binaryPath = path.join(__dirname, platformInfo.binaryName);
    const updateMarker = path.join(__dirname, '.update-available');
    
    if (!fs.existsSync(binaryPath) || fs.existsSync(updateMarker)) {
        // Redirect stdout to stderr during installation to prevent MCP protocol issues
        const originalWrite = process.stdout.write;
        process.stdout.write = process.stderr.write.bind(process.stderr);
        
        try {
            if (fs.existsSync(updateMarker)) {
                console.error('Smart Tree update available. Installing...');
                fs.unlinkSync(updateMarker); // Remove marker
            } else {
                console.error('Smart Tree binary not found. Installing...');
            }
            await install();
        } finally {
            // Restore stdout
            process.stdout.write = originalWrite;
        }
    }
    
    return binaryPath;
}

async function main() {
    try {
        // Ensure binary is installed BEFORE starting MCP
        const binaryPath = await ensureBinaryInstalled();
        
        // Check for updates on startup (non-blocking)
        checkForUpdates().catch(err => {
            if (process.env.DEBUG) {
                console.error('Update check failed:', err.message);
            }
        });
        
        // Now spawn the actual MCP server with clean stdio
        const args = process.argv.slice(2);
        const child = spawn(binaryPath, ['--mcp', ...args], {
            stdio: 'inherit',
            env: process.env,
            shell: false
        });
        
        // Forward signals
        process.on('SIGINT', () => child.kill('SIGINT'));
        process.on('SIGTERM', () => child.kill('SIGTERM'));
        
        // Exit with same code as child
        child.on('exit', (code) => {
            process.exit(code || 0);
        });
        
    } catch (error) {
        console.error('Failed to start Smart Tree MCP server:', error.message);
        process.exit(1);
    }
}

main();