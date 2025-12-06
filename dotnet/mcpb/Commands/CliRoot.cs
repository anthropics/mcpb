using System.CommandLine;

namespace Mcpb.Commands;

public static class CliRoot
{
    public static RootCommand Build()
    {
        var root = new RootCommand("Tools for building MCP Bundles (.mcpb)");
        root.AddCommand(InitCommand.Create());
        root.AddCommand(ValidateCommand.Create());
        root.AddCommand(PackCommand.Create());
        root.AddCommand(UnpackCommand.Create());
        root.AddCommand(SignCommand.Create());
        root.AddCommand(VerifyCommand.Create());
        root.AddCommand(InfoCommand.Create());
        root.AddCommand(UnsignCommand.Create());
        return root;
    }
}