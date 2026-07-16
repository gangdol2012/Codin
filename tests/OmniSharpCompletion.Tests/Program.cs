using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;
using Microsoft.Extensions.Logging;
using OmniSharp.Models.v1.Completion;
using OmniSharp.Options;
using CompletionItem = OmniSharp.Models.v1.Completion.CompletionItem;

var benchmark = args.Contains("--benchmark", StringComparer.Ordinal);
var iterations = ReadIterations(args, defaultValue: 20);

try
{
    if (benchmark)
    {
        await RunBenchmarksAsync(iterations);
    }
    else
    {
        await RunRegressionTestsAsync();
    }

    return 0;
}
catch (Exception exception)
{
    Console.Error.WriteLine(exception);
    return 1;
}

static int ReadIterations(string[] arguments, int defaultValue)
{
    var optionIndex = Array.IndexOf(arguments, "--iterations");
    if (optionIndex < 0)
    {
        return defaultValue;
    }

    if (optionIndex + 1 >= arguments.Length ||
        !int.TryParse(arguments[optionIndex + 1], out var iterations) ||
        iterations < 1)
    {
        throw new ArgumentException("--iterations requires a positive integer.");
    }

    return iterations;
}

static async Task RunRegressionTestsAsync()
{
    using var fixture = CompletionFixture.Create();
    var tests = new (string Name, Func<Task> Run)[]
    {
        ("typed C contains Console", async () =>
        {
            var result = await fixture.CompleteAsync(
                "using System; class Demo { void M() { C<|> } }");
            var console = AssertEx.Item(result.Response, "Console");
            AssertEx.Equal(CompletionItemKind.Class, console.Kind, "Console completion kind");
            AssertEx.Equal("Console", console.TextEdit?.NewText, "Console insertion text");
        }),
        ("Console dot contains WriteLine", async () =>
        {
            var result = await fixture.CompleteAsync(
                "using System; class Demo { void M() { Console.<|> } }");
            var writeLine = AssertEx.Item(result.Response, "WriteLine");
            AssertEx.Equal(CompletionItemKind.Method, writeLine.Kind, "WriteLine completion kind");
            AssertEx.Equal("WriteLine", writeLine.TextEdit?.NewText, "WriteLine insertion text");
        }),
        ("Console.W contains WriteLine", async () =>
        {
            var result = await fixture.CompleteAsync(
                "using System; class Demo { void M() { Console.W<|> } }");
            AssertEx.Item(result.Response, "WriteLine");
        }),
        ("string instance contains Length", async () =>
        {
            var result = await fixture.CompleteAsync(
                "class Demo { void M() { string text = \"\"; text.<|> } }");
            var length = AssertEx.Item(result.Response, "Length");
            AssertEx.Equal(CompletionItemKind.Property, length.Kind, "string.Length completion kind");
        }),
        ("comments and strings do not offer C# symbol completions", async () =>
        {
            var comment = await fixture.CompleteAsync(
                "class Demo { void M() { // Con<|>\n } }");
            var literal = await fixture.CompleteAsync(
                "class Demo { void M() { var text = \"Con<|>\"; } }");

            AssertEx.False(
                comment.Response.Items.Any(item => item.Label == "Console"),
                "Console must not be suggested inside a comment.");
            AssertEx.False(
                literal.Response.Items.Any(item => item.Label == "Console"),
                "Console must not be suggested inside a string literal.");
        }),
        ("multi-file project symbols are visible", async () =>
        {
            var result = await fixture.CompleteAsync(
                "class Consumer { void M() { ProjectType value = new(); value.<|> } }",
                new OmniSharpProject.SourceFileSnapshot(
                    "src/ProjectType.cs",
                    "public class ProjectType { public int VisibleMember { get; set; } public void Work() { } }"));

            AssertEx.Item(result.Response, "VisibleMember");
            AssertEx.Item(result.Response, "Work");
        }),
        ("response fields and ordering are deterministic", async () =>
        {
            const string source = "using System; class Demo { void M() { Console.<|> } }";
            var first = await fixture.CompleteAsync(source);
            var second = await fixture.CompleteAsync(source);

            AssertResponseInvariants(first.Response);
            AssertResponseInvariants(second.Response);
            AssertResponseParity(first.Response, second.Response);
        }),
        ("completion resolve supplies documentation", async () =>
        {
            var completion = await fixture.CompleteAsync(
                "using System; class Demo { void M() { Console.<|> } }");
            var writeLine = AssertEx.Item(completion.Response, "WriteLine");
            var resolved = await fixture.Service.Handle(
                new CompletionResolveRequest { Item = writeLine },
                completion.Document);

            var resolvedItem = AssertEx.NotNull(resolved.Item, "Resolved completion item");
            AssertEx.False(
                string.IsNullOrWhiteSpace(resolvedItem.Documentation),
                "Resolved WriteLine documentation should not be empty.");
        }),
        ("keyed completion resolve keeps speculative lists isolated", async () =>
        {
            var consoleCompletion = await fixture.CompleteAsync(
                "using System; class Demo { void M() { Console.<|> } }",
                completionListKey: "console-list");
            var writeLine = AssertEx.Item(consoleCompletion.Response, "WriteLine");

            var stringCompletion = await fixture.CompleteAsync(
                "class Demo { void M() { string text = \"\"; text.<|> } }",
                completionListKey: "string-list");
            var length = AssertEx.Item(stringCompletion.Response, "Length");

            var resolvedConsole = await fixture.Service.Handle(
                new CompletionResolveRequest { Item = writeLine },
                stringCompletion.Document,
                "console-list");
            var resolvedString = await fixture.Service.Handle(
                new CompletionResolveRequest { Item = length },
                consoleCompletion.Document,
                "string-list");

            var resolvedConsoleItem = AssertEx.NotNull(resolvedConsole.Item, "Keyed WriteLine resolve item");
            var resolvedStringItem = AssertEx.NotNull(resolvedString.Item, "Keyed Length resolve item");
            AssertEx.False(
                string.IsNullOrWhiteSpace(resolvedConsoleItem.Documentation),
                "Keyed WriteLine resolve should use the Console completion list.");
            AssertEx.False(
                string.IsNullOrWhiteSpace(resolvedStringItem.Documentation),
                "Keyed Length resolve should use the string completion list.");
        }),
        ("exact project snapshots are no-ops and changed files stay incremental", async () =>
        {
            const string markedSource =
                "class Consumer { void M() { ProjectType value = new(); value.<|> } }";
            var source = CompletionFixture.RemoveCursor(markedSource).Source;
            var firstFiles = new[]
            {
                new OmniSharpProject.SourceFileSnapshot(
                    "src/ProjectType.cs",
                    "public class ProjectType { public int FirstMember { get; set; } }")
            };

            var firstDocument = await fixture.Project.UpdateProjectDocumentsAsync(source, HarnessConstants.PrimaryPath, firstFiles);
            var firstSolution = firstDocument.Project.Solution;
            var firstAdditionalId = FindDocument(firstSolution, "src/ProjectType.cs").Id;

            var identicalDocument = await fixture.Project.UpdateProjectDocumentsAsync(source, HarnessConstants.PrimaryPath, firstFiles);
            AssertEx.Same(
                firstSolution,
                identicalDocument.Project.Solution,
                "An exact project snapshot should reuse the current Roslyn Solution.");
            AssertEx.Equal(
                firstAdditionalId,
                FindDocument(identicalDocument.Project.Solution, "src/ProjectType.cs").Id,
                "An exact project snapshot should preserve additional DocumentId values.");

            var changedFiles = new[]
            {
                new OmniSharpProject.SourceFileSnapshot(
                    "src/ProjectType.cs",
                    "public class ProjectType { public int SecondMember { get; set; } }")
            };
            var changedDocument = await fixture.Project.UpdateProjectDocumentsAsync(source, HarnessConstants.PrimaryPath, changedFiles);
            AssertEx.NotSame(
                firstSolution,
                changedDocument.Project.Solution,
                "Changing an additional file should produce a new Roslyn Solution.");
            AssertEx.Equal(
                firstAdditionalId,
                FindDocument(changedDocument.Project.Solution, "src/ProjectType.cs").Id,
                "Changing file content should preserve its DocumentId.");

            var changedCompletion = await fixture.CompleteAsync(markedSource, changedFiles);
            AssertEx.Item(changedCompletion.Response, "SecondMember");
            AssertEx.False(
                changedCompletion.Response.Items.Any(item => item.Label == "FirstMember"),
                "A stale member from the previous file snapshot must not remain visible.");
        }),
    };

    var stopwatch = Stopwatch.StartNew();
    var failures = new List<(string Name, Exception Error)>();
    foreach (var test in tests)
    {
        try
        {
            await test.Run();
            Console.WriteLine($"PASS {test.Name}");
        }
        catch (Exception exception)
        {
            failures.Add((test.Name, exception));
            Console.WriteLine($"FAIL {test.Name}");
            Console.WriteLine($"     {exception.Message}");
        }
    }

    stopwatch.Stop();
    Console.WriteLine();
    Console.WriteLine($"{tests.Length - failures.Count}/{tests.Length} completion regressions passed in {stopwatch.Elapsed.TotalSeconds:F2}s.");

    if (failures.Count > 0)
    {
        throw new RegressionFailureException(
            string.Join(Environment.NewLine, failures.Select(failure => $"{failure.Name}: {failure.Error}")));
    }
}

