#!/bin/bash

# Build script for smart-tree DXT package

set -e

echo "🌲 Building smart-tree DXT package..."

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Check required files
required_files=("manifest.json" "server/index.js" "server/install.js" "server/package.json" "icon.png" "README.md")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing required file: $file"
        exit 1
    fi
done

# Create the DXT package (zip file with .dxt extension)
echo "📦 Creating smart-tree.dxt..."
# Remove old package if exists
rm -f smart-tree.dxt
# Create new package without storing directory entries
zip -r smart-tree.dxt manifest.json icon.png README.md server/index.js server/install.js server/package.json server/.gitignore

echo "✅ Successfully created smart-tree.dxt"
echo ""
echo "📋 Package contents:"
unzip -l smart-tree.dxt

echo ""
echo "🚀 To install in Claude Desktop:"
echo "   1. Open Claude Desktop"
echo "   2. Go to Settings > Developer"
echo "   3. Click 'Install from file'"
echo "   4. Select smart-tree.dxt" 