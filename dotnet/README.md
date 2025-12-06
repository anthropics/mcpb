# MCPB .NET CLI

Experimental .NET port of the MCPB CLI. It mirrors the Node-based tool while layering the Windows-specific metadata required for the Windows On-Device Registry, so you can validate, pack, and sign MCP Bundles directly with the .NET tooling stack.

## Quick Usage

Install the CLI globally and walk through the workflow in a single PowerShell session:

```pwsh
dotnet tool install -g mcpb.cli

# 1. Create a manifest (or edit an existing one)
mcpb init my-extension

# 2. Validate assets and discovered capabilities
mcpb validate --dirname my-extension --discover \
  --user_config api_key=sk-123 \
  --user_config allowed_directories=/srv/data

# 3. Produce the bundle
mcpb pack my-extension --update

# 4. (Optional) Sign and inspect
mcpb sign my-extension.mcpb --self-signed
mcpb info my-extension.mcpb
```

For complete CLI behavior details, see the root-level `CLI.md` guide.

## Command Cheatsheet

| Command                                                                                 | Description                          |
| --------------------------------------------------------------------------------------- | ------------------------------------ |
| `mcpb init [directory] [--server-type node\|python\|binary\|auto] [--entry-point path]` | Create or update `manifest.json`     |
| `mcpb validate [manifest\|directory] [--dirname path] [--discover] [--update] [--verbose]` | Validate manifests and referenced assets |
| `mcpb pack [directory] [output]`                                                        | Create an `.mcpb` archive            |
| `mcpb unpack <file> [outputDir]`                                                        | Extract an archive                   |
| `mcpb sign <file> [--cert cert.pem --key key.pem --self-signed]`                        | Sign the bundle                      |
| `mcpb verify <file>`                                                                    | Verify a signature                   |
| `mcpb info <file>`                                                                      | Show archive & signature metadata    |
| `mcpb unsign <file>`                                                                    | Remove a signature block             |

## Windows `_meta` Updates

When you run `mcpb validate --update` or `mcpb pack --update`, the tool captures the Windows-focused initialize and tools/list responses returned during MCP discovery. The static responses are written to `manifest._meta["com.microsoft.windows"].static_responses` so Windows clients can use cached protocol data without invoking the server. Re-run either command with `--update` whenever you want to refresh those cached responses.

## Validation Modes

- `--discover` runs capability discovery without rewriting the manifest. It exits with a non-zero status if discovered tools or prompts differ from the manifest, which is helpful for CI checks.
- `--verbose` prints each validation step, including the files and locale resources being verified, so you can diagnose failures quickly.

## Need to Build or Contribute?

Development and installation-from-source steps now live in `CONTRIBUTING.md` within this directory. It also points to the repository-wide `../CONTRIBUTING.md` guide for pull request expectations.

## License Compliance

MIT licensed