static Document FindDocument(Solution solution, string path)
{
    return solution.Projects
        .SelectMany(project => project.Documents)
        .Single(document => string.Equals(document.FilePath, path, StringComparison.Ordinal));
}

static void AssertResponseInvariants(CompletionResponse response)
{
    AssertEx.True(response.Items.Count > 0, "The parity response should contain completion items.");
    var seenData = new HashSet<int>();

    foreach (var item in response.Items)
    {
        AssertEx.False(string.IsNullOrWhiteSpace(item.Label), "Every completion item needs a label.");
        var textEdit = AssertEx.NotNull(item.TextEdit, $"{item.Label} text edit");
        AssertEx.False(string.IsNullOrWhiteSpace(textEdit.NewText), $"{item.Label} needs insertion text.");
        AssertEx.True(textEdit.StartLine >= 0, $"{item.Label} start line must be non-negative.");
        AssertEx.True(textEdit.StartColumn >= 0, $"{item.Label} start column must be non-negative.");
        AssertEx.True(textEdit.EndLine >= textEdit.StartLine, $"{item.Label} edit line range is reversed.");
        if (textEdit.EndLine == textEdit.StartLine)
        {
            AssertEx.True(textEdit.EndColumn >= textEdit.StartColumn, $"{item.Label} edit column range is reversed.");
        }

        AssertEx.True(item.Data >= 0, $"{item.Label} resolve data must be non-negative.");
        AssertEx.True(seenData.Add(item.Data), $"Duplicate resolve data index {item.Data}.");
    }
}

