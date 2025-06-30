#!/bin/bash
# Quick setup script for creating a new DXT package from this template

set -e

echo "🚀 DXT Package Setup Wizard"
echo "=========================="
echo

# Prompt for basic information
read -p "Enter your tool name (e.g., my-tool): " TOOL_NAME
read -p "Enter your GitHub username: " GITHUB_USER
read -p "Enter your company/organization ID (e.g., com.example): " ORG_ID
read -p "Enter display name (e.g., My Tool): " DISPLAY_NAME
read -p "Enter short description: " DESCRIPTION

# Sanitize inputs
TOOL_NAME_SAFE=$(echo "$TOOL_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
PACKAGE_ID="${ORG_ID}.${TOOL_NAME_SAFE}"

echo
echo "📝 Configuration Summary:"
echo "  Tool Name: $TOOL_NAME_SAFE"
echo "  Package ID: $PACKAGE_ID"
echo "  GitHub Repo: $GITHUB_USER/$TOOL_NAME_SAFE"
echo "  Display Name: $DISPLAY_NAME"
echo

read -p "Continue with these settings? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]] && [[ ! -z $REPLY ]]; then
    echo "Setup cancelled."
    exit 1
fi

echo "🔧 Updating files..."

# Update manifest.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/com.example.smart-tree-universal/$PACKAGE_ID/g" manifest.json
    sed -i '' "s/smart-tree-universal/$TOOL_NAME_SAFE/g" manifest.json
    sed -i '' "s/Smart Tree Universal/$DISPLAY_NAME/g" manifest.json
    sed -i '' "s/A blazingly fast, AI-friendly directory tree visualization tool/$DESCRIPTION/g" manifest.json
else
    # Linux
    sed -i "s/com.example.smart-tree-universal/$PACKAGE_ID/g" manifest.json
    sed -i "s/smart-tree-universal/$TOOL_NAME_SAFE/g" manifest.json
    sed -i "s/Smart Tree Universal/$DISPLAY_NAME/g" manifest.json
    sed -i "s/A blazingly fast, AI-friendly directory tree visualization tool/$DESCRIPTION/g" manifest.json
fi

# Update install.js
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|8b-is/smart-tree|$GITHUB_USER/$TOOL_NAME_SAFE|g" server/install.js
    sed -i '' "s|const BINARY_NAME = 'st'|const BINARY_NAME = '$TOOL_NAME_SAFE'|g" server/install.js
else
    sed -i "s|8b-is/smart-tree|$GITHUB_USER/$TOOL_NAME_SAFE|g" server/install.js
    sed -i "s|const BINARY_NAME = 'st'|const BINARY_NAME = '$TOOL_NAME_SAFE'|g" server/install.js
fi

# Update package.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/smart-tree-dxt/$TOOL_NAME_SAFE-dxt/g" server/package.json
    sed -i '' "s/Smart Tree MCP Server for Claude Desktop/$DISPLAY_NAME MCP Server for Claude Desktop/g" server/package.json
else
    sed -i "s/smart-tree-dxt/$TOOL_NAME_SAFE-dxt/g" server/package.json
    sed -i "s/Smart Tree MCP Server for Claude Desktop/$DISPLAY_NAME MCP Server for Claude Desktop/g" server/package.json
fi

# Update build script
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/smart-tree.dxt/$TOOL_NAME_SAFE.dxt/g" build-dxt.sh
else
    sed -i "s/smart-tree.dxt/$TOOL_NAME_SAFE.dxt/g" build-dxt.sh
fi

# Initialize git repository
echo
echo "🔄 Initializing git repository..."
rm -rf .git
git init
git add .
git commit -m "Initial commit: DXT package for $DISPLAY_NAME

Based on Smart Tree Universal DXT template
- Auto-updating binary distribution
- Cross-platform support
- MCP server integration"

echo
echo "✅ Setup complete!"
echo
echo "📋 Next steps:"
echo "  1. Update the tools array in manifest.json"
echo "  2. Replace icon.png with your tool's icon"
echo "  3. Update README.md with your documentation"
echo "  4. Create a GitHub repository:"
echo "     git remote add origin https://github.com/$GITHUB_USER/$TOOL_NAME_SAFE-dxt"
echo "     git push -u origin main"
echo "  5. Set up GitHub Actions for building your binaries"
echo "  6. Test with: ./build-dxt.sh"
echo
echo "📚 See IMPLEMENTATION_GUIDE.md for detailed instructions"
echo
echo "Happy coding! 🚀"