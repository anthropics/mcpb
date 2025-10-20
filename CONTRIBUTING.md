# Contributing to MCPB

Thank you for your interest in contributing to MCPB! We welcome contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/mcpb.git`
3. Install dependencies: `yarn`
4. Build the project: `yarn build`
5. Run tests: `yarn test`

## Development Workflow

1. Create a new branch for your feature or bugfix: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Run linting: `yarn lint`
4. Run tests to ensure everything passes: `yarn test`
5. Commit your changes with a clear, descriptive commit message (all commits must be signed - see [Commit Signing](#commit-signing))
6. Push to your fork and submit a pull request

## Code Standards

- **TypeScript**: All code should be written in TypeScript with proper type definitions
- **Linting**: Run `yarn lint` before committing. Use `yarn fix` to auto-fix formatting issues
- **Testing**: Add tests for new features and bug fixes
- **Documentation**: Update relevant documentation (README.md, MANIFEST.md, etc.) when adding or changing functionality

## Commit Signing

**All commits must be signed.** This helps verify the authenticity of contributions.

To set up commit signing, see [GitHub's documentation on commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification).

## Pull Request Process

1. Ensure your PR description clearly describes the problem and solution
2. Reference any related issues in your PR description
3. Make sure all tests pass and linting is clean
4. Verify that all commits are signed
5. Update documentation as needed
6. Wait for review from maintainers

## Types of Contributions

### Bug Reports

When filing a bug report, please include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Version information (`mcpb --version`)
- Relevant logs or error messages

### Feature Requests

We welcome feature suggestions! Please:
- Clearly describe the feature and use case
- Explain why this would be valuable to users
- Consider if it aligns with the project's goals

### Code Contributions

We especially welcome:
- Bug fixes
- Documentation improvements
- Test coverage improvements
- New features (please discuss in an issue first for large changes)

## Testing

- Write unit tests for new functionality
- Ensure existing tests still pass
- Test manually with real MCP bundles when applicable

## Questions?

Feel free to open an issue for questions about contributing or the project in general.

## License

By contributing to MCPB, you agree that your contributions will be licensed under the MIT License.