static void AssertResponseParity(CompletionResponse expected, CompletionResponse actual)
{
    AssertEx.Equal(expected.IsIncomplete, actual.IsIncomplete, "Completion IsIncomplete parity");
    AssertEx.Equal(expected.Items.Count, actual.Items.Count, "Completion item count parity");

    for (var index = 0; index < expected.Items.Count; index++)
    {
        var expectedJson = CompletionFixture.Serialize(expected.Items[index]);
        var actualJson = CompletionFixture.Serialize(actual.Items[index]);
        if (!string.Equals(expectedJson, actualJson, StringComparison.Ordinal))
        {
            throw new RegressionFailureException(
                $"Completion field/order parity failed at index {index} " +
                $"('{expected.Items[index].Label}' vs '{actual.Items[index].Label}')." +
                Environment.NewLine +
                $"Expected: {expectedJson}" + Environment.NewLine +
                $"Actual:   {actualJson}");
        }
    }
}

static async Task RunBenchmarksAsync(int iterations)
{
    using var fixture = CompletionFixture.Create();
    var scenarios = new[]
    {
        new BenchmarkScenario(
            "prefix-C",
            "using System; class Demo { void M() { C<|> } }",
            "Console"),
        new BenchmarkScenario(
            "Console-dot",
            "using System; class Demo { void M() { Console.<|> } }",
            "WriteLine"),
        new BenchmarkScenario(
            "Console-W",
            "using System; class Demo { void M() { Console.W<|> } }",
            "WriteLine"),
        new BenchmarkScenario(
            "string-dot",
            "class Demo { void M() { string text = \"\"; text.<|> } }",
            "Length"),
    };

    Console.WriteLine($"OmniSharp completion benchmark (.NET {Environment.Version}, {iterations} warm samples)");
    Console.WriteLine("Times include project snapshot update, completion materialization, and JSON serialization.");
    Console.WriteLine();
    Console.WriteLine($"{"scenario",-14} {"cold ms",10} {"p50 ms",10} {"p95 ms",10} {"items",9} {"JSON bytes",13}");

    foreach (var scenario in scenarios)
    {
        var cold = await fixture.ProbeAsync(scenario.Source);
        AssertEx.Item(cold.Response, scenario.ExpectedLabel);

        await fixture.ProbeAsync(scenario.Source);
        var warm = new List<double>(iterations);
        CompletionProbe? last = null;
        for (var iteration = 0; iteration < iterations; iteration++)
        {
            last = await fixture.ProbeAsync(scenario.Source);
            warm.Add(last.Elapsed.TotalMilliseconds);
        }

        warm.Sort();
        var p50 = Percentile(warm, 0.50);
        var p95 = Percentile(warm, 0.95);
        Console.WriteLine(
            $"{scenario.Name,-14} " +
            $"{cold.Elapsed.TotalMilliseconds,10:F2} " +
            $"{p50,10:F2} " +
            $"{p95,10:F2} " +
            $"{last!.Response.Items.Count,9:N0} " +
            $"{last.SerializedBytes,13:N0}");
    }
}

