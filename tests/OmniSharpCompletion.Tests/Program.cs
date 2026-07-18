using System.Collections.Immutable;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;
using Microsoft.Extensions.Logging;
using OmniSharp.Models;
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
        ("comments and strings suppress symbol completions", async () =>
        {
            var comment = await fixture.CompleteAsync(
                "class Demo { void M() { // Con<|>\n } }");
            var literal = await fixture.CompleteAsync(
                "class Demo { void M() { var text = \"Con<|>\"; } }");

            AssertEx.DoesNotContain(comment.Response, "Console");
            AssertEx.DoesNotContain(literal.Response, "Console");
        }),
        ("multi-file public members are visible and inaccessible members stay hidden", async () =>
        {
            var result = await fixture.CompleteAsync(
                "using Library; class Consumer { void M() { Widget value = new(); value.<|> } }",
                new OmniSharpProject.SourceFileSnapshot(
                    "src/Widget.cs",
                    "namespace Library; public class Widget { public int VisibleMember { get; set; } internal int InternalMember; protected int ProtectedMember; private int HiddenMember; public void Work() { } }"));

            AssertEx.Item(result.Response, "VisibleMember");
            AssertEx.Item(result.Response, "InternalMember");
            AssertEx.Item(result.Response, "Work");
            AssertEx.DoesNotContain(result.Response, "ProtectedMember");
            AssertEx.DoesNotContain(result.Response, "HiddenMember");
        }),
        ("cross-file references and rename retain every document path", async () =>
        {
            using var semanticFixture = CompletionFixture.Create();
            var monacoService = semanticFixture.CreateMonacoService();
            typeof(MonacoService).GetField(
                    "_diagnosticProject",
                    BindingFlags.Instance | BindingFlags.NonPublic)!
                .SetValue(monacoService, semanticFixture.Project);

            const string source = """
                public class Demo
                {
                    public int Value;
                    public int Read() => Value;
                }
                """;
            const string other = """
                public class Other
                {
                    public int Read(Demo demo) => demo.Value;
                }
                """;
            var projectRequest = CompletionFixture.Serialize(new
            {
                CurrentPath = HarnessConstants.PrimaryPath,
                Files = new[] { new { Path = "Other.cs", Content = other } },
            });
            _ = await monacoService.SyncDiagnosticProjectAsync(
                source,
                projectRequest,
                "cross-file-semantic-revision");

            var offset = source.LastIndexOf("Value", StringComparison.Ordinal) + 2;
            var position = SourceText.From(source).Lines.GetLinePosition(offset);
            var positionRequest = CompletionFixture.Serialize(new
            {
                Line = position.Line,
                Column = position.Character,
            });

            using var references = JsonDocument.Parse(await monacoService.GetReferencesAsync(
                source,
                positionRequest,
                "true"));
            var referenceItems = references.RootElement.GetProperty("payload");
            AssertEx.True(
                referenceItems.GetArrayLength() >= 3,
                "Cross-file references must include the declaration and both uses.");
            AssertEx.True(
                referenceItems.EnumerateArray().Select(item => item.GetProperty("path").GetString())
                    .Distinct(StringComparer.Ordinal).Count() >= 2,
                "Cross-file references must retain distinct document paths.");

            using var renameInfo = JsonDocument.Parse(await monacoService.GetRenameInfoAsync(
                source,
                positionRequest));
            AssertEx.True(
                renameInfo.RootElement.GetProperty("payload").GetProperty("canRename").GetBoolean(),
                "The field reference should be renameable.");

            using var rename = JsonDocument.Parse(await monacoService.GetRenameEditsAsync(
                source,
                positionRequest,
                "Amount"));
            var renameItems = rename.RootElement.GetProperty("payload").GetProperty("edits");
            AssertEx.True(
                renameItems.GetArrayLength() >= 3,
                $"Cross-file rename must include the declaration and both uses: {renameItems.GetRawText()}");
            AssertEx.True(
                renameItems.EnumerateArray().Select(item => item.GetProperty("path").GetString())
                    .Distinct(StringComparer.Ordinal).Count() >= 2,
                "Cross-file rename must retain distinct document paths.");
        }),
        ("protected and private accessibility is preserved in declaring contexts", async () =>
        {
            var derived = await fixture.CompleteAsync(
                "class Base { protected int ProtectedMember; private int BaseSecret; } class Derived : Base { private int OwnSecret; void M() { this.<|> } }");

            AssertEx.Item(derived.Response, "ProtectedMember");
            AssertEx.Item(derived.Response, "OwnSecret");
            AssertEx.DoesNotContain(derived.Response, "BaseSecret");
        }),
        ("static member completion excludes instance-only members", async () =>
        {
            var result = await fixture.CompleteAsync(
                "class Widget { public static int SharedMember; public int InstanceMember; } class Consumer { void M() { Widget.<|> } }");

            AssertEx.Item(result.Response, "SharedMember");
            AssertEx.DoesNotContain(result.Response, "InstanceMember");
        }),
        ("response fields and ordering are deterministic", async () =>
        {
            const string source = "using System; class Demo { void M() { Console.<|> } }";
            var first = await fixture.CompleteAsync(source);
            var second = await fixture.CompleteAsync(source);

            AssertResponseInvariants(first.Response);
            AssertResponseInvariants(second.Response);
            AssertResponseParity(first.Response, second.Response, "repeat completion");
        }),
        ("compact response round-trips every real completion field", async () =>
        {
            var completion = await fixture.CompleteAsync(
                "using System; class Demo { void M() { Console.<|> } }");
            var compact = fixture.Service.Compact(completion.Response);
            var expanded = CompactCompletionCodec.ExpandThroughJson(compact);

            AssertResponseParity(completion.Response, expanded, "real compact completion");
            AssertEx.True(
                completion.CompactSerializedBytes < completion.FullSerializedBytes,
                "The compact payload should be smaller than the normal completion envelope payload.");
        }),
        ("compact response preserves exceptional ranges, edits, snippets, data, and commit sets", () =>
        {
            var source = CompletionSamples.CreateFieldCoverageResponse();
            var compact = fixture.Service.Compact(source);
            var expanded = CompactCompletionCodec.ExpandThroughJson(compact);

            AssertResponseParity(source, expanded, "crafted compact completion");
            AssertEx.Equal(2, compact.CommitCharacterSets.Length, "deduplicated commit-character set count");
            AssertEx.Equal(
                compact.Items[0][11],
                compact.Items[2][11],
                "identical commit-character sets should share one table index");
            return Task.CompletedTask;
        }),
        ("empty compact response retains incompleteness", () =>
        {
            var source = new CompletionResponse
            {
                IsIncomplete = true,
                Items = ImmutableArray<CompletionItem>.Empty,
            };
            var expanded = CompactCompletionCodec.ExpandThroughJson(fixture.Service.Compact(source));

            AssertEx.True(expanded.IsIncomplete, "Empty compact response IsIncomplete flag");
            AssertEx.Equal(0, expanded.Items.Count, "Empty compact response item count");
            return Task.CompletedTask;
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
        ("keyed resolve keeps interleaved speculative lists isolated", async () =>
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

            AssertEx.False(
                string.IsNullOrWhiteSpace(AssertEx.NotNull(resolvedConsole.Item, "Keyed WriteLine item").Documentation),
                "Keyed WriteLine resolve should use the Console completion list.");
            AssertEx.False(
                string.IsNullOrWhiteSpace(AssertEx.NotNull(resolvedString.Item, "Keyed Length item").Documentation),
                "Keyed Length resolve should use the string completion list.");
        }),
        ("keyed refilter preserves raw indices and evicts the oldest completion list", async () =>
        {
            const string oldestKey = "refilter-oldest";
            const string source = "using System; class Demo { void M() { Con<|> } }";
            var oldestCompletion = await fixture.CompleteAsync(source, oldestKey);
            var console = AssertEx.Item(oldestCompletion.Response, "Console");
            var consoleRawIndex = Convert.ToInt32(console.Data);
            var filtered = fixture.Service.Refilter(oldestKey, "Console");

            AssertEx.True(filtered.Success, "A live keyed completion list should refilter successfully.");
            AssertEx.True(
                filtered.PreselectedIndices.Contains(consoleRawIndex),
                "Refilter must return the raw Roslyn index stored in CompletionItem.Data.");

            string newestKey = string.Empty;
            for (var index = 0; index < 19; index++)
            {
                newestKey = $"refilter-fill-{index}";
                _ = await fixture.CompleteAsync(source, newestKey);
            }

            AssertEx.False(
                fixture.Service.Refilter(oldestKey, "Console").Success,
                "The bounded keyed-list cache should evict its oldest entry.");
            AssertEx.True(
                fixture.Service.Refilter(newestKey, "Console").Success,
                "Eviction must retain the newest keyed completion list.");
        }),
        ("keyed completion cache matches browser capacity and refreshes LRU entries", async () =>
        {
            const string source = "using System; class Demo { void M() { Con<|> } }";
            var keys = Enumerable.Range(0, 19)
                .Select(index => $"lru-list-{index}")
                .ToArray();
            foreach (var key in keys)
            {
                _ = await fixture.CompleteAsync(source, key);
            }

            for (var touch = 0; touch < 12; touch++)
            {
                AssertEx.True(
                    fixture.Service.Refilter(keys[0], "Console").Success,
                    "Repeated active-popup access should keep the touched completion list live.");
            }
            AssertEx.True(
                fixture.Service.Refilter(keys[1], "Console").Success,
                "Repeatedly touching one entry must not consume slots for the full browser-addressable set.");

            _ = await fixture.CompleteAsync(source, "lru-list-newest");

            AssertEx.True(
                fixture.Service.Refilter(keys[0], "Console").Success,
                "Refiltering a list should refresh its LRU position.");
            AssertEx.False(
                fixture.Service.Refilter(keys[2], "Console").Success,
                "Adding a twentieth list should evict the least recently used entry.");
            AssertEx.True(
                fixture.Service.Refilter("lru-list-newest", "Console").Success,
                "The newest keyed list should remain available for resolve and refilter.");

            fixture.Service.ReconcileCompletionLists(new[] { keys[0], "lru-list-newest" });
            AssertEx.True(
                fixture.Service.Refilter(keys[0], "Console").Success,
                "Live-key reconciliation should retain browser-addressable completion state.");
            AssertEx.True(
                fixture.Service.Refilter("lru-list-newest", "Console").Success,
                "Live-key reconciliation should retain the active newest completion state.");
            AssertEx.False(
                fixture.Service.Refilter(keys[1], "Console").Success,
                "Live-key reconciliation should release worker state the browser cannot address.");
        }),
        ("published reference pack is exact, isolated, and compiler-complete", async () =>
        {
            var published = PublishedReferencePack.Load();
            var expectedInitialReferences = new[]
            {
                "System.Runtime",
                "System.Collections",
                "System.Console",
                "System.Linq",
                "System.Net.Http",
                "System.Threading.Tasks",
                "netstandard",
            };

            AssertEx.True(
                published.ManifestAssemblies.SequenceEqual(
                    published.ManifestAssemblies.OrderBy(name => name, StringComparer.Ordinal),
                    StringComparer.Ordinal),
                "Reference-pack manifest assembly names should be ordinally sorted.");
            AssertEx.False(
                System.IO.Directory.Exists(published.Directory),
                "The publish output must not retain the loose ./_framework/ref staging directory.");
            AssertEx.True(
                expectedInitialReferences.All(published.ManifestAssemblies.Contains),
                "The static reference pack must contain every eager compiler reference.");
            AssertEx.True(
                published.ManifestAssemblies.Count >= 150,
                "The published Microsoft.NETCore.App.Ref pack is unexpectedly incomplete.");
            AssertEx.True(
                published.ManifestAssemblies.SequenceEqual(
                    published.AssemblyReferences.Keys.OrderBy(name => name, StringComparer.Ordinal),
                    StringComparer.Ordinal),
                "Every published reference assembly must have one dependency-graph entry.");

            var manifestSet = new HashSet<string>(published.ManifestAssemblies, StringComparer.Ordinal);
            foreach (var (assemblyName, dependencies) in published.AssemblyReferences)
            {
                AssertEx.True(
                    dependencies.SequenceEqual(
                        dependencies.OrderBy(name => name, StringComparer.Ordinal),
                        StringComparer.Ordinal),
                    $"Dependency edges for '{assemblyName}' should be deterministic.");
                AssertEx.True(
                    dependencies.All(manifestSet.Contains),
                    $"Dependency edges for '{assemblyName}' must stay inside the static reference pack.");
            }

            foreach (var (namespaceName, closure) in published.Namespaces)
            {
                AssertEx.True(
                    closure.SequenceEqual(
                        closure.OrderBy(name => name, StringComparer.Ordinal),
                        StringComparer.Ordinal),
                    $"Namespace closure for '{namespaceName}' should be deterministic.");
                var closureSet = new HashSet<string>(closure, StringComparer.Ordinal);
                AssertEx.True(
                    closureSet.All(manifestSet.Contains),
                    $"Namespace closure for '{namespaceName}' must stay inside the static reference pack.");
                AssertEx.True(
                    closureSet.All(assemblyName =>
                        published.AssemblyReferences[assemblyName].All(closureSet.Contains)),
                    $"Namespace closure for '{namespaceName}' is not transitively closed.");
            }

            AssertEx.True(
                published.Namespaces["System.Net.Http"].Contains("Microsoft.Win32.Primitives"),
                "System.Net.Http closure must retain its non-System transitive dependency.");
            var findAssemblyNames = typeof(OmniSharpProject).GetMethod(
                "FindAssemblyNames",
                BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException("OmniSharp namespace resolver is unavailable.");
            var resolvedHttpReferences = findAssemblyNames.Invoke(
                null,
                new object[] { published.Namespaces, "System.Net.Http" }) as IReadOnlyList<string>;
            AssertEx.True(
                AssertEx.NotNull(resolvedHttpReferences, "Resolved System.Net.Http references")
                    .Contains("Microsoft.Win32.Primitives"),
                "Runtime namespace resolution must not drop clean non-System closure dependencies.");

            var bundleBytes = File.ReadAllBytes(published.BundlePath);
            AssertEx.Equal(published.BundleLength, (long)bundleBytes.Length, "Reference-pack binary length");
            AssertEx.Equal(
                published.BundleSha256,
                Convert.ToHexString(SHA256.HashData(bundleBytes)).ToLowerInvariant(),
                "Reference-pack binary SHA-256");
            AssertEx.Equal(
                published.ManifestAssemblies.Count,
                published.BundleSlices.Count,
                "Reference-pack slice count");
            long expectedOffset = 0;
            foreach (var assemblyName in published.ManifestAssemblies)
            {
                AssertEx.True(
                    published.BundleSlices.TryGetValue(assemblyName, out var slice),
                    $"Reference-pack slice for '{assemblyName}' is missing.");
                var validatedSlice = AssertEx.NotNull(slice, $"Reference-pack slice for '{assemblyName}'");
                AssertEx.Equal(expectedOffset, validatedSlice.Offset, $"Reference-pack offset for '{assemblyName}'");
                AssertEx.True(validatedSlice.Length > 0, $"Reference-pack slice for '{assemblyName}' must not be empty.");
                AssertEx.True(
                    validatedSlice.Offset <= bundleBytes.Length - validatedSlice.Length,
                    $"Reference-pack slice for '{assemblyName}' must be in bounds.");

                var sliceBytes = new byte[validatedSlice.Length];
                Buffer.BlockCopy(
                    bundleBytes,
                    checked((int)validatedSlice.Offset),
                    sliceBytes,
                    0,
                    validatedSlice.Length);
                AssertEx.Equal(
                    validatedSlice.Sha256,
                    Convert.ToHexString(SHA256.HashData(sliceBytes)).ToLowerInvariant(),
                    $"Reference-pack slice SHA-256 for '{assemblyName}'");
                expectedOffset += validatedSlice.Length;
            }
            AssertEx.Equal(published.BundleLength, expectedOffset, "Reference-pack contiguous coverage");

            var documentationBytes = File.ReadAllBytes(published.DocumentationPath);
            AssertEx.Equal(
                published.DocumentationLength,
                (long)documentationBytes.Length,
                "System.Runtime documentation length");
            AssertEx.Equal(
                published.DocumentationSha256,
                Convert.ToHexString(SHA256.HashData(documentationBytes)).ToLowerInvariant(),
                "System.Runtime documentation SHA-256");
            var documentationManifest = new StaticAssetFile(
                Path.GetFileName(published.DocumentationPath),
                checked((int)published.DocumentationLength),
                published.DocumentationSha256);
            var validateStaticAsset = typeof(AssemblyMetadataHelper).GetMethod(
                "StaticAssetMatchesManifest",
                BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "Managed static-asset manifest validation is unavailable.");
            bool DocumentationMatches(byte[] bytes) =>
                (bool)(validateStaticAsset.Invoke(
                    null,
                    new object[] { bytes, documentationManifest }) ?? false);
            AssertEx.True(
                DocumentationMatches(documentationBytes),
                "Published System.Runtime documentation must pass managed fallback validation.");
            var corruptDocumentation = documentationBytes.ToArray();
            corruptDocumentation[corruptDocumentation.Length / 2] ^= 0x01;
            AssertEx.False(
                DocumentationMatches(corruptDocumentation),
                "A same-length corrupt raw System.Runtime document must fail managed SHA-256 validation.");
            AssertEx.False(
                DocumentationMatches(documentationBytes[..^1]),
                "A truncated raw System.Runtime document must fail managed length validation.");

            var retryableDocumentationHelper = new AssemblyMetadataHelper(
                "https://unused.invalid/omnisharp/");
            var documentationTaskField = typeof(AssemblyMetadataHelper).GetField(
                    "_documentationProviderTask",
                    BindingFlags.Instance | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "Managed documentation request cache is unavailable.");
            documentationTaskField.SetValue(
                retryableDocumentationHelper,
                Task.FromResult<DocumentationProvider?>(null));
            AssertEx.True(
                await retryableDocumentationHelper.GetSystemRuntimeDocumentationProvider(
                    documentationManifest) == null,
                "A transient empty documentation result should remain a failed attempt.");
            AssertEx.True(
                documentationTaskField.GetValue(retryableDocumentationHelper) == null,
                "A transient empty documentation result must be evicted for bounded startup retry.");

            var cooperativeWork = typeof(OmniSharpProject).Assembly.GetType(
                    "CooperativeMetadataWork")
                ?? throw new InvalidOperationException(
                    "Cooperative browser metadata work is unavailable.");
            var cooperativeHash = cooperativeWork.GetMethod(
                    "HashMatchesAsync",
                    BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "Cooperative metadata hashing is unavailable.");
            var copyVerifiedSlice = cooperativeWork.GetMethod(
                    "CopyVerifiedSliceAsync",
                    BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "Cooperative reference-slice copying is unavailable.");
            var cooperativeSample = bundleBytes[..Math.Min(32 * 1024, bundleBytes.Length)];
            var cooperativeSampleHash = Convert.ToHexString(
                SHA256.HashData(cooperativeSample));
            var cooperativeHashTask = cooperativeHash.Invoke(
                    null,
                    new object?[]
                    {
                        cooperativeSample,
                        cooperativeSampleHash,
                        null,
                    }) as Task<bool>
                ?? throw new InvalidOperationException(
                    "Cooperative metadata hashing returned no task.");
            AssertEx.True(
                await cooperativeHashTask,
                "Chunked metadata hashing must preserve exact SHA-256 validation.");

            var cancellationChecks = 0;
            Func<bool> cancelMidSlice = () => ++cancellationChecks >= 3;
            var cancelledCopyTask = copyVerifiedSlice.Invoke(
                    null,
                    new object[]
                    {
                        cooperativeSample,
                        0,
                        cooperativeSample.Length,
                        cooperativeSampleHash,
                        cancelMidSlice,
                    }) as Task<byte[]?>
                ?? throw new InvalidOperationException(
                    "Cooperative reference-slice cancellation returned no task.");
            AssertEx.True(
                await cancelledCopyTask == null && cancellationChecks >= 3,
                "Background reference copying must observe priority cancellation between chunks.");

            var validCopyTask = copyVerifiedSlice.Invoke(
                    null,
                    new object[]
                    {
                        cooperativeSample,
                        0,
                        cooperativeSample.Length,
                        cooperativeSampleHash,
                        (Func<bool>)(() => false),
                    }) as Task<byte[]?>
                ?? throw new InvalidOperationException(
                    "Cooperative reference-slice validation returned no task.");
            var validCopy = await validCopyTask;
            AssertEx.True(
                validCopy != null &&
                !ReferenceEquals(validCopy, cooperativeSample) &&
                validCopy.SequenceEqual(cooperativeSample),
                "Cooperative reference copying must return exact independently owned bytes.");

            var runtimeIndex = new ReferencePackIndex(
                published.ManifestAssemblies,
                published.AssemblyReferences,
                published.Namespaces,
                new ReferencePackFile(
                    checked((int)published.BundleLength),
                    published.BundleSha256,
                    published.BundleSlices.ToDictionary(
                        entry => entry.Key,
                        entry => new ReferencePackSlice(
                            checked((int)entry.Value.Offset),
                            entry.Value.Length,
                            entry.Value.Sha256),
                        StringComparer.Ordinal)),
                documentationManifest);
            var staticSiteStateType = typeof(OmniSharpProject).GetNestedType(
                "StaticSiteState",
                BindingFlags.NonPublic)
                ?? throw new InvalidOperationException("OmniSharp static-site state is unavailable.");
            var orderBackgroundHydrationAssemblies = staticSiteStateType.GetMethod(
                    "OrderBackgroundHydrationAssemblies",
                    BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "Background reference scheduling policy is unavailable.");
            var hydrationOrder = orderBackgroundHydrationAssemblies.Invoke(
                    null,
                    new object[] { runtimeIndex }) as IReadOnlyList<string>
                ?? throw new InvalidOperationException(
                    "Background reference scheduling returned no sequence.");
            AssertEx.True(
                hydrationOrder.Count == published.ManifestAssemblies.Count &&
                hydrationOrder.ToHashSet(StringComparer.Ordinal).SetEquals(
                    published.ManifestAssemblies),
                "Background hydration scheduling must retain every reference exactly once.");
            AssertEx.True(
                hydrationOrder
                    .Select(assemblyName => runtimeIndex.ReferencePack.Assemblies[assemblyName].Length)
                    .SequenceEqual(
                        hydrationOrder
                            .Select(assemblyName =>
                                runtimeIndex.ReferencePack.Assemblies[assemblyName].Length)
                            .OrderBy(length => length)),
                "Background hydration must defer the largest non-preemptible metadata tails.");
            var findLongestNamespacePrefix = staticSiteStateType.GetMethod(
                "FindAssemblyNamesForLongestNamespacePrefix",
                BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "OmniSharp longest namespace-prefix resolver is unavailable.");
            var globalQualifiedReferences = findLongestNamespacePrefix.Invoke(
                null,
                new object[]
                {
                    published.Namespaces,
                    "global::System.Text.Json.JsonSerializer",
                }) as IReadOnlyList<string>;
            AssertEx.True(
                AssertEx.NotNull(globalQualifiedReferences, "Global-qualified namespace references")
                    .Contains("System.Text.Json"),
                "Global-qualified aliases and static imports must resolve through their longest namespace prefix.");
            var getNamespaceCandidates = typeof(OmniSharpProject).GetMethod(
                "GetAllNamespaceCandidates",
                BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "OmniSharp namespace candidate scanner is unavailable.");
            var candidateRoot = CSharpSyntaxTree.ParseText(
                    "using Json = global::System.Text.Json; using static global::System.Math; " +
                    "class Demo { global::System.Drawing.Color Color; void M() { System.Net.Http.HttpClient c = new(); } }")
                .GetRoot();
            var candidates = getNamespaceCandidates.Invoke(
                    null,
                    new object[] { candidateRoot }) as IEnumerable<string>
                ?? throw new InvalidOperationException(
                    "OmniSharp namespace candidate scanner returned no sequence.");
            var candidateSet = candidates.ToHashSet(StringComparer.Ordinal);
            AssertEx.True(
                candidateSet.Contains("global::System.Text.Json") &&
                candidateSet.Contains("global::System.Math") &&
                candidateSet.Any(candidate => candidate.Contains("System.Drawing.Color", StringComparison.Ordinal)) &&
                candidateSet.Any(candidate => candidate.Contains("System.Net.Http.HttpClient", StringComparison.Ordinal)),
                "Namespace scanning must cover aliases, static imports, global-qualified names, and member/name chains.");
            var getChangedNamespaceCandidates = typeof(OmniSharpProject).GetMethod(
                "GetChangedNamespaceCandidates",
                BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "OmniSharp changed namespace candidate scanner is unavailable.");
            var previousUsingTree = CSharpSyntaxTree.ParseText(
                "using System.Text.Jso; class Demo { }");
            var correctedUsingTree = previousUsingTree.WithChangedText(
                SourceText.From("using System.Text.Json; class Demo { }"));
            var correctedUsingRoot = correctedUsingTree.GetRoot();
            var changedCandidates = getChangedNamespaceCandidates.Invoke(
                    null,
                    new object[]
                    {
                        correctedUsingRoot,
                        correctedUsingTree.GetChangedSpans(previousUsingTree),
                    }) as IEnumerable<string>
                ?? throw new InvalidOperationException(
                    "OmniSharp changed namespace candidate scanner returned no sequence.");
            AssertEx.True(
                changedCandidates.Contains("System.Text.Json", StringComparer.Ordinal),
                "A single-character edit inside an existing using must discover its corrected namespace.");
            var beforePasteTree = CSharpSyntaxTree.ParseText("class Demo { }");
            var afterPasteTree = beforePasteTree.WithChangedText(SourceText.From(
                "using System.IO;\n" +
                "using System.Text.Json;\n" +
                "using System.Net.Http;\n" +
                "class Demo { global::System.Drawing.Color Color; }"));
            var pastedCandidates = getChangedNamespaceCandidates.Invoke(
                    null,
                    new object[]
                    {
                        afterPasteTree.GetRoot(),
                        afterPasteTree.GetChangedSpans(beforePasteTree),
                    }) as IEnumerable<string>
                ?? throw new InvalidOperationException(
                    "OmniSharp multiline-paste namespace scanner returned no sequence.");
            var pastedCandidateSet = pastedCandidates.ToHashSet(StringComparer.Ordinal);
            AssertEx.True(
                pastedCandidateSet.Contains("System.IO") &&
                pastedCandidateSet.Contains("System.Text.Json") &&
                pastedCandidateSet.Contains("System.Net.Http") &&
                pastedCandidateSet.Any(candidate =>
                    candidate.Contains("System.Drawing.Color", StringComparison.Ordinal)),
                "A multiline paste must discover every using and qualified namespace inside its changed span.");
            var resolveReferenceClosure = staticSiteStateType.GetMethod(
                "ResolveReferenceClosure",
                BindingFlags.Static | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException("OmniSharp startup-closure resolver is unavailable.");
            var startupRoots = new[]
            {
                "System.Runtime",
                "System.Collections",
                "System.Console",
                "System.Linq",
                "System.Linq.Expressions",
                "System.Linq.Queryable",
                "System.Net.Http",
                "System.Net.Http.Json",
                "System.Text.Json",
                "System.Threading.Tasks",
            };
            var startupClosure = resolveReferenceClosure.Invoke(
                null,
                new object[] { startupRoots, published.AssemblyReferences }) as IReadOnlyList<string>;
            var validatedStartupClosure = AssertEx.NotNull(startupClosure, "OmniSharp startup closure");
            AssertEx.True(
                validatedStartupClosure.Count <= 30,
                $"Startup closure should remain small; got {validatedStartupClosure.Count} assemblies.");
            AssertEx.False(
                validatedStartupClosure.Contains("netstandard"),
                "The netstandard facade must remain on demand because it expands startup drastically.");
            AssertEx.True(
                new[] { "System.Linq.Expressions", "System.Net.Http.Json", "System.Text.Encodings.Web" }
                    .All(validatedStartupClosure.Contains),
                "Startup closure must retain common LINQ, HTTP JSON, and JSON dependencies.");
            var staticSiteState = Activator.CreateInstance(
                staticSiteStateType,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                binder: null,
                args: new object[] { "https://unused.invalid/" },
                culture: null)
                ?? throw new InvalidOperationException("Could not create OmniSharp static-site state.");
            var createPackMetadata = staticSiteStateType.GetMethod(
                "TryCreateReferencePackMetadata",
                BindingFlags.Instance | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException("OmniSharp reference-pack loader is unavailable.");
            var loaderArguments = new object?[]
            {
                runtimeIndex,
                bundleBytes,
                null,
                published.ManifestAssemblies,
                null,
            };
            var loaderSucceeded = createPackMetadata.Invoke(staticSiteState, loaderArguments) as bool?;
            AssertEx.True(loaderSucceeded == true, "Runtime reference-pack validation should succeed.");
            var loadedReferences = loaderArguments[4] as IReadOnlyDictionary<string, MetadataReference>;
            AssertEx.Equal(
                published.ManifestAssemblies.Count,
                AssertEx.NotNull(loadedReferences, "Runtime-loaded reference pack").Count,
                "Runtime initialization must materialize the complete manifest atomically");
            var tamperedBundle = bundleBytes.ToArray();
            tamperedBundle[^1] ^= 0xff;
            var tamperedArguments = new object?[]
            {
                runtimeIndex,
                tamperedBundle,
                null,
                published.ManifestAssemblies,
                null,
            };
            bool? tamperedSucceeded;
            var originalOutput = Console.Out;
            try
            {
                Console.SetOut(TextWriter.Null);
                tamperedSucceeded = createPackMetadata.Invoke(staticSiteState, tamperedArguments) as bool?;
            }
            finally
            {
                Console.SetOut(originalOutput);
            }
            AssertEx.False(
                tamperedSucceeded == true,
                "Runtime reference-pack validation must reject a tampered binary atomically.");
            var tamperedReferences = tamperedArguments[4] as IReadOnlyDictionary<string, MetadataReference>;
            AssertEx.Equal(
                0,
                AssertEx.NotNull(tamperedReferences, "Rejected runtime reference pack").Count,
                "Rejected reference packs must not expose partial metadata");

            FieldInfo StateField(string name) =>
                staticSiteStateType.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    $"OmniSharp static-site field '{name}' is unavailable.");
            PropertyInfo StateProperty(string name) =>
                staticSiteStateType.GetProperty(name, BindingFlags.Instance | BindingFlags.Public)
                ?? throw new InvalidOperationException(
                    $"OmniSharp static-site property '{name}' is unavailable.");
            object CreatePreparedState(
                ReferencePackIndex index,
                byte[] bytes,
                DocumentationProvider? documentationProvider)
            {
                var state = Activator.CreateInstance(
                    staticSiteStateType,
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                    binder: null,
                    args: new object[] { "https://unused.invalid/eager-regression/" },
                    culture: null)
                    ?? throw new InvalidOperationException(
                        "Could not create prepared OmniSharp static-site state.");
                StateField("_referencePackIndex").SetValue(state, index);
                StateField("_referencePackBytes").SetValue(state, bytes);
                StateField("_namespaceIndexTask").SetValue(
                    state,
                    Task.FromResult(index));
                StateField("_staticAssetsLoaded").SetValue(state, true);
                StateField("_staticAssetsComplete").SetValue(state, true);

                var helper = StateField("_metadataHelper").GetValue(state)
                    as AssemblyMetadataHelper
                    ?? throw new InvalidOperationException(
                        "Prepared OmniSharp metadata helper is unavailable.");
                documentationTaskField.SetValue(
                    helper,
                    Task.FromResult(documentationProvider));
                return state;
            }

            var documentationProvider =
                XmlDocumentationProvider.CreateFromBytes(documentationBytes);
            var eagerState = CreatePreparedState(
                runtimeIndex,
                bundleBytes,
                documentationProvider);
            var ensureInitialized = staticSiteStateType.GetMethod(
                "EnsureInitializedAsync",
                BindingFlags.Instance | BindingFlags.Public)
                ?? throw new InvalidOperationException(
                    "OmniSharp eager metadata initialization is unavailable.");
            await (ensureInitialized.Invoke(eagerState, null) as Task
                ?? throw new InvalidOperationException(
                    "OmniSharp eager metadata initialization returned no task."));

            AssertEx.True(
                (bool)(StateProperty("IsInitialized").GetValue(eagerState) ?? false),
                "Eager startup must not publish readiness before the complete pack is installed.");
            AssertEx.True(
                (bool)(StateProperty("IsFullyHydrated").GetValue(eagerState) ?? false),
                "Eager startup must publish the first ready generation as fully hydrated.");
            AssertEx.False(
                (bool)(StateProperty("IsHydrationRunning").GetValue(eagerState) ?? false),
                "Eager startup must not leave a legacy hydration transition running.");
            AssertEx.Equal(
                1,
                (int)(StateProperty("MetadataVersion").GetValue(eagerState) ?? -1),
                "Eager startup metadata generation");
            AssertEx.Equal(
                1,
                (int)(StateProperty("NotifiableMetadataVersion").GetValue(eagerState) ?? -1),
                "Eager startup published metadata generation");
            AssertEx.True(
                (bool)(StateField("_backgroundPackCommitted").GetValue(eagerState) ?? false),
                "The eager generation must make background reference replacement inert.");
            AssertEx.True(
                StateField("_referencePackBytes").GetValue(eagerState) == null,
                "Eager startup must release the monolithic pack after every slice owns its bytes.");
            var eagerReferences = StateField("_metadataReferences").GetValue(eagerState)
                as IReadOnlyDictionary<string, MetadataReference>;
            var validatedEagerReferences = AssertEx.NotNull(
                eagerReferences,
                "Eager metadata references");
            AssertEx.Equal(
                published.ManifestAssemblies.Count,
                validatedEagerReferences.Count,
                "Eager startup reference count");
            var referenceMaterializations =
                StateField("_referenceMaterializations").GetValue(eagerState)
                    as IReadOnlyDictionary<string, Lazy<MetadataReference?>>;
            AssertEx.Equal(
                0,
                AssertEx.NotNull(
                    referenceMaterializations,
                    "Eager fallback materialization cache").Count,
                "A fully installed eager generation must not retain redundant fallback wrappers");

            var documentedCompilation = CSharpCompilation.Create(
                "DocumentedEagerReferenceProbe",
                references: validatedEagerReferences.Values,
                options: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
            var stringDocumentation = documentedCompilation
                .GetTypeByMetadataName("System.String")
                ?.GetDocumentationCommentXml();
            AssertEx.True(
                !string.IsNullOrWhiteSpace(stringDocumentation),
                "System.Runtime must carry verified XML documentation in the first ready generation.");

            var eagerSystemRuntime = validatedEagerReferences["System.Runtime"];
            await (ensureInitialized.Invoke(eagerState, null) as Task
                ?? throw new InvalidOperationException(
                    "Repeated eager metadata initialization returned no task."));
            var idempotentReferences = AssertEx.NotNull(
                StateField("_metadataReferences").GetValue(eagerState)
                    as IReadOnlyDictionary<string, MetadataReference>,
                "Idempotent eager metadata references");
            AssertEx.Equal(
                1,
                (int)(StateProperty("MetadataVersion").GetValue(eagerState) ?? -1),
                "Repeated eager initialization metadata generation");
            AssertEx.Same(
                eagerSystemRuntime,
                idempotentReferences["System.Runtime"],
                "Repeated eager initialization must retain the documented System.Runtime image.");

            var backgroundCallbackCount = 0;
            Func<Func<Task<bool>>, Func<bool>, Task<OmniSharpProject.MetadataHydrationCommitResult>>
                backgroundCallback = (_, _) =>
                {
                    Interlocked.Increment(ref backgroundCallbackCount);
                    return Task.FromResult(
                        new OmniSharpProject.MetadataHydrationCommitResult(true, true));
                };
            var beginBackgroundHydration = staticSiteStateType.GetMethod(
                "BeginBackgroundHydration",
                BindingFlags.Instance | BindingFlags.Public)
                ?? throw new InvalidOperationException(
                    "OmniSharp background hydration entry point is unavailable.");
            beginBackgroundHydration.Invoke(
                eagerState,
                new object[] { backgroundCallback });
            AssertEx.Equal(
                0,
                (int)(StateField("_backgroundHydrationStarted").GetValue(eagerState) ?? -1),
                "Fully eager startup background hydration marker");
            AssertEx.Equal(
                0,
                backgroundCallbackCount,
                "Fully eager startup must never enter the legacy completion fallback callback.");

            var undocumentedIndex = runtimeIndex with { Documentation = null };
            var undocumentedState = CreatePreparedState(
                undocumentedIndex,
                bundleBytes,
                documentationProvider: null);
            Exception? undocumentedFailure = null;
            try
            {
                await (ensureInitialized.Invoke(undocumentedState, null) as Task
                    ?? throw new InvalidOperationException(
                        "Undocumented eager initialization returned no task."));
            }
            catch (InvalidOperationException exception)
            {
                undocumentedFailure = exception;
            }
            AssertEx.True(
                undocumentedFailure != null,
                "A complete static-site startup must fail closed when its documentation manifest is absent.");
            AssertEx.False(
                (bool)(StateProperty("IsInitialized").GetValue(undocumentedState) ?? false),
                "Missing documentation must never publish partial compiler readiness.");
            AssertEx.Equal(
                0,
                (int)(StateProperty("MetadataVersion").GetValue(undocumentedState) ?? -1),
                "Missing-documentation metadata generation");
            AssertEx.Equal(
                0,
                AssertEx.NotNull(
                    StateField("_metadataReferences").GetValue(undocumentedState)
                        as IReadOnlyDictionary<string, MetadataReference>,
                    "Missing-documentation metadata references").Count,
                "Missing documentation must not expose an undocumented reference universe");

            var forbiddenHostAssemblies = new[]
            {
                "BlazorWorker",
                "Humanizer",
                "ICSharpCode",
                "Microsoft.AspNetCore",
                "Microsoft.CodeAnalysis",
                "Microsoft.Extensions",
                "Newtonsoft",
                "OmniSharp",
                "Tewr",
            };
            AssertEx.False(
                published.ManifestAssemblies.Any(assemblyName =>
                    forbiddenHostAssemblies.Any(prefix =>
                        assemblyName.Equals(prefix, StringComparison.Ordinal) ||
                        assemblyName.StartsWith(prefix + ".", StringComparison.Ordinal))),
                "IDE, host, and tooling assemblies must not enter the user reference manifest.");

            var references = published.CreateReferences(expectedInitialReferences);
            var syntaxTree = CSharpSyntaxTree.ParseText(
                """
                using System;
                using System.Linq;
                using System.Net.Http;
                using System.Threading.Tasks;

                public static class StaticReferenceProbe
                {
                    public static async Task<int> Run(HttpClient client)
                    {
                        Console.WriteLine(client.BaseAddress);
                        await client.GetAsync("https://example.invalid/");
                        return Enumerable.Range(1, 4).Where(value => value > 1).Count();
                    }
                }
                """);
            var compilation = CSharpCompilation.Create(
                "StaticReferenceProbe",
                new[] { syntaxTree },
                references,
                new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
            var errors = compilation.GetDiagnostics()
                .Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
                .ToArray();
            AssertEx.Equal(
                0,
                errors.Length,
                "The eager reference set must compile LINQ, HttpClient, Console, and Task: " +
                string.Join(" | ", errors.Select(error => error.ToString())));

            using var referenceFixture = CompletionFixture.Create(references);
            AssertEx.Item(
                (await referenceFixture.CompleteAsync(
                    "using System; class Demo { void M() { C<|> } }")).Response,
                "Console");
            var linqCompletion = await referenceFixture.CompleteAsync(
                "using System.Linq; class Demo { void M(int[] values) { values.<|> } }");
            AssertEx.True(
                linqCompletion.Response.Items.Any(item =>
                    item.Label.Equals("Where", StringComparison.Ordinal) ||
                    item.Label.StartsWith("Where<", StringComparison.Ordinal)),
                "The eager reference set should provide LINQ Where completion.");
            AssertEx.Item(
                (await referenceFixture.CompleteAsync(
                    "using System.Net.Http; class Demo { void M(HttpClient client) { client.<|> } }")).Response,
                "GetAsync");
        }),
        ("System.Text.Json namespace closure includes transitive compiler dependencies", async () =>
        {
            var published = PublishedReferencePack.Load();
            AssertEx.True(
                published.Namespaces.TryGetValue("System.Text.Json", out var jsonClosure),
                "System.Text.Json namespace closure is missing.");
            var validatedJsonClosure = AssertEx.NotNull(
                jsonClosure,
                "System.Text.Json namespace closure");
            var requiredJsonReferences = new[]
            {
                "System.Text.Json",
                "System.Text.Encodings.Web",
                "System.Memory",
                "System.Collections.Concurrent",
                "System.Collections",
                "System.Runtime",
            };
            AssertEx.True(
                requiredJsonReferences.All(validatedJsonClosure.Contains),
                "System.Text.Json closure must contain all in-pack transitive dependencies.");

            var coreReferences = new[]
            {
                "System.Runtime",
                "System.Collections",
                "System.Console",
                "System.Linq",
                "System.Net.Http",
                "System.Threading.Tasks",
                "netstandard",
            };
            var references = published.CreateReferences(coreReferences.Concat(validatedJsonClosure));
            var syntaxTree = CSharpSyntaxTree.ParseText(
                """
                using System.Text.Encodings.Web;
                using System.Text.Json;

                public static class JsonReferenceProbe
                {
                    public static string Run(int value)
                    {
                        var options = new JsonSerializerOptions { Encoder = JavaScriptEncoder.Default };
                        return JsonSerializer.Serialize(value, options);
                    }
                }
                """);
            var errors = CSharpCompilation.Create(
                    "JsonReferenceProbe",
                    new[] { syntaxTree },
                    references,
                    new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary))
                .GetDiagnostics()
                .Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
                .ToArray();
            AssertEx.Equal(
                0,
                errors.Length,
                "System.Text.Json namespace closure must compile without CS0012: " +
                string.Join(" | ", errors.Select(error => error.ToString())));

            using var jsonFixture = CompletionFixture.Create(references);
            AssertEx.Item(
                (await jsonFixture.CompleteAsync(
                    "using System.Text.Json; class Demo { void M(JsonSerializerOptions options) { options.<|> } }")).Response,
                "Encoder");
            var serializerCompletion = await jsonFixture.CompleteAsync(
                "using System.Text.Json; class Demo { void M() { JsonSerializer.<|> } }");
            AssertEx.True(
                serializerCompletion.Response.Items.Any(item =>
                    item.Label.Equals("Serialize", StringComparison.Ordinal) ||
                    item.Label.StartsWith("Serialize<", StringComparison.Ordinal)),
                "System.Text.Json closure should provide JsonSerializer.Serialize completion.");
        }),
        ("full reference manifest preserves IQueryable and System.Net.Http.Json", async () =>
        {
            var published = PublishedReferencePack.Load();
            AssertEx.True(
                published.ManifestAssemblies.Contains("System.Linq.Expressions") &&
                published.ManifestAssemblies.Contains("System.Net.Http.Json"),
                "Full reference-pack initialization must include LINQ expressions and HTTP JSON.");

            var references = published.CreateReferences(published.ManifestAssemblies);
            var syntaxTree = CSharpSyntaxTree.ParseText(
                """
                using System.Linq;
                using System.Net.Http;
                using System.Net.Http.Json;
                using System.Threading.Tasks;

                public sealed class Payload { public int Value { get; set; } }
                public static class FullReferenceProbe
                {
                    public static IQueryable<int> Filter(IQueryable<int> query) =>
                        query.Where(value => value > 0);

                    public static Task<Payload?> Read(HttpClient client) =>
                        client.GetFromJsonAsync<Payload>("https://example.invalid/");
                }
                """);
            var errors = CSharpCompilation.Create(
                    "FullReferenceProbe",
                    new[] { syntaxTree },
                    references,
                    new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary))
                .GetDiagnostics()
                .Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
                .ToArray();
            AssertEx.Equal(
                0,
                errors.Length,
                "The full static reference manifest must compile IQueryable and Http.Json: " +
                string.Join(" | ", errors.Select(error => error.ToString())));

            using var fullFixture = CompletionFixture.Create(references);
            var queryCompletion = await fullFixture.CompleteAsync(
                "using System.Linq; class Demo { void M(IQueryable<int> query) { query.<|> } }");
            AssertEx.Item(queryCompletion.Response, "Provider");
            AssertEx.True(
                queryCompletion.Response.Items.Any(item =>
                    item.Label.Equals("Where", StringComparison.Ordinal) ||
                    item.Label.StartsWith("Where<", StringComparison.Ordinal)),
                "The full reference manifest should provide IQueryable.Where completion.");

            var httpJsonCompletion = await fullFixture.CompleteAsync(
                "using System.Net.Http; using System.Net.Http.Json; class Demo { void M(HttpClient client) { client.<|> } }");
            AssertEx.True(
                httpJsonCompletion.Response.Items.Any(item =>
                    item.Label.Equals("GetFromJsonAsync", StringComparison.Ordinal) ||
                    item.Label.StartsWith("GetFromJsonAsync<", StringComparison.Ordinal)),
                "The full reference manifest should provide HttpClient.GetFromJsonAsync completion.");
        }),
        ("startup warm-up is cancellable and post-sync work stays demand-driven", async () =>
        {
            using var warmFixture = CompletionFixture.Create();
            var monacoService = warmFixture.CreateMonacoService();
            var cancelWarmUp = typeof(MonacoService).GetMethod(
                "CancelCompletionProjectWarmUp",
                BindingFlags.Instance | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "Completion project warm-up cancellation method is unavailable.");
            var scheduleWarmUp = typeof(MonacoService).GetMethod(
                "ScheduleCompletionProjectWarmUp",
                BindingFlags.Instance | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    "Completion project warm-up scheduler is unavailable.");
            var completionGate = typeof(MonacoService).GetField(
                "_completionGate",
                BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(monacoService)
                as SemaphoreSlim
                ?? throw new InvalidOperationException("Completion gate is unavailable.");

            var currentDocument = warmFixture.Project.Workspace.CurrentSolution
                .GetDocument(warmFixture.Project.DocumentId)
                ?? throw new InvalidOperationException("Warm-up test document is unavailable.");
            var initialSolution = currentDocument.Project.Solution;
            var initialText = (await currentDocument.GetTextAsync()).ToString();
            await warmFixture.Service.WarmUpAsync(currentDocument);
            var afterStartupWarm = warmFixture.Project.Workspace.CurrentSolution
                .GetDocument(warmFixture.Project.DocumentId)
                ?? throw new InvalidOperationException(
                    "Startup warm-up removed the initial completion document.");
            AssertEx.Same(
                initialSolution,
                afterStartupWarm.Project.Solution,
                "Startup warm-up must not replace the initial project solution");
            AssertEx.Equal(
                initialText,
                (await afterStartupWarm.GetTextAsync()).ToString(),
                "Startup warm-up must not mutate the initial document text");

            using (var alreadyCancelled = new CancellationTokenSource())
            {
                alreadyCancelled.Cancel();
                var cancellationObserved = false;
                try
                {
                    await warmFixture.Service.WarmUpAsync(
                        currentDocument,
                        alreadyCancelled.Token);
                }
                catch (OperationCanceledException)
                {
                    cancellationObserved = true;
                }

                AssertEx.True(
                    cancellationObserved,
                    "Roslyn user-project warm-up must honor cancellation before starting work.");
            }

            const string source = "using System; class Demo { void M() { C } }";
            var projectRequest = CompletionFixture.Serialize(new
            {
                CurrentPath = HarnessConstants.PrimaryPath,
                Files = Array.Empty<object>(),
            });

            try
            {
                _ = await monacoService.SyncCompletionProjectAsync(
                    source,
                    projectRequest,
                    "warm-revision-one");
                AssertEx.True(
                    typeof(MonacoService).GetField(
                        "_completionProjectWarmUpCancellation",
                        BindingFlags.Instance | BindingFlags.NonPublic) == null,
                    "Post-sync browser warm-up must not retain a non-preemptible background task.");

                _ = await monacoService.SyncCompletionProjectAsync(
                    source,
                    projectRequest,
                    "warm-revision-two");
                _ = scheduleWarmUp.Invoke(
                    monacoService,
                    new object[] { "warm-revision-two" });

                AssertEx.True(
                    await completionGate.WaitAsync(0),
                    "Optional post-sync work must never occupy the interactive completion gate.");
                completionGate.Release();

                using var refilter = JsonDocument.Parse(
                    await monacoService.GetCompletionRefilterAsync(
                        string.Empty,
                        "missing-interactive-list"));
                AssertEx.Equal(
                    "GetCompletionRefilterAsync",
                    refilter.RootElement.GetProperty("type").GetString()!,
                    "Interactive completion remains available after synchronization");
            }
            finally
            {
                _ = cancelWarmUp.Invoke(monacoService, null);
            }
        }),
        ("interactive work preempts queued speculative completion and background diagnostics", async () =>
        {
            using var completionFixture = CompletionFixture.Create();
            using var speculativeFixture = CompletionFixture.Create();
            using var diagnosticFixture = CompletionFixture.Create();
            var monacoService = completionFixture.CreateMonacoService();

            static FieldInfo PrivateField(string name) =>
                typeof(MonacoService).GetField(
                    name,
                    BindingFlags.Instance | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    $"MonacoService field '{name}' is unavailable.");

            PrivateField("_speculativeCompletionProject")
                .SetValue(monacoService, speculativeFixture.Project);
            PrivateField("_speculativeCompletionService")
                .SetValue(monacoService, speculativeFixture.Service);
            PrivateField("_diagnosticProject")
                .SetValue(monacoService, diagnosticFixture.Project);

            var speculativeGate = (SemaphoreSlim)PrivateField("_speculativeCompletionGate")
                .GetValue(monacoService)!;
            await speculativeGate.WaitAsync();
            Task<byte[]> queuedSpeculative;
            try
            {
                queuedSpeculative = monacoService.GetSpeculativeCompletionAsync(
                    string.Empty,
                    string.Empty,
                    string.Empty,
                    string.Empty,
                    "queued-speculative",
                    string.Empty);
                await Task.Yield();
                _ = await monacoService.CancelSpeculativeCompletionAsync();
            }
            finally
            {
                speculativeGate.Release();
            }

            using (var cancellation = JsonDocument.Parse(await queuedSpeculative))
            {
                var payload = cancellation.RootElement.GetProperty("payload");
                AssertEx.True(
                    payload.GetProperty("c").GetBoolean(),
                    "A queued synchronized speculative request must return the explicit cancellation sentinel.");
                AssertEx.False(
                    payload.GetProperty("s").GetProperty("success").GetBoolean(),
                    "Pre-sync cancellation must not claim an unapplied text acknowledgement.");
            }

            var diagnosticGate = (SemaphoreSlim)PrivateField("_diagnosticGate")
                .GetValue(monacoService)!;
            await diagnosticGate.WaitAsync();
            Task<byte[]> queuedDiagnostics;
            try
            {
                queuedDiagnostics = monacoService.GetDiagnosticsAsync(string.Empty, string.Empty);
                await Task.Yield();
                _ = await monacoService.CancelSpeculativeCompletionAsync();
            }
            finally
            {
                diagnosticGate.Release();
            }

            using var diagnosticCancellation = JsonDocument.Parse(await queuedDiagnostics);
            AssertEx.True(
                diagnosticCancellation.RootElement
                    .GetProperty("payload")
                    .GetProperty("cancelled")
                    .GetBoolean(),
                "Queued background diagnostics must yield to accepted interactive authoring work.");
        }),
        ("legacy project snapshots invalidate synchronized revisions", async () =>
        {
            using var primaryFixture = CompletionFixture.Create();
            using var speculativeFixture = CompletionFixture.Create();
            var monacoService = primaryFixture.CreateMonacoService();

            static FieldInfo PrivateField(string name) =>
                typeof(MonacoService).GetField(
                    name,
                    BindingFlags.Instance | BindingFlags.NonPublic)
                ?? throw new InvalidOperationException(
                    $"MonacoService field '{name}' is unavailable.");

            PrivateField("_speculativeCompletionProject")
                .SetValue(monacoService, speculativeFixture.Project);
            PrivateField("_speculativeCompletionService")
                .SetValue(monacoService, speculativeFixture.Service);

            const string code = "using System; class Demo { void M() { C } }";
            var cursorOffset = code.LastIndexOf('C') + 1;
            var cursor = SourceText.From(code).Lines.GetLinePosition(cursorOffset);
            var completionRequest = CompletionFixture.Serialize(new CompletionRequest
            {
                FileName = HarnessConstants.PrimaryPath,
                Line = cursor.Line,
                Column = cursor.Character,
                CompletionTrigger = CompletionTriggerKind.Invoked,
            });
            var originalProjectRequest = CompletionFixture.Serialize(new
            {
                CurrentPath = HarnessConstants.PrimaryPath,
                Files = new[]
                {
                    new { Path = "src/Before.cs", Content = "public class Before { }" }
                },
            });
            var legacyProjectRequest = CompletionFixture.Serialize(new
            {
                CurrentPath = HarnessConstants.PrimaryPath,
                Files = new[]
                {
                    new { Path = "src/After.cs", Content = "public class After { }" }
                },
            });
            const string originalRevision = "legacy-snapshot-original-revision";
            var fullSyncRequest = CompletionFixture.Serialize(
                new MonacoService.CompletionTextSyncRequest(
                    true,
                    -1,
                    0,
                    code.Length,
                    originalRevision,
                    Array.Empty<OmniSharpProject.IncrementalTextChange>()));

            _ = await monacoService.GetCompletionAsync(
                code,
                fullSyncRequest,
                completionRequest,
                originalProjectRequest,
                "legacy-primary-initial");
            _ = await monacoService.GetSpeculativeCompletionAsync(
                code,
                fullSyncRequest,
                completionRequest,
                originalProjectRequest,
                "legacy-speculative-initial");
            AssertEx.Equal(
                originalRevision,
                (string)PrivateField("_completionProjectRevision").GetValue(monacoService)!,
                "Initial primary synchronized revision");
            AssertEx.Equal(
                originalRevision,
                (string)PrivateField("_speculativeProjectRevision").GetValue(monacoService)!,
                "Initial speculative synchronized revision");

            _ = await monacoService.GetCompletionAsync(
                code,
                completionRequest,
                legacyProjectRequest,
                "legacy-primary-snapshot");
            _ = await monacoService.GetSpeculativeCompletionAsync(
                code,
                completionRequest,
                legacyProjectRequest,
                "legacy-speculative-snapshot");

            AssertEx.Equal(
                string.Empty,
                (string)PrivateField("_completionProjectRevision").GetValue(monacoService)!,
                "Legacy primary snapshot must clear its unprovable revision");
            AssertEx.Equal(
                string.Empty,
                (string)PrivateField("_speculativeProjectRevision").GetValue(monacoService)!,
                "Legacy speculative snapshot must clear its unprovable revision");
            AssertEx.True(
                typeof(MonacoService).GetField(
                    "_completionProjectWarmUpCancellation",
                    BindingFlags.Instance | BindingFlags.NonPublic) == null,
                "An unversioned legacy project snapshot must not retain background warm-up state.");

            async Task<JsonDocument> AttemptOldRevisionIncrementalAsync(bool speculative)
            {
                var project = speculative
                    ? speculativeFixture.Project
                    : primaryFixture.Project;
                var incrementalRequest = CompletionFixture.Serialize(
                    new MonacoService.CompletionTextSyncRequest(
                        false,
                        project.PrimaryDocumentVersion,
                        code.Length,
                        code.Length,
                        originalRevision,
                        Array.Empty<OmniSharpProject.IncrementalTextChange>()));
                var envelope = speculative
                    ? await monacoService.GetSpeculativeCompletionAsync(
                        string.Empty,
                        incrementalRequest,
                        completionRequest,
                        string.Empty,
                        "legacy-speculative-stale")
                    : await monacoService.GetCompletionAsync(
                        string.Empty,
                        incrementalRequest,
                        completionRequest,
                        string.Empty,
                        "legacy-primary-stale");
                return JsonDocument.Parse(envelope);
            }

            using var primaryStaleEnvelope =
                await AttemptOldRevisionIncrementalAsync(speculative: false);
            using var speculativeStaleEnvelope =
                await AttemptOldRevisionIncrementalAsync(speculative: true);
            foreach (var (label, envelope) in new[]
            {
                ("Primary", primaryStaleEnvelope),
                ("Speculative", speculativeStaleEnvelope),
            })
            {
                var acknowledgement = envelope.RootElement
                    .GetProperty("payload")
                    .GetProperty("s");
                AssertEx.False(
                    acknowledgement.GetProperty("success").GetBoolean(),
                    $"{label} stale revision success");
                AssertEx.True(
                    acknowledgement.GetProperty("requiresFullSync").GetBoolean(),
                    $"{label} stale revision must require a full sync");
            }
        }),
        ("atomic completion sync uses deltas and rejects stale versions without mutation", async () =>
        {
            var monacoService = fixture.CreateMonacoService();
            const string prefix = "using System; class Demo { void M() { ";
            const string suffix = " } }";
            var initialCode = prefix + "C" + suffix;
            var memberCode = prefix + "Console." + suffix;
            var filteredMemberCode = prefix + "Console.W" + suffix;
            const string projectRevision = "protocol-test-project";
            var projectRequest = CompletionFixture.Serialize(new
            {
                CurrentPath = HarnessConstants.PrimaryPath,
                Files = Array.Empty<object>(),
            });

            string CompletionRequestJson(string code, int offset)
            {
                var text = SourceText.From(code);
                var cursor = text.Lines.GetLinePosition(offset);
                return CompletionFixture.Serialize(new CompletionRequest
                {
                    FileName = HarnessConstants.PrimaryPath,
                    Line = cursor.Line,
                    Column = cursor.Character,
                    CompletionTrigger = CompletionTriggerKind.Invoked,
                });
            }

            static JsonElement Payload(JsonDocument document) =>
                document.RootElement.GetProperty("payload");

            static bool HasCompactLabel(JsonElement completion, string label) =>
                completion.GetProperty("i")
                    .EnumerateArray()
                    .Any(item => item.ValueKind == JsonValueKind.Array &&
                        item.GetArrayLength() > 0 &&
                        string.Equals(item[0].GetString(), label, StringComparison.Ordinal));

            using var initialEnvelope = JsonDocument.Parse(await monacoService.GetCompletionAsync(
                initialCode,
                CompletionFixture.Serialize(new MonacoService.CompletionTextSyncRequest(
                    true,
                    -1,
                    0,
                    initialCode.Length,
                    projectRevision,
                    Array.Empty<OmniSharpProject.IncrementalTextChange>())),
                CompletionRequestJson(initialCode, prefix.Length + 1),
                projectRequest,
                "protocol-initial"));
            var initialPayload = Payload(initialEnvelope);
            var initialAck = initialPayload.GetProperty("s");
            AssertEx.True(initialAck.GetProperty("success").GetBoolean(), "Full sync acknowledgement");
            AssertEx.Equal(initialCode.Length, initialAck.GetProperty("textLength").GetInt32(), "Full sync length");
            AssertEx.True(
                HasCompactLabel(initialPayload.GetProperty("p"), "Console"),
                "Full synchronized completion should contain Console.");
            var initialVersion = initialAck.GetProperty("version").GetInt64();

            using var memberEnvelope = JsonDocument.Parse(await monacoService.GetCompletionAsync(
                string.Empty,
                CompletionFixture.Serialize(new MonacoService.CompletionTextSyncRequest(
                    false,
                    initialVersion,
                    initialCode.Length,
                    memberCode.Length,
                    projectRevision,
                    new[]
                    {
                        new OmniSharpProject.IncrementalTextChange(
                            prefix.Length,
                            1,
                            "Console.")
                    })),
                CompletionRequestJson(memberCode, prefix.Length + "Console.".Length),
                string.Empty,
                "protocol-member"));
            var memberPayload = Payload(memberEnvelope);
            var memberAck = memberPayload.GetProperty("s");
            AssertEx.True(memberAck.GetProperty("success").GetBoolean(), "Incremental sync acknowledgement");
            AssertEx.Equal(memberCode.Length, memberAck.GetProperty("textLength").GetInt32(), "Incremental sync length");
            AssertEx.True(
                HasCompactLabel(memberPayload.GetProperty("p"), "WriteLine"),
                "Incrementally synchronized member completion should contain WriteLine.");
            var memberVersion = memberAck.GetProperty("version").GetInt64();

            using var staleEnvelope = JsonDocument.Parse(await monacoService.GetCompletionAsync(
                string.Empty,
                CompletionFixture.Serialize(new MonacoService.CompletionTextSyncRequest(
                    false,
                    initialVersion,
                    memberCode.Length,
                    filteredMemberCode.Length,
                    projectRevision,
                    new[]
                    {
                        new OmniSharpProject.IncrementalTextChange(
                            prefix.Length + "Console.".Length,
                            0,
                            "W")
                    })),
                CompletionRequestJson(filteredMemberCode, prefix.Length + "Console.W".Length),
                string.Empty,
                "protocol-stale"));
            var stalePayload = Payload(staleEnvelope);
            var staleAck = stalePayload.GetProperty("s");
            AssertEx.False(staleAck.GetProperty("success").GetBoolean(), "Stale incremental sync success");
            AssertEx.True(staleAck.GetProperty("requiresFullSync").GetBoolean(), "Stale incremental recovery flag");
            AssertEx.Equal(memberVersion, staleAck.GetProperty("version").GetInt64(), "Stale rejection version");
            AssertEx.Equal(JsonValueKind.Null, stalePayload.GetProperty("p").ValueKind, "Stale rejection completion payload");
            AssertEx.Equal(
                memberCode,
                (await fixture.Project.UseOnlyOnceDocument.GetTextAsync()).ToString(),
                "Stale incremental rejection must not mutate the document");

            using var recoveryEnvelope = JsonDocument.Parse(await monacoService.GetCompletionAsync(
                filteredMemberCode,
                CompletionFixture.Serialize(new MonacoService.CompletionTextSyncRequest(
                    true,
                    memberVersion,
                    memberCode.Length,
                    filteredMemberCode.Length,
                    projectRevision,
                    Array.Empty<OmniSharpProject.IncrementalTextChange>())),
                CompletionRequestJson(filteredMemberCode, prefix.Length + "Console.W".Length),
                projectRequest,
                "protocol-recovery"));
            var recoveryPayload = Payload(recoveryEnvelope);
            AssertEx.True(
                recoveryPayload.GetProperty("s").GetProperty("success").GetBoolean(),
                "Full recovery acknowledgement");
            AssertEx.True(
                HasCompactLabel(recoveryPayload.GetProperty("p"), "WriteLine"),
                "Full recovery completion should contain WriteLine.");
        }),
        ("exact snapshots are no-ops and changed files keep DocumentIds", async () =>
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
            AssertEx.Same(firstSolution, identicalDocument.Project.Solution, "Exact project snapshot Solution identity");
            AssertEx.Equal(
                firstAdditionalId,
                FindDocument(identicalDocument.Project.Solution, "src/ProjectType.cs").Id,
                "Exact snapshot additional DocumentId");

            var changedFiles = new[]
            {
                new OmniSharpProject.SourceFileSnapshot(
                    "src/ProjectType.cs",
                    "public class ProjectType { public int SecondMember { get; set; } }")
            };
            var changedDocument = await fixture.Project.UpdateProjectDocumentsAsync(source, HarnessConstants.PrimaryPath, changedFiles);
            AssertEx.NotSame(firstSolution, changedDocument.Project.Solution, "Changed file Solution identity");
            AssertEx.Equal(
                firstAdditionalId,
                FindDocument(changedDocument.Project.Solution, "src/ProjectType.cs").Id,
                "Changed file DocumentId");

            var changedCompletion = await fixture.CompleteAsync(markedSource, changedFiles);
            AssertEx.Item(changedCompletion.Response, "SecondMember");
            AssertEx.DoesNotContain(changedCompletion.Response, "FirstMember");
        }),
        ("primary-only full update preserves project documents", async () =>
        {
            var initial = CompletionFixture.RemoveCursor(
                "class Consumer { void M() { ProjectType value = new(); value.<|> } }");
            var files = new[]
            {
                new OmniSharpProject.SourceFileSnapshot(
                    "src/ProjectType.cs",
                    "public class ProjectType { public int PreservedMember { get; set; } }")
            };
            await fixture.Project.UpdateProjectDocumentsAsync(initial.Source, HarnessConstants.PrimaryPath, files);

            var updated = await fixture.CompletePrimaryOnlyAsync(
                "class Consumer { void M() { ProjectType value = new ProjectType(); value.<|> } }");

            AssertEx.Item(updated.Response, "PreservedMember");
            AssertEx.Equal(
                1,
                updated.Document.Project.Documents.Count(document => document.FilePath == "src/ProjectType.cs"),
                "Primary-only update should retain the additional project document");
        }),
        ("valid incremental update preserves Roslyn change ancestry and project documents", async () =>
        {
            const string original = "class Consumer { void M() { ProjectType value = new(); value. } }";
            var files = new[]
            {
                new OmniSharpProject.SourceFileSnapshot(
                    "src/ProjectType.cs",
                    "public class ProjectType { public int IncrementalMember { get; set; } }")
            };
            var beforeDocument = await fixture.Project.UpdateProjectDocumentsAsync(original, HarnessConstants.PrimaryPath, files);
            var beforeText = await beforeDocument.GetTextAsync();
            var version = fixture.Project.PrimaryDocumentVersion;
            var insertAt = original.IndexOf("value.", StringComparison.Ordinal) + "value.".Length;

            var update = await fixture.Project.TryUpdatePrimaryDocumentAsync(
                version,
                original.Length,
                new[] { new OmniSharpProject.IncrementalTextChange(insertAt, 0, "I") });

            AssertEx.True(update.Success, "Valid incremental update success");
            AssertEx.False(update.RequiresFullSync, "Valid incremental update fallback flag");
            AssertEx.Equal(version + 1, update.Version, "Valid incremental update version");
            AssertEx.Equal(original.Length + 1, update.TextLength, "Valid incremental update length");
            var document = AssertEx.NotNull(update.Document, "Valid incremental update document");
            var afterText = await document.GetTextAsync();
            var changes = afterText.GetChangeRanges(beforeText);
            AssertEx.Equal(1, changes.Count, "Incremental SourceText change-range count");
            AssertEx.Equal(new TextSpan(insertAt, 0), changes[0].Span, "Incremental SourceText changed span");
            AssertEx.Equal(1, changes[0].NewLength, "Incremental SourceText replacement length");
            AssertEx.Equal(
                1,
                document.Project.Documents.Count(candidate => candidate.FilePath == "src/ProjectType.cs"),
                "Incremental update should retain the additional project document");

            var completion = await fixture.CompleteExistingDocumentAsync(document, insertAt + 1);
            AssertEx.Item(completion.Response, "IncrementalMember");
        }),
        ("incremental guards reject stale, invalid, overlapping, and null changes atomically", async () =>
        {
            const string source = "class Demo { int Value; void M() { this. } }";
            var document = await fixture.Project.UpdateProjectDocumentsAsync(
                source,
                HarnessConstants.PrimaryPath,
                Array.Empty<OmniSharpProject.SourceFileSnapshot>());
            var version = fixture.Project.PrimaryDocumentVersion;
            var originalText = (await document.GetTextAsync()).ToString();

            var failures = new[]
            {
                await fixture.Project.TryUpdatePrimaryDocumentAsync(
                    version - 1,
                    source.Length,
                    new[] { new OmniSharpProject.IncrementalTextChange(0, 0, "x") }),
                await fixture.Project.TryUpdatePrimaryDocumentAsync(
                    version,
                    source.Length + 1,
                    new[] { new OmniSharpProject.IncrementalTextChange(0, 0, "x") }),
                await fixture.Project.TryUpdatePrimaryDocumentAsync(
                    version,
                    source.Length,
                    new[] { new OmniSharpProject.IncrementalTextChange(source.Length + 1, 0, "x") }),
                await fixture.Project.TryUpdatePrimaryDocumentAsync(
                    version,
                    source.Length,
                    new[]
                    {
                        new OmniSharpProject.IncrementalTextChange(2, 3, "x"),
                        new OmniSharpProject.IncrementalTextChange(4, 1, "y"),
                    }),
                await fixture.Project.TryUpdatePrimaryDocumentAsync(
                    version,
                    source.Length,
                    null),
            };

            foreach (var failure in failures)
            {
                AssertEx.False(failure.Success, "Invalid incremental update success flag");
                AssertEx.True(failure.RequiresFullSync, "Invalid incremental update fallback flag");
                AssertEx.Equal(version, failure.Version, "Rejected incremental update version");
                AssertEx.Equal(source.Length, failure.TextLength, "Rejected incremental update length");
            }

            AssertEx.True(
                failures.All(failure => failure.Document == null),
                "Rejected incremental updates should not return a document that could be mistaken for synchronized state");
            var after = fixture.Project.UseOnlyOnceDocument;
            AssertEx.Equal(originalText, (await after.GetTextAsync()).ToString(), "Rejected changes must be atomic");

            var empty = await fixture.Project.TryUpdatePrimaryDocumentAsync(
                version,
                source.Length,
                Array.Empty<OmniSharpProject.IncrementalTextChange>());
            AssertEx.True(empty.Success, "Empty incremental update should be a no-op success");
            AssertEx.Equal(version, empty.Version, "Empty incremental update should not bump version");
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

static void AssertResponseParity(CompletionResponse expected, CompletionResponse actual, string context)
{
    AssertEx.Equal(expected.IsIncomplete, actual.IsIncomplete, $"{context} IsIncomplete");
    AssertEx.Equal(expected.Items.Count, actual.Items.Count, $"{context} item count");

    for (var index = 0; index < expected.Items.Count; index++)
    {
        var expectedJson = CompletionFixture.Serialize(expected.Items[index]);
        var actualJson = CompletionFixture.Serialize(actual.Items[index]);
        if (!string.Equals(expectedJson, actualJson, StringComparison.Ordinal))
        {
            throw new RegressionFailureException(
                $"{context} parity failed at index {index} " +
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
        new BenchmarkScenario("prefix-C", "using System; class Demo { void M() { C<|> } }", "Console"),
        new BenchmarkScenario("Console-dot", "using System; class Demo { void M() { Console.<|> } }", "WriteLine"),
        new BenchmarkScenario("Console-W", "using System; class Demo { void M() { Console.W<|> } }", "WriteLine"),
        new BenchmarkScenario("string-dot", "class Demo { void M() { string text = \"\"; text.<|> } }", "Length"),
    };

    Console.WriteLine($"OmniSharp completion benchmark (.NET {Environment.Version}, {iterations} warm samples)");
    Console.WriteLine("Times include project snapshot update, completion materialization, compacting, and JSON serialization.");
    Console.WriteLine();
    Console.WriteLine($"{"scenario",-14} {"cold ms",10} {"p50 ms",10} {"p95 ms",10} {"items",9} {"full bytes",13} {"compact bytes",15} {"saved",8}");

    foreach (var scenario in scenarios)
    {
        var cold = await fixture.ProbeAsync(scenario.Source);
        AssertEx.Item(cold.Response, scenario.ExpectedLabel);
        ValidateCompact(fixture, cold);

        await fixture.ProbeAsync(scenario.Source);
        var warm = new List<double>(iterations);
        CompletionProbe? last = null;
        for (var iteration = 0; iteration < iterations; iteration++)
        {
            last = await fixture.ProbeAsync(scenario.Source);
            warm.Add(last.Elapsed.TotalMilliseconds);
        }

        warm.Sort();
        var savings = last!.FullSerializedBytes == 0
            ? 0
            : 1d - ((double)last.CompactSerializedBytes / last.FullSerializedBytes);
        Console.WriteLine(
            $"{scenario.Name,-14} " +
            $"{cold.Elapsed.TotalMilliseconds,10:F2} " +
            $"{Percentile(warm, 0.50),10:F2} " +
            $"{Percentile(warm, 0.95),10:F2} " +
            $"{last.Response.Items.Count,9:N0} " +
            $"{last.FullSerializedBytes,13:N0} " +
            $"{last.CompactSerializedBytes,15:N0} " +
            $"{savings,7:P0}");
    }

    static void ValidateCompact(CompletionFixture fixture, CompletionProbe probe)
    {
        var expanded = CompactCompletionCodec.ExpandThroughJson(fixture.Service.Compact(probe.Response));
        AssertResponseParity(probe.Response, expanded, "benchmark compact completion");
    }
}

static double Percentile(IReadOnlyList<double> sortedSamples, double percentile)
{
    var index = Math.Clamp((int)Math.Ceiling(sortedSamples.Count * percentile) - 1, 0, sortedSamples.Count - 1);
    return sortedSamples[index];
}

internal static class CompletionSamples
{
    public static CompletionResponse CreateFieldCoverageResponse()
    {
        var sharedCommits = ImmutableArray.Create('.', '(', ';');
        return new CompletionResponse
        {
            IsIncomplete = true,
            Items = ImmutableArray.Create(
                new CompletionItem
                {
                    Label = "Alpha",
                    TextEdit = Edit("Alpha", 2, 4, 2, 7),
                    InsertTextFormat = InsertTextFormat.PlainText,
                    SortText = "001",
                    FilterText = "AlphaFilter",
                    Kind = CompletionItemKind.Class,
                    Detail = "first detail",
                    Data = 0,
                    Preselect = false,
                    CommitCharacters = sharedCommits,
                },
                new CompletionItem
                {
                    Label = "Beta",
                    TextEdit = Edit("Beta($0)", 3, 1, 3, 5),
                    InsertTextFormat = InsertTextFormat.Snippet,
                    AdditionalTextEdits = ImmutableArray.Create(
                        Edit("using Example;\n", 0, 0, 0, 0),
                        Edit("// generated\n", 1, 0, 1, 2)),
                    SortText = "002",
                    FilterText = "BetaFilter",
                    Kind = CompletionItemKind.Method,
                    Detail = "second detail",
                    Data = 42,
                    Preselect = true,
                    CommitCharacters = ImmutableArray<char>.Empty,
                },
                new CompletionItem
                {
                    Label = "Gamma",
                    TextEdit = Edit("Gamma", 2, 4, 2, 7),
                    InsertTextFormat = InsertTextFormat.PlainText,
                    SortText = "003",
                    FilterText = "GammaFilter",
                    Kind = CompletionItemKind.Property,
                    Detail = null,
                    Data = 2,
                    Preselect = false,
                    CommitCharacters = sharedCommits,
                })
        };
    }

    private static LinePositionSpanTextChange Edit(
        string newText,
        int startLine,
        int startColumn,
        int endLine,
        int endColumn)
    {
        return new LinePositionSpanTextChange
        {
            NewText = newText,
            StartLine = startLine,
            StartColumn = startColumn,
            EndLine = endLine,
            EndColumn = endColumn,
        };
    }
}

internal static class CompactCompletionCodec
{
    public static CompletionResponse ExpandThroughJson(OmniSharpCompletionService.CompactCompletionResponse compact)
    {
        using var json = JsonDocument.Parse(CompletionFixture.SerializeToUtf8(compact));
        var root = json.RootElement;
        AssertEx.Equal(1, root.GetProperty("v").GetInt32(), "Compact protocol version");

        var defaultRange = ReadIntArray(root.GetProperty("r"));
        var commitSets = root.GetProperty("c")
            .EnumerateArray()
            .Select(element => element.GetString()?.ToCharArray() ?? Array.Empty<char>())
            .ToArray();
        var items = ImmutableArray.CreateBuilder<CompletionItem>();
        var index = 0;
        foreach (var encoded in root.GetProperty("i").EnumerateArray())
        {
            var fields = encoded.EnumerateArray().ToArray();
            AssertEx.Equal(12, fields.Length, $"Compact item {index} field count");
            var label = fields[0].GetString() ?? string.Empty;
            var range = fields[2].ValueKind == JsonValueKind.Null
                ? defaultRange
                : ReadIntArray(fields[2]);
            var newText = fields[1].ValueKind == JsonValueKind.Null
                ? label
                : fields[1].GetString() ?? string.Empty;
            var data = fields[9].ValueKind == JsonValueKind.Null
                ? index
                : fields[9].GetInt32();
            var commitSetIndex = fields[11].GetInt32();

            items.Add(new CompletionItem
            {
                Label = label,
                TextEdit = range.Length == 0 ? null : ReadEdit(newText, range),
                InsertTextFormat = fields[3].GetInt32() == 0
                    ? InsertTextFormat.PlainText
                    : (InsertTextFormat)fields[3].GetInt32(),
                AdditionalTextEdits = ReadAdditionalEdits(fields[4]),
                SortText = ReadNullableString(fields[5]),
                FilterText = ReadNullableString(fields[6]),
                Kind = (CompletionItemKind)fields[7].GetInt32(),
                Detail = ReadNullableString(fields[8]),
                Data = data,
                Preselect = fields[10].GetInt32() != 0,
                CommitCharacters = commitSets[commitSetIndex].ToImmutableArray(),
            });
            index++;
        }

        return new CompletionResponse
        {
            IsIncomplete = root.GetProperty("x").GetBoolean(),
            Items = items.ToImmutable(),
        };
    }

    private static IReadOnlyList<LinePositionSpanTextChange>? ReadAdditionalEdits(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return element.EnumerateArray()
            .Select(encoded =>
            {
                var values = encoded.EnumerateArray().ToArray();
                AssertEx.Equal(5, values.Length, "Compact additional edit field count");
                return new LinePositionSpanTextChange
                {
                    NewText = values[0].GetString() ?? string.Empty,
                    StartLine = values[1].GetInt32(),
                    StartColumn = values[2].GetInt32(),
                    EndLine = values[3].GetInt32(),
                    EndColumn = values[4].GetInt32(),
                };
            })
            .ToImmutableArray();
    }

    private static LinePositionSpanTextChange ReadEdit(string newText, IReadOnlyList<int> range)
    {
        AssertEx.Equal(4, range.Count, "Compact text-edit range field count");
        return new LinePositionSpanTextChange
        {
            NewText = newText,
            StartLine = range[0],
            StartColumn = range[1],
            EndLine = range[2],
            EndColumn = range[3],
        };
    }

    private static int[] ReadIntArray(JsonElement element)
    {
        return element.EnumerateArray().Select(value => value.GetInt32()).ToArray();
    }

    private static string? ReadNullableString(JsonElement element)
    {
        return element.ValueKind == JsonValueKind.Null ? null : element.GetString();
    }
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

    public MonacoService CreateMonacoService()
    {
        var service = new MonacoService();
        SetPrivateField(service, "_completionProject", Project);
        SetPrivateField(service, "_completionService", Service);
        return service;
    }

    public static CompletionFixture Create(IEnumerable<MetadataReference>? metadataReferences = null)
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

        var references = metadataReferences ??
            ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")
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
        var initialText = SourceText.From(string.Empty);
        var primaryDocument = workspace.AddDocument(
            roslynProject.Id,
            "Program.cs",
            initialText);
        var project = new OmniSharpProject("https://unused.invalid/")
        {
            Workspace = workspace,
            UseOnlyOnceDocument = primaryDocument,
            DocumentId = primaryDocument.Id,
        };
        SetPrivateField(project, "_initialized", true);
        SetPrivateField(project, "_primarySourceText", initialText);
        SetPrivateField(project, "_primaryDocumentText", string.Empty);

        var loggerFactory = LoggerFactory.Create(_ => { });
        var service = new OmniSharpCompletionService(
            workspace,
            new FormattingOptions(),
            loggerFactory);

        return new CompletionFixture(workspace, loggerFactory, project, service);
    }

    public Task<CompletionProbe> CompleteAsync(
        string markedSource,
        params OmniSharpProject.SourceFileSnapshot[] files)
    {
        return ProbeAsync(markedSource, files, completionListKey: null);
    }

    public Task<CompletionProbe> CompleteAsync(string markedSource, string completionListKey)
    {
        return ProbeAsync(markedSource, Array.Empty<OmniSharpProject.SourceFileSnapshot>(), completionListKey);
    }

    public Task<CompletionProbe> CompleteAsync(
        string markedSource,
        OmniSharpProject.SourceFileSnapshot[] files,
        string? completionListKey = null)
    {
        return ProbeAsync(markedSource, files, completionListKey);
    }

    public async Task<CompletionProbe> CompletePrimaryOnlyAsync(
        string markedSource,
        string? completionListKey = null)
    {
        var (source, cursorOffset) = RemoveCursor(markedSource);
        var started = Stopwatch.GetTimestamp();
        var document = await Project.UpdateDocumentAsync(source);
        return await ProbeExistingDocumentAsync(document, cursorOffset, completionListKey, started);
    }

    public Task<CompletionProbe> CompleteExistingDocumentAsync(
        Document document,
        int cursorOffset,
        string? completionListKey = null)
    {
        return ProbeExistingDocumentAsync(document, cursorOffset, completionListKey, Stopwatch.GetTimestamp());
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
        return await ProbeExistingDocumentAsync(document, cursorOffset, completionListKey, started);
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

    public static byte[] SerializeToUtf8(object value)
    {
        return JsonSerializer.SerializeToUtf8Bytes(value, JsonOptions);
    }

    public void Dispose()
    {
        _loggerFactory.Dispose();
        _workspace.Dispose();
    }

    private async Task<CompletionProbe> ProbeExistingDocumentAsync(
        Document document,
        int cursorOffset,
        string? completionListKey,
        long started)
    {
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
        var fullSerializedBytes = SerializeToUtf8(response).Length;
        var compactSerializedBytes = SerializeToUtf8(Service.Compact(response)).Length;
        var elapsed = Stopwatch.GetElapsedTime(started);
        return new CompletionProbe(
            response,
            document,
            elapsed,
            fullSerializedBytes,
            compactSerializedBytes);
    }

    private static void SetPrivateField(object target, string name, object? value)
    {
        var field = target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new InvalidOperationException(
                $"{target.GetType().Name} field '{name}' is unavailable to the test fixture.");
        field.SetValue(target, value);
    }
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

    public static void DoesNotContain(CompletionResponse response, string label)
    {
        if (response.Items.Any(candidate => string.Equals(candidate.Label, label, StringComparison.Ordinal)))
        {
            throw new RegressionFailureException($"Completion '{label}' must not be present.");
        }
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
    int FullSerializedBytes,
    int CompactSerializedBytes);

internal sealed record BenchmarkScenario(string Name, string Source, string ExpectedLabel);

internal static class HarnessConstants
{
    public const string CursorMarker = "<|>";
    public const string PrimaryPath = "src/Program.cs";
}

internal sealed record PublishedReferencePack(
    string Directory,
    IReadOnlyList<string> ManifestAssemblies,
    IReadOnlyDictionary<string, IReadOnlyList<string>> AssemblyReferences,
    IReadOnlyDictionary<string, IReadOnlyList<string>> Namespaces,
    string BundlePath,
    long BundleLength,
    string BundleSha256,
    IReadOnlyDictionary<string, PublishedReferenceSlice> BundleSlices,
    string DocumentationPath,
    long DocumentationLength,
    string DocumentationSha256)
{
    public static PublishedReferencePack Load()
    {
        var repositoryRoot = FindRepositoryRoot();
        var frameworkDirectory = Path.Combine(
            repositoryRoot,
            "vendor",
            "omnisharp-wasm",
            "publish",
            "wwwroot",
            "_framework");
        var referenceDirectory = Path.Combine(frameworkDirectory, "ref");
        var manifestPath = Path.Combine(frameworkDirectory, "codecraft-namespace-index.json");

        using var manifest = JsonDocument.Parse(File.ReadAllText(manifestPath));
        var manifestAssemblies = manifest.RootElement
            .GetProperty("assemblies")
            .EnumerateArray()
            .Select(element => element.GetString() ?? string.Empty)
            .ToArray();
        var assemblyReferences = ReadStringArrayMap(
            manifest.RootElement.GetProperty("assemblyReferences"));
        var namespaces = ReadStringArrayMap(manifest.RootElement.GetProperty("namespaces"));
        var referencePack = manifest.RootElement.GetProperty("referencePack");
        var documentation = manifest.RootElement.GetProperty("documentation");
        var bundleSlices = referencePack
            .GetProperty("assemblies")
            .EnumerateObject()
            .ToDictionary(
                property => property.Name,
                property => new PublishedReferenceSlice(
                    property.Value.GetProperty("offset").GetInt64(),
                    property.Value.GetProperty("length").GetInt32(),
                    property.Value.GetProperty("sha256").GetString() ?? string.Empty),
                StringComparer.Ordinal);

        return new PublishedReferencePack(
            referenceDirectory,
            manifestAssemblies,
            assemblyReferences,
            namespaces,
            Path.Combine(
                frameworkDirectory,
                referencePack.GetProperty("path").GetString() ?? string.Empty),
            referencePack.GetProperty("length").GetInt64(),
            referencePack.GetProperty("sha256").GetString() ?? string.Empty,
            bundleSlices,
            Path.Combine(
                Path.GetDirectoryName(frameworkDirectory)!,
                documentation.GetProperty("path").GetString() ?? string.Empty),
            documentation.GetProperty("length").GetInt64(),
            documentation.GetProperty("sha256").GetString() ?? string.Empty);
    }

    public MetadataReference[] CreateReferences(IEnumerable<string> assemblyNames)
    {
        var bundleBytes = File.ReadAllBytes(BundlePath);
        return assemblyNames
            .Distinct(StringComparer.Ordinal)
            .OrderBy(assemblyName => assemblyName, StringComparer.Ordinal)
            .Select(assemblyName =>
            {
                if (!BundleSlices.TryGetValue(assemblyName, out var slice) ||
                    slice.Offset < 0 ||
                    slice.Length <= 0 ||
                    slice.Offset > bundleBytes.LongLength - slice.Length)
                {
                    throw new InvalidOperationException(
                        $"Reference-pack slice for '{assemblyName}' is unavailable.");
                }

                var sliceBytes = new byte[slice.Length];
                Buffer.BlockCopy(
                    bundleBytes,
                    checked((int)slice.Offset),
                    sliceBytes,
                    0,
                    slice.Length);
                return MetadataReference.CreateFromImage(ImmutableArray.CreateRange(sliceBytes));
            })
            .ToArray();
    }

    private static IReadOnlyDictionary<string, IReadOnlyList<string>> ReadStringArrayMap(
        JsonElement element)
    {
        return element.EnumerateObject().ToDictionary(
            property => property.Name,
            property => (IReadOnlyList<string>)property.Value
                .EnumerateArray()
                .Select(value => value.GetString() ?? string.Empty)
                .ToArray(),
            StringComparer.Ordinal);
    }

    private static string FindRepositoryRoot()
    {
        foreach (var startPath in new[] { Environment.CurrentDirectory, AppContext.BaseDirectory })
        {
            var directory = new DirectoryInfo(startPath);
            while (directory != null)
            {
                if (File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                    System.IO.Directory.Exists(Path.Combine(directory.FullName, "vendor", "omnisharp-wasm")))
                {
                    return directory.FullName;
                }

                directory = directory.Parent;
            }
        }

        throw new InvalidOperationException("Could not locate the CodeCraft repository root.");
    }
}

internal sealed record PublishedReferenceSlice(long Offset, int Length, string Sha256);
