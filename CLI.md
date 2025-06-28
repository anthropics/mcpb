# DXT CLI Documentation

The DXT CLI provides tools for building Desktop Extensions.

## Installation

```bash
npm install -g @anthropic-ai/dxt
```

```
Usage: dxt [options] [command]

Tools for building Desktop Extensions

Options:
  -V, --version              output the version number
  -h, --help                 display help for command

Commands:
  init [directory]           Create a new DXT extension manifest
  validate <manifest>        Validate a DXT manifest file
  pack <directory> [output]  Pack a directory into a DXT extension
  sign [options] <dxt-file>  Sign a DXT extension file
  verify <dxt-file>          Verify the signature of a DXT extension file
  info <dxt-file>            Display information about a DXT extension file
  unsign <dxt-file>          Remove signature from a DXT extension file
  help [command]             display help for command
```

## Commands

### `dxt init [directory]`

Creates a new DXT extension manifest interactively.

```bash
# Initialize in current directory
dxt init

# Initialize in a specific directory
dxt init my-extension/
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

### `dxt validate <path>`

Validates a DXT manifest file against the schema. You can provide either a direct path to a manifest.json file or a directory containing one.

```bash
# Validate specific manifest file
dxt validate manifest.json

# Validate manifest in directory
dxt validate ./my-extension
dxt validate .
```

### `dxt pack <directory> [output]`

Packs a directory into a DXT extension file.

```bash
# Pack current directory into extension.dxt
dxt pack .

# Pack with custom output filename
dxt pack my-extension/ my-extension-v1.0.dxt
```

The command automatically:

- Validates the manifest.json
- Excludes common development files (.git, node_modules/.cache, .DS_Store, etc.)
- Creates a compressed .dxt file (ZIP with maximum compression)

### `dxt sign <dxt-file>`

Signs a DXT extension file with a certificate.

```bash
# Sign with default certificate paths
dxt sign my-extension.dxt

# Sign with custom certificate and key
dxt sign my-extension.dxt --cert /path/to/cert.pem --key /path/to/key.pem

# Sign with intermediate certificates
dxt sign my-extension.dxt --cert cert.pem --key key.pem --intermediate intermediate1.pem intermediate2.pem

# Create and use a self-signed certificate
dxt sign my-extension.dxt --self-signed
```

Options:

- `--cert, -c`: Path to certificate file (PEM format, default: cert.pem)
- `--key, -k`: Path to private key file (PEM format, default: key.pem)
- `--intermediate, -i`: Paths to intermediate certificate files
- `--self-signed`: Create a self-signed certificate if none exists

### `dxt verify <dxt-file>`

Verifies the signature of a signed DXT extension file.

```bash
dxt verify my-extension.dxt
```

Output includes:

- Signature validity status
- Certificate subject and issuer
- Certificate validity dates
- Certificate fingerprint
- Warning if self-signed

### `dxt info <dxt-file>`

Displays information about a DXT extension file.

```bash
dxt info my-extension.dxt
```

Shows:

- File size
- Signature status
- Certificate details (if signed)

### `dxt unsign <dxt-file>`

Removes the signature from a DXT extension file (for development/testing).

```bash
dxt unsign my-extension.dxt
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
dxt init

# 3. Follow the prompts to configure your extension
# The tool will create a manifest.json with all necessary fields

# 4. Create your server implementation based on the entry point you specified

# 5. Pack the extension
dxt pack .

# 6. (Optional) Sign the extension
dxt sign my-awesome-extension.dxt --self-signed
```

### Development Workflow

```bash
# 1. Create your extension
mkdir my-extension
cd my-extension

# 2. Initialize with dxt init or create manifest.json manually
dxt init

# 3. Implement your server
# For Node.js: create server/index.js
# For Python: create server/main.py
# For Binary: add your executable

# 4. Validate manifest
dxt validate manifest.json

# 5. Pack extension
dxt pack . my-extension.dxt

# 6. (Optional) Sign for testing
dxt sign my-extension.dxt --self-signed

# 7. Verify signature
dxt verify my-extension.dxt

# 8. Check extension info
dxt info my-extension.dxt
```

### Production Workflow

```bash
# 1. Pack your extension
dxt pack my-extension/

# 2. Sign with production certificate
dxt sign my-extension.dxt \
  --cert production-cert.pem \
  --key production-key.pem \
  --intermediate intermediate-ca.pem root-ca.pem

# 3. Verify before distribution
dxt verify my-extension.dxt
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

### Custom Exclusions with .dxtignore

You can create a `.dxtignore` file in your extension directory to specify additional files and patterns to exclude during packing. This works similar to `.npmignore` or `.gitignore`:

```
# .dxtignore example
# Comments start with #
*.test.js
src/**/*.test.ts
coverage/
*.log
.env*
temp/
docs/
```

The `.dxtignore` file supports:

- **Exact matches**: `filename.txt`
- **Simple globs**: `*.log`, `temp/*`
- **Directory paths**: `docs/`, `coverage/`
- **Comments**: Lines starting with `#` are ignored
- **Empty lines**: Blank lines are ignored

When a `.dxtignore` file is found, the CLI will display the number of additional patterns being applied. These patterns are combined with the default exclusion list.

## Technical Details

### Signature Format

DXT uses PKCS#7 (Cryptographic Message Syntax) for digital signatures:

- Signatures are stored in DER-encoded PKCS#7 SignedData format
- The signature is appended to the DXT file with markers (`DXT_SIG_V1` and `DXT_SIG_END`)
- The entire DXT content (excluding the signature block) is signed
- Detached signature format - the original ZIP content remains unmodified

### Signature Structure

```
[Original DXT ZIP content]
DXT_SIG_V1
[Base64-encoded PKCS#7 signature]
DXT_SIG_END
```

This approach allows:

- Backward compatibility (unsigned DXT files are valid ZIP files)
- Easy signature verification and removal
- Support for certificate chains with intermediate certificates
