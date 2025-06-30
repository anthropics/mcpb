# DXT Package Template Checklist

Use this checklist when creating your own DXT package based on this example.

## Pre-Development

- [ ] Have pre-built binaries for your tool
- [ ] Set up GitHub repository with releases
- [ ] Plan your MCP tool interface
- [ ] Design your tool's icon (512x512 PNG)

## Initial Setup

- [ ] Fork/copy this example
- [ ] Remove `.git` directory
- [ ] Initialize new git repository
- [ ] Update `manifest.json` with your tool's info
- [ ] Update `server/install.js` with your repo details
- [ ] Update `server/package.json` with your package info

## Customization

- [ ] Define your MCP tools in `manifest.json`
- [ ] Add any prompts in `manifest.json`
- [ ] Update binary naming scheme in `install.js`
- [ ] Customize platform mappings if needed
- [ ] Update icon.png with your tool's icon

## GitHub Setup

- [ ] Create release workflow in `.github/workflows/`
- [ ] Set up binary building for all platforms
- [ ] Use consistent naming for release assets
- [ ] Test release process with a tag

## Testing

- [ ] Test binary download on your platform
- [ ] Test binary extraction (tar.gz/zip)
- [ ] Test MCP server launch
- [ ] Test in Claude Desktop
- [ ] Test auto-update functionality

## Documentation

- [ ] Update README.md with your tool's info
- [ ] Document your MCP tools
- [ ] Add usage examples
- [ ] Include troubleshooting section
- [ ] Add screenshots if applicable

## Security

- [ ] Review allowed/blocked paths
- [ ] Ensure HTTPS for all downloads
- [ ] Add input validation
- [ ] Consider checksum verification
- [ ] Test with minimal permissions

## Release

- [ ] Build final DXT package
- [ ] Test installation from scratch
- [ ] Create GitHub release
- [ ] Upload DXT to release
- [ ] Share with community

## Post-Release

- [ ] Monitor for issues
- [ ] Gather user feedback
- [ ] Plan improvements
- [ ] Consider contributing back to this example

---

Remember: A good DXT package "just works" for the end user! 🚀