# MCPB CLI Documentation

The MCPB CLI provides tools for building MCP Bundles.

## Installation

```bash
npm install -g @anthropic-ai/mcpb
```

```
Usage: mcpb [options] [command]

Tools for building MCP Bundles

Options:
  -V, --version              output the version number
  -h, --help                 display help for command

Commands:
  init [directory]           Create a new MCPB extension manifest
  validate [manifest]        Validate a MCPB manifest file
  pack <directory> [output]  Pack a directory into a MCPB extension
  sign [options] <mcpb-file>  Sign a MCPB extension file
  verify <mcpb-file>          Verify the signature of a MCPB extension file
  info <mcpb-file>            Display information about a MCPB extension file
  unsign <mcpb-file>          Remove signature from a MCPB extension file
  help [command]             display help for command
```

## Commands

### `mcpb init [directory]`

Creates a new MCPB extension manifest interactively.

```bash
# Initialize in current directory
mcpb init

# Initialize in a specific directory
mcpb init my-extension/
```

The command will prompt you for:

- Extension name (defaults from package.json or folder name)
- Author name (defaults from package.json)
- Extension ID (auto-generated from author and extension name)
- Display name
- Version (defaults from package.json or 1.0.0)
- Description
- Author email and URL (optional)
- Server type (Node.js, Python, or Binary)
- Entry point (with sensible defaults per server type)
- Tools configuration
- Keywords, license, and repository information

After creating the manifest, it provides helpful next steps based on your server type.

### `mcpb validate [path]`

Validates a MCPB manifest file against the schema. You can provide either a direct path to a manifest.json file or a directory containing one.

```bash
# Validate specific manifest file
mcpb validate manifest.json

# Validate manifest in directory
mcpb validate ./my-extension
mcpb validate .

# Validate using --dirname without specifying manifest.json explicitly
mcpb validate --dirname ./my-extension
```

#### Additional validation with `--dirname`

Passing `--dirname <directory>` performs deeper checks that require access to the extension's source files:

- Verifies referenced assets exist relative to the directory (`icon`, each `screenshots` entry, `server.entry_point`, and path-like `server.mcp_config.command`).
- Launches the server (honoring `${__dirname}` tokens) and discovers tools & prompts using the same logic as `mcpb pack`.
- Compares discovered capability names against the manifest and fails if they differ.

When `--dirname` is supplied without an explicit manifest argument, the CLI automatically resolves `<directory>/manifest.json`. Use `--update` alongside `--dirname` to rewrite the manifest in-place with the discovered tool/prompt lists (including `tools_generated` / `prompts_generated` flags). When rewriting, the CLI also copies over tool descriptions and prompt metadata (descriptions, declared arguments, and prompt text) returned by the server. Without `--update`, any mismatch causes the command to fail.

The discovery step respects the same environment overrides as `mcpb pack`:

- `MCPB_TOOL_DISCOVERY_JSON`
- `MCPB_PROMPT_DISCOVERY_JSON`

These allow deterministic testing without launching the server.

### `mcpb pack <directory> [output]`

Packs a directory into a MCPB extension file.

```bash
# Pack current directory into extension.mcpb
mcpb pack .

# Pack with custom output filename
mcpb pack my-extension/ my-extension-v1.0.mcpb
```

The command automatically:

- Validates the manifest.json
- Excludes common development files (.git, node_modules/.cache, .DS_Store, etc.)
- Creates a compressed .mcpb file (ZIP with maximum compression)

#### Capability Discovery (Tools & Prompts)

During packing, the CLI launches your server (based on `server.mcp_config.command` + `args`) and uses the official C# MCP client to request both tool and prompt listings. It compares the discovered tool names (`tools` array) and prompt names (`prompts` array) with those declared in `manifest.json`.

If they differ:

- Default: packing fails with an error explaining the mismatch.
- `--force`: continue packing despite any mismatch (does not modify the manifest).
- `--update`: overwrite the `tools` and/or `prompts` list in `manifest.json` with the discovered sets (also sets `tools_generated: true` and/or `prompts_generated: true`) and persists the discovered descriptions plus prompt arguments/text when available.
- `--no-discover`: skip dynamic discovery entirely (useful offline or when the server cannot be executed locally).

Environment overrides for tests/CI:

- `MCPB_TOOL_DISCOVERY_JSON` JSON array of tool names.
- `MCPB_PROMPT_DISCOVERY_JSON` JSON array of prompt names.
  If either is set, the server process is not launched for that capability.

#### Referenced File Validation

Before launching the server or writing the archive, `mcpb pack` now validates that certain files referenced in `manifest.json` actually exist relative to the extension directory:

- `icon` (if specified)
- `server.entry_point`
- Path-like `server.mcp_config.command` values (those containing `/`, `\\`, `${__dirname}`, starting with `./` or `..`, or ending in common script/binary extensions such as `.js`, `.py`, `.exe`)
- Each file in `screenshots` (if specified)

If any of these files are missing, packing fails immediately with an error like `Missing icon file: icon.png`. This happens before dynamic capability discovery so you get fast feedback on manifest inaccuracies.

Commands (e.g. `node`, `python`) that are not path-like are not validated—they are treated as executables resolved by the environment.

Examples:

```bash
## Fail if mismatch
mcpb pack .

# Force success even if mismatch
mcpb pack . --force

## Update manifest.json to discovered tools/prompts
mcpb pack . --update

# Skip discovery (behaves like legacy pack)
mcpb pack . --no-discover
```

