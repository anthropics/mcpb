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
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Download and extract binary from URL
async function downloadBinary(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`📥 Downloading from: ${url}`);
        
        const isCompressed = url.endsWith('.tar.gz') || url.endsWith('.zip');
        const tempFile = isCompressed ? destPath + '.tmp' : destPath;
        
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
                reject(new Error(`Failed to download: ${res.statusCode}`));
                return;
            }
            
            const file = fs.createWriteStream(tempFile);
            res.pipe(file);
            
            file.on('finish', () => {
                file.close();
                
                if (isCompressed) {
                    // Extract the binary
                    console.log('📦 Extracting binary...');
                    try {
                        if (url.endsWith('.tar.gz')) {
                            // Extract tar.gz using built-in tar command
                            execSync(`tar -xzf "${tempFile}" -C "${path.dirname(destPath)}"`, { stdio: 'inherit' });
                        } else if (url.endsWith('.zip')) {
                            // Extract zip for Windows
                            execSync(`unzip -o "${tempFile}" -d "${path.dirname(destPath)}"`, { stdio: 'inherit' });
                        }
                        
                        // Clean up temp file
                        fs.unlinkSync(tempFile);
                        
                        // The binary might be in a subdirectory, try to find it
                        const binaryName = path.basename(destPath);
                        const extractedBinary = path.join(path.dirname(destPath), binaryName);
                        
                        if (!fs.existsSync(extractedBinary)) {
                            // Look for the binary in immediate subdirectories
                            const files = fs.readdirSync(path.dirname(destPath));
                            for (const file of files) {
                                const fullPath = path.join(path.dirname(destPath), file);
                                if (fs.statSync(fullPath).isDirectory()) {
                                    const nestedBinary = path.join(fullPath, binaryName);
                                    if (fs.existsSync(nestedBinary)) {
                                        fs.renameSync(nestedBinary, destPath);
                                        fs.rmdirSync(fullPath);
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        reject(new Error(`Failed to extract: ${err.message}`));
                        return;
                    }
                }
                
                // Make executable on Unix-like systems
                if (process.platform !== 'win32') {
                    fs.chmodSync(destPath, '755');
                }
                resolve();
            });
        }).on('error', reject);
    });
}

// Main installation function
async function install() {
    try {
        console.log('🌳 Smart Tree Binary Installer');
        console.log('==============================\n');
        
        const platformInfo = getPlatformInfo();
        console.log(`📍 Platform: ${platformInfo.platform} ${platformInfo.arch}`);
        console.log(`🎯 Target: ${platformInfo.rustTarget}\n`);
        
        // Check if binary already exists
        const binaryPath = path.join(__dirname, platformInfo.binaryName);
        if (fs.existsSync(binaryPath)) {
            console.log('✅ Binary already exists. Checking version...');
            try {
                const version = execSync(`${binaryPath} --version`, { encoding: 'utf8' }).trim();
                console.log(`📌 Current version: ${version}`);
            } catch (e) {
                console.log('⚠️  Could not determine current version');
            }
        }
        
        console.log('\n🔍 Fetching latest release info...');
        const release = await getLatestRelease();
        console.log(`📦 Latest version: ${release.tag_name}`);
        
        // Find the asset for our platform
        const asset = release.assets.find(a => 
            a.name === platformInfo.assetName || 
            a.name === `${BINARY_NAME}-${platformInfo.rustTarget}.tar.gz`
        );
        
        if (!asset) {
            throw new Error(`No binary found for ${platformInfo.rustTarget} in latest release`);
        }
        
        console.log(`\n📥 Downloading ${asset.name}...`);
        await downloadBinary(asset.browser_download_url, binaryPath);
        
        // Verify installation
        console.log('\n🔧 Verifying installation...');
        const version = execSync(`${binaryPath} --version`, { encoding: 'utf8' }).trim();
        console.log(`✅ Successfully installed: ${version}`);
        
        // Test MCP functionality
        console.log('\n🧪 Testing MCP server...');
        const testResult = execSync(
            `echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | ${binaryPath} --mcp 2>&1 | head -2`,
            { encoding: 'utf8' }
        );
        
        if (testResult.includes('MCP server started')) {
            console.log('✅ MCP server test passed!');
        } else {
            console.log('⚠️  MCP server test inconclusive');
        }
        
        console.log('\n🎉 Installation complete!');
        
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