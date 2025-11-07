using Xunit;

[assembly: CollectionBehavior(DisableTestParallelization = true)]
// Allow accessing internal helpers for validation
[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("mcpb.Tests")]