### `mcpb sign <mcpb-file>`

Signs a MCPB extension file with a certificate.

```bash
# Sign with default certificate paths
mcpb sign my-extension.mcpb

# Sign with custom certificate and key
mcpb sign my-extension.mcpb --cert /path/to/cert.pem --key /path/to/key.pem

# Sign with intermediate certificates
mcpb sign my-extension.mcpb --cert cert.pem --key key.pem --intermediate intermediate1.pem intermediate2.pem

# Create and use a self-signed certificate
mcpb sign my-extension.mcpb --self-signed
```

Options:

- `--cert, -c`: Path to certificate file (PEM format, default: cert.pem)
- `--key, -k`: Path to private key file (PEM format, default: key.pem)
- `--intermediate, -i`: Paths to intermediate certificate files
- `--self-signed`: Create a self-signed certificate if none exists

### `mcpb verify <mcpb-file>`

Verifies the signature of a signed MCPB extension file.

```bash
mcpb verify my-extension.mcpb
```

Output includes:

- Signature validity status
- Certificate subject and issuer
- Certificate validity dates
- Certificate fingerprint
- Warning if self-signed

### `mcpb info <mcpb-file>`

Displays information about a MCPB extension file.

```bash
mcpb info my-extension.mcpb
```

Shows:

- File size
- Signature status
- Certificate details (if signed)

### `mcpb unsign <mcpb-file>`

Removes the signature from a MCPB extension file (for development/testing).

```bash
mcpb unsign my-extension.mcpb
```

## Certificate Requirements

For signing extensions, you need:

1. **Certificate**: X.509 certificate in PEM format
   - Should have Code Signing extended key usage
   - Can be self-signed (for development) or CA-issued (for production)

2. **Private Key**: Corresponding private key in PEM format
   - Must match the certificate's public key

3. **Intermediate Certificates** (optional): For CA-issued certificates
   - Required for proper certificate chain validation

## Example Workflows

### Quick Start with Init

```bash
# 1. Create a new extension directory
mkdir my-awesome-extension
cd my-awesome-extension

# 2. Initialize the extension
mcpb init

# 3. Follow the prompts to configure your extension
# The tool will create a manifest.json with all necessary fields

# 4. Create your server implementation based on the entry point you specified

# 5. Pack the extension
mcpb pack .

# 6. (Optional) Sign the extension
mcpb sign my-awesome-extension.mcpb --self-signed
```

### Development Workflow

```bash
# 1. Create your extension
mkdir my-extension
cd my-extension

# 2. Initialize with mcpb init or create manifest.json manually
mcpb init

# 3. Implement your server
# For Node.js: create server/index.js
# For Python: create server/main.py
# For Binary: add your executable

# 4. Validate manifest
mcpb validate manifest.json

# 5. Pack extension
mcpb pack . my-extension.mcpb

# 6. (Optional) Sign for testing
mcpb sign my-extension.mcpb --self-signed

# 7. Verify signature
mcpb verify my-extension.mcpb

# 8. Check extension info
mcpb info my-extension.mcpb
```

### Production Workflow

```bash
# 1. Pack your extension
mcpb pack my-extension/

# 2. Sign with production certificate
mcpb sign my-extension.mcpb \
  --cert production-cert.pem \
  --key production-key.pem \
  --intermediate intermediate-ca.pem root-ca.pem

# 3. Verify before distribution
mcpb verify my-extension.mcpb
```

## Excluded Files

When packing an extension, the following files/patterns are automatically excluded:

- `.DS_Store`, `Thumbs.db`
- `.gitignore`, `.git/`
- `*.log`, `npm-debug.log*`, `yarn-debug.log*`, `yarn-error.log*`
- `.npm/`, `.npmrc`, `.yarnrc`, `.yarn/`, `.pnp.*`
- `node_modules/.cache/`, `node_modules/.bin/`
- `*.map`
- `.env.local`, `.env.*.local`
- `package-lock.json`, `yarn.lock`

### Custom Exclusions with .mcpbignore

You can create a `.mcpbignore` file in your extension directory to specify additional files and patterns to exclude during packing. This works similar to `.npmignore` or `.gitignore`:

```
# .mcpbignore example
# Comments start with #
*.test.js
src/**/*.test.ts
coverage/
*.log
.env*
temp/
docs/
```

The `.mcpbignore` file supports:

- **Exact matches**: `filename.txt`
- **Simple globs**: `*.log`, `temp/*`
- **Directory paths**: `docs/`, `coverage/`
- **Comments**: Lines starting with `#` are ignored
- **Empty lines**: Blank lines are ignored

When a `.mcpbignore` file is found, the CLI will display the number of additional patterns being applied. These patterns are combined with the default exclusion list.

## Technical Details

### Signature Format

MCPB uses PKCS#7 (Cryptographic Message Syntax) for digital signatures:

- Signatures are stored in DER-encoded PKCS#7 SignedData format
- The signature is appended to the MCPB file with markers (`MCPB_SIG_V1` and `MCPB_SIG_END`)
- The entire MCPB content (excluding the signature block) is signed
- Detached signature format - the original ZIP content remains unmodified

### Signature Structure

```
[Original MCPB ZIP content]
MCPB_SIG_V1
[Base64-encoded PKCS#7 signature]
MCPB_SIG_END
```

This approach allows:

- Backward compatibility (unsigned MCPB files are valid ZIP files)
- Easy signature verification and removal
- Support for certificate chains with intermediate certificates
