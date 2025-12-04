using System.CommandLine;
using System.CommandLine.Parsing;

namespace Mcpb.Tests;

internal static class CommandRunner
{
    public static int Invoke(RootCommand root, string[] args, StringWriter outWriter, StringWriter errWriter)
    {
        var parser = new Parser(root);
        var origOut = Console.Out; var origErr = Console.Error;
        Console.SetOut(outWriter); Console.SetError(errWriter);
        try
        {
            var code = parser.Invoke(args);
            if (Environment.ExitCode != 0 && code == 0)
            {
                code = Environment.ExitCode;
            }
            // Reset Environment.ExitCode to avoid leaking between tests
            Environment.ExitCode = 0;
            return code;
        }
        finally
        {
            Console.SetOut(origOut); Console.SetError(origErr);
        }
    }
}