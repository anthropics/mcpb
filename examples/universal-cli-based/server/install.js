#!/usr/bin/env node

/**
 * Smart Tree Binary Installer
 * Downloads the appropriate st binary from GitHub releases
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = '8b-is/smart-tree';
const BINARY_NAME = 'st';

// Detect platform and architecture
function getPlatformInfo() {
    const platform = process.platform;
    const arch = process.arch;
    
    // Map Node.js platform/arch to Rust target triples
    const mapping = {
        'darwin-arm64': 'aarch64-apple-darwin',
        'darwin-x64': 'x86_64-apple-darwin',
        'linux-x64': 'x86_64-unknown-linux-gnu',
        'linux-arm64': 'aarch64-unknown-linux-gnu',
        'win32-x64': 'x86_64-pc-windows-msvc',
    };
    
    const key = `${platform}-${arch}`;
    const rustTarget = mapping[key];
    
    if (!rustTarget) {
        throw new Error(`Unsupported platform: ${platform} ${arch}`);
    }
    
    return {
        platform,
        arch,
        rustTarget,
        binaryName: platform === 'win32' ? `${BINARY_NAME}.exe` : BINARY_NAME,
        assetName: `st-${rustTarget}${platform === 'win32' ? '.exe' : ''}`
    };
}

// Fetch latest release info from GitHub
async function getLatestRelease() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${REPO}/releases/latest`,
            headers: {
                'User-Agent': 'smart-tree-dxt-installer',
                'Accept': 'application/vnd.github.v3+json'
            }
        };
        
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`GitHub API returned ${res.statusCode}: ${data}`));
                } else {
                    resolve(JSON.parse(data));
                }
            });
        }).on('error', reject);
    });
}

// Download and extract binary from URL
async function downloadBinary(url, destPath) {
    return new Promise((resolve, reject) => {
        console.error(`📥 Downloading from: ${url}`);
        
        const isCompressed = url.endsWith('.tar.gz') || url.endsWith('.zip');
        const tempFile = destPath + '.download';
        
        https.get(url, {
            headers: { 'User-Agent': 'smart-tree-dxt-installer' },
            followRedirect: true 
        }, (res) => {
            // Handle redirects
            if (res.statusCode === 302 || res.statusCode === 301) {
                return downloadBinary(res.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (res.statusCode !== 200) {
                reject(new Error(`Download failed with status ${res.statusCode}`));
                return;
            }
            
            const file = fs.createWriteStream(tempFile);
            res.pipe(file);
            
            file.on('finish', () => {
                file.close();
                
                if (isCompressed) {
                    // Extract the binary
                    console.error('📦 Extracting binary...');
                    try {
                        const extractDir = path.dirname(destPath);
                        const binaryName = path.basename(destPath);
                        
                        // Create a temporary extraction directory
                        const tempExtractDir = destPath + '.extract';
                        if (!fs.existsSync(tempExtractDir)) {
                            fs.mkdirSync(tempExtractDir, { recursive: true });
                        }
                        
                        if (url.endsWith('.tar.gz')) {
                            // Extract tar.gz to temp directory
                            execSync(`tar -xzf "${tempFile}" -C "${tempExtractDir}"`, { 
                                stdio: 'pipe' // Prevent output to stdout
                            });
                        } else if (url.endsWith('.zip')) {
                            // Extract zip for Windows
                            execSync(`unzip -o "${tempFile}" -d "${tempExtractDir}"`, { 
                                stdio: 'pipe' // Prevent output to stdout
                            });
                        }
                        
                        // Clean up downloaded archive
                        fs.unlinkSync(tempFile);
                        
                        // Find the extracted binary
                        // The binary might be directly in the temp dir or named 'st'/'st.exe'
                        let extractedBinary = null;
                        const files = fs.readdirSync(tempExtractDir);
                        
                        for (const file of files) {
                            const filePath = path.join(tempExtractDir, file);
                            const stat = fs.statSync(filePath);
                            
                            if (stat.isFile() && (file === binaryName || file === 'st' || file === 'st.exe')) {
                                extractedBinary = filePath;
                                break;
                            }
                        }
                        
                        if (!extractedBinary) {
                            throw new Error('Binary not found after extraction');
                        }
                        
                        // Move the binary to its destination
                        fs.renameSync(extractedBinary, destPath);
                        
                        // Clean up temp directory
                        fs.rmSync(tempExtractDir, { recursive: true, force: true });
                        
                    } catch (err) {
                        // Clean up on error
                        try {
                            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                            if (fs.existsSync(destPath + '.extract')) {
                                fs.rmSync(destPath + '.extract', { recursive: true, force: true });
                            }
                        } catch (e) {
                            // Ignore cleanup errors
                        }
                        reject(new Error(`Failed to extract: ${err.message}`));
                        return;
                    }
                } else {
                    // Move downloaded file to destination
                    fs.renameSync(tempFile, destPath);
                }
                
                // Make executable on Unix-like systems
                if (process.platform !== 'win32') {
                    fs.chmodSync(destPath, '755');
                }
                
                // Verify it's actually executable
                try {
                    const fileInfo = execSync(`file "${destPath}"`, { encoding: 'utf8' });
                    console.error(`📋 File type: ${fileInfo.trim()}`);
                } catch (e) {
                    // file command might not exist on all systems
                }
                
                resolve();
            });
        }).on('error', reject);
    });
}

// Main installer function
async function install() {
    console.error('🌳 Smart Tree Binary Installer');
    console.error('===============================\n');
    
    try {
        const platformInfo = getPlatformInfo();
        console.error(`📍 Platform: ${platformInfo.platform} (${platformInfo.arch})`);
        console.error(`🎯 Target: ${platformInfo.rustTarget}`);
        
        // Check if binary already exists
        const binaryPath = path.join(__dirname, platformInfo.binaryName);
        if (fs.existsSync(binaryPath)) {
            console.error('✅ Binary already exists. Checking version...');
            try {
                const version = execSync(`"${binaryPath}" --version`, { encoding: 'utf8' }).trim();
                console.error(`📌 Current version: ${version}`);
                
                // If we can get the version, the binary is working
                console.error('✨ Binary is working correctly!');
                return;
            } catch (e) {
                console.error('⚠️  Binary exists but not working, will reinstall...');
                // Continue with installation
            }
        }
        
        // Fetch latest release
        console.error('\n🔍 Fetching latest release info...');
        const release = await getLatestRelease();
        console.error(`📦 Latest version: ${release.tag_name}`);
        
        // Find the appropriate asset
        const assetName = `${platformInfo.assetName}${platformInfo.platform === 'win32' ? '.zip' : '.tar.gz'}`;
        const asset = release.assets.find(a => a.name === assetName);
        
        if (!asset) {
            throw new Error(`No binary found for ${platformInfo.rustTarget} in latest release`);
        }
        
        console.error(`\n📥 Downloading ${asset.name}...`);
        await downloadBinary(asset.browser_download_url, binaryPath);
        
        // Verify installation
        console.error('\n🔧 Verifying installation...');
        const version = execSync(`"${binaryPath}" --version`, { encoding: 'utf8' }).trim();
        console.error(`✅ Successfully installed: ${version}`);
        
        // Test MCP functionality
        console.error('\n🧪 Testing MCP server...');
        const testResult = execSync(
            `echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | "${binaryPath}" --mcp 2>&1 | head -2`,
            { encoding: 'utf8' }
        );
        
        if (testResult.includes('MCP server started')) {
            console.error('✅ MCP server test passed!');
        } else {
            console.error('⚠️  MCP server test inconclusive');
        }
        
        console.error('\n🎉 Installation complete!');
        
    } catch (error) {
        console.error('\n❌ Installation failed:', error.message);
        console.error('\n💡 Troubleshooting:');
        console.error('   1. Check internet connection');
        console.error('   2. Verify GitHub releases exist for your platform');
        console.error('   3. Try manual download from:', `https://github.com/${REPO}/releases`);
        process.exit(1);
    }
}

// Run installer if called directly
if (require.main === module) {
    install();
}

module.exports = { install, getPlatformInfo };