static double Percentile(IReadOnlyList<double> sortedSamples, double percentile)
{
    var index = Math.Clamp((int)Math.Ceiling(sortedSamples.Count * percentile) - 1, 0, sortedSamples.Count - 1);
    return sortedSamples[index];
}

internal sealed class CompletionFixture : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly AdhocWorkspace _workspace;
    private readonly ILoggerFactory _loggerFactory;

    private CompletionFixture(
        AdhocWorkspace workspace,
        ILoggerFactory loggerFactory,
        OmniSharpProject project,
        OmniSharpCompletionService service)
    {
        _workspace = workspace;
        _loggerFactory = loggerFactory;
        Project = project;
        Service = service;
    }

    public OmniSharpProject Project { get; }
    public OmniSharpCompletionService Service { get; }

    public static CompletionFixture Create()
    {
        var featureAssemblies = new[]
        {
            Assembly.Load("Microsoft.CodeAnalysis.Features"),
            Assembly.Load("Microsoft.CodeAnalysis.CSharp.Features"),
        };
        var host = MefHostServices.Create(MefHostServices.DefaultAssemblies
            .Concat(featureAssemblies)
            .Distinct());
        var workspace = new AdhocWorkspace(host);

        var references = ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")
                ?? throw new InvalidOperationException("The .NET trusted platform assembly list is unavailable."))
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Distinct(StringComparer.Ordinal)
            .Select(path => MetadataReference.CreateFromFile(path));
        var projectInfo = ProjectInfo.Create(
            ProjectId.CreateNewId(),
            VersionStamp.Create(),
            "OmniSharpCompletionRegression",
            "OmniSharpCompletionRegression",
            LanguageNames.CSharp,
            parseOptions: CSharpParseOptions.Default
                .WithKind(SourceCodeKind.Regular)
                .WithLanguageVersion(LanguageVersion.Preview),
            compilationOptions: new CSharpCompilationOptions(
                OutputKind.ConsoleApplication,
                concurrentBuild: false,
                optimizationLevel: OptimizationLevel.Debug),
            metadataReferences: references);
        var roslynProject = workspace.AddProject(projectInfo);
        var primaryDocument = workspace.AddDocument(
            roslynProject.Id,
            "Program.cs",
            SourceText.From(string.Empty));
        var project = new OmniSharpProject("https://unused.invalid/")
        {
            Workspace = workspace,
            UseOnlyOnceDocument = primaryDocument,
            DocumentId = primaryDocument.Id,
        };
        var loggerFactory = LoggerFactory.Create(_ => { });
        var service = new OmniSharpCompletionService(
            workspace,
            new FormattingOptions(),
            loggerFactory);

        return new CompletionFixture(workspace, loggerFactory, project, service);
    }

    public async Task<CompletionProbe> CompleteAsync(
        string markedSource,
        params OmniSharpProject.SourceFileSnapshot[] files)
    {
        return await ProbeAsync(markedSource, files, completionListKey: null);
    }

    public async Task<CompletionProbe> CompleteAsync(
        string markedSource,
        string completionListKey)
    {
        return await ProbeAsync(markedSource, Array.Empty<OmniSharpProject.SourceFileSnapshot>(), completionListKey);
    }

    public async Task<CompletionProbe> CompleteAsync(
        string markedSource,
        OmniSharpProject.SourceFileSnapshot[] files,
        string? completionListKey = null)
    {
        return await ProbeAsync(markedSource, files, completionListKey);
    }

    public async Task<CompletionProbe> ProbeAsync(
        string markedSource,
        OmniSharpProject.SourceFileSnapshot[]? files = null,
        string? completionListKey = null)
    {
        var (source, cursorOffset) = RemoveCursor(markedSource);
        var started = Stopwatch.GetTimestamp();
        var document = await Project.UpdateProjectDocumentsAsync(
            source,
            HarnessConstants.PrimaryPath,
            files ?? Array.Empty<OmniSharpProject.SourceFileSnapshot>());
        var sourceText = await document.GetTextAsync();
        var cursor = sourceText.Lines.GetLinePosition(cursorOffset);
        var request = new CompletionRequest
        {
            FileName = HarnessConstants.PrimaryPath,
            Line = cursor.Line,
            Column = cursor.Character,
            CompletionTrigger = CompletionTriggerKind.Invoked,
        };
        var response = await Service.Handle(request, document, completionListKey);
        var serializedBytes = JsonSerializer.SerializeToUtf8Bytes(
            new CompletionEnvelope(response, "GetCompletionAsync"),
            JsonOptions).Length;
        var elapsed = Stopwatch.GetElapsedTime(started);

        return new CompletionProbe(response, document, elapsed, serializedBytes);
    }

    public static (string Source, int CursorOffset) RemoveCursor(string markedSource)
    {
        var cursorOffset = markedSource.IndexOf(HarnessConstants.CursorMarker, StringComparison.Ordinal);
        if (cursorOffset < 0 ||
            markedSource.IndexOf(
                HarnessConstants.CursorMarker,
                cursorOffset + HarnessConstants.CursorMarker.Length,
                StringComparison.Ordinal) >= 0)
        {
            throw new ArgumentException(
                $"Completion source must contain exactly one '{HarnessConstants.CursorMarker}' marker.");
        }

        return (markedSource.Remove(cursorOffset, HarnessConstants.CursorMarker.Length), cursorOffset);
    }

    public static string Serialize(object value)
    {
        return JsonSerializer.Serialize(value, JsonOptions);
    }

    public void Dispose()
    {
        _loggerFactory.Dispose();
        _workspace.Dispose();
    }

    private sealed record CompletionEnvelope(CompletionResponse Payload, string Type);
}

