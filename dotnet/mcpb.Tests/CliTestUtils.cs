using System.Diagnostics;
using System.Text;

namespace Mcpb.Tests;

internal static class CliTestUtils
{
    private static readonly string ProjectPath = ResolveProjectPath();

    private static string ResolveProjectPath()
    {
        // AppContext.BaseDirectory -> .../dotnet/mcpb.Tests/bin/Debug/net8.0/
        var baseDir = AppContext.BaseDirectory;
        var proj = Path.GetFullPath(Path.Combine(baseDir, "..","..","..","..","mcpb","mcpb.csproj"));
        return proj;
    }

    public static (int exitCode,string stdout,string stderr) Run(string workingDir, params string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "dotnet",
            WorkingDirectory = workingDir,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            RedirectStandardInput = false,
            UseShellExecute = false
        };
        psi.ArgumentList.Add("run");
        psi.ArgumentList.Add("--project");
        psi.ArgumentList.Add(ProjectPath);
        psi.ArgumentList.Add("--");
        foreach (var a in args) psi.ArgumentList.Add(a);
        var p = Process.Start(psi)!;
        // Synchronous capture avoids potential race with async event handlers finishing after exit.
        var stdout = p.StandardOutput.ReadToEnd();
        var stderr = p.StandardError.ReadToEnd();
        p.WaitForExit();
        return (p.ExitCode, stdout, stderr);
    }

    // Escape no longer needed with ArgumentList; keep method if future tests rely on it.
    private static string Escape(string s) => s;
}
