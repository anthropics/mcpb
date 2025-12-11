using Mcpb.Commands;
using System.CommandLine;

var root = CliRoot.Build();
var invokeResult = await root.InvokeAsync(args);
if (Environment.ExitCode != 0 && invokeResult == 0)
	return Environment.ExitCode;
return invokeResult;