internal static class AssertEx
{
    public static CompletionItem Item(CompletionResponse response, string label)
    {
        var item = response.Items.FirstOrDefault(candidate =>
            string.Equals(candidate.Label, label, StringComparison.Ordinal));
        return item ?? throw new RegressionFailureException(
            $"Expected completion '{label}'. Got {response.Items.Count:N0} items; " +
            $"sample: {string.Join(", ", response.Items.Take(20).Select(candidate => candidate.Label))}");
    }

    public static void True(bool condition, string message)
    {
        if (!condition)
        {
            throw new RegressionFailureException(message);
        }
    }

    public static void False(bool condition, string message)
    {
        True(!condition, message);
    }

    public static T NotNull<T>(T? value, string message) where T : class
    {
        return value ?? throw new RegressionFailureException($"{message} should not be null.");
    }

    public static void Equal<T>(T expected, T actual, string message)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new RegressionFailureException($"{message}: expected '{expected}', got '{actual}'.");
        }
    }

    public static void Same(object expected, object actual, string message)
    {
        if (!ReferenceEquals(expected, actual))
        {
            throw new RegressionFailureException(message);
        }
    }

    public static void NotSame(object expected, object actual, string message)
    {
        if (ReferenceEquals(expected, actual))
        {
            throw new RegressionFailureException(message);
        }
    }
}

internal sealed class RegressionFailureException : Exception
{
    public RegressionFailureException(string message) : base(message)
    {
    }
}

internal sealed record CompletionProbe(
    CompletionResponse Response,
    Document Document,
    TimeSpan Elapsed,
    int SerializedBytes);

internal sealed record BenchmarkScenario(string Name, string Source, string ExpectedLabel);

internal static class HarnessConstants
{
    public const string CursorMarker = "<|>";
    public const string PrimaryPath = "src/Program.cs";
}
