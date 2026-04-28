# Calculator Rust Binary Example

Demonstrates packaging a compiled Rust binary as an MCP Bundle using the `binary` server type. Based on the [official Rust MCP SDK calculator example](https://github.com/modelcontextprotocol/rust-sdk/tree/main/examples/servers).

## What is Binary Server Type?

Unlike `node` or `uv` server types where the source code is bundled and executed by a runtime, the `binary` server type packages a pre-compiled native executable. This is useful for:

- Rust, Go, C/C++ MCP servers
- Performance-sensitive workloads
- Servers with no runtime dependencies

The tradeoff is that binaries are platform-specific — you need a separate build for each target OS/architecture.

## Structure

```
calculator-rust/
├── manifest.json       # server.type = "binary"
├── Cargo.toml          # Rust project
├── .mcpbignore         # Exclude source from bundle
└── src/
    └── main.rs         # Calculator MCP server (~80 LOC)
```

After building, the `server/` directory is created with the compiled binary.

## Building

Requires [Rust](https://rustup.rs/) 1.85+.

```bash
cd examples/calculator-rust
cargo build --release
mkdir -p server
cp target/release/mcp-calculator server/
```

## Packing

```bash
mcpb pack examples/calculator-rust
```

The `.mcpbignore` file excludes source code and build artifacts — only `manifest.json` and `server/mcp-calculator` end up in the bundle.

## Testing

```bash
# MCP protocol handshake
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | ./server/mcp-calculator

# Tool call
(printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n'
printf '{"jsonrpc":"2.0","method":"notifications/initialized"}\n'
printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sum","arguments":{"a":3,"b":4}}}\n'
sleep 1) | ./server/mcp-calculator
```

Expected: `sum(3, 4)` returns `{"text":"7"}`.

## Tools

- **sum** — Calculate the sum of two numbers
- **sub** — Calculate the difference of two numbers

## Notes

- Binary size: ~2.5 MB (stripped, LTO enabled)
- The `Cargo.toml` uses `edition = "2024"` (Rust 1.85+)
- Logs are written to stderr via `tracing`, so they don't interfere with MCP's stdio transport
- Uses the [rmcp](https://crates.io/crates/rmcp) crate (official Rust MCP SDK)
