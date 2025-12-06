# Contributing to the MCPB .NET CLI

Before submitting changes, read the repository-wide `../CONTRIBUTING.md` for coding standards and pull request expectations. The notes below capture .NET-specific workflows for building, testing, and installing the CLI locally.

## Prerequisites

- .NET 8 SDK
- PowerShell (the examples use `pwsh` syntax)

## Build from Source

```pwsh
cd dotnet/mcpb
dotnet build -c Release
```

Use `dotnet test mcpb.slnx` from the `dotnet` folder to run the full test suite.

## Install as a Local Tool

When iterating locally you can pack the CLI and install it from the generated `.nupkg` instead of a public feed:

```pwsh
cd dotnet/mcpb
dotnet pack -c Release
# Find generated nupkg in bin/Release
dotnet tool install --global Mcpb.Cli --add-source ./bin/Release
```

If you already have the tool installed, update it in place:

```pwsh
dotnet tool update --global Mcpb.Cli --add-source ./bin/Release
```

## Working on Documentation

The cross-platform CLI behavior is described in the root-level `CLI.md`. When you update .NET-specific behaviors or options, mirror those edits in that document (and any relevant tests) so the Node and .NET toolchains stay aligned.
