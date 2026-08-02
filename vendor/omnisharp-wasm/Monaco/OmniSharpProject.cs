using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

using CodeCraft.CSharp;
using CodeCraft.OmniSharpWasm.Interop;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;

internal static class CooperativeMetadataWork
{
    // SHA-256 and Buffer.BlockCopy are managed CPU work in browser WASM. Keep each
    // uninterrupted unit deliberately tiny so a posted authoring request can run
    // between chunks instead of waiting behind a large reference or XML document.
    internal const int ChunkSize = 16 * 1024;
    internal static async Task<bool> HashMatchesAsync(
        byte[] bytes,
        string expectedHash,
        Func<bool>? cancellationRequested = null)
    {
        if (cancellationRequested?.Invoke() == true)
        {
            return false;
        }

        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        for (var offset = 0; offset < bytes.Length; offset += ChunkSize)
        {
            var count = Math.Min(ChunkSize, bytes.Length - offset);
            hash.AppendData(bytes, offset, count);

            await BrowserStaticAssetLoader.YieldToBrowserAsync();
            if (cancellationRequested?.Invoke() == true)
            {
                return false;
            }
        }

        return Convert.ToHexString(hash.GetHashAndReset())
            .Equals(expectedHash, StringComparison.OrdinalIgnoreCase);
    }

    internal static async Task<byte[]?> CopyVerifiedSliceAsync(
        byte[] source,
        int sourceOffset,
        int length,
        string expectedHash,
        Func<bool> cancellationRequested)
    {
        if (length <= 0 ||
            sourceOffset < 0 ||
            sourceOffset > source.Length - length ||
            cancellationRequested())
        {
            return null;
        }

        var copy = new byte[length];
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        for (var copied = 0; copied < length; copied += ChunkSize)
        {
            var count = Math.Min(ChunkSize, length - copied);
            Buffer.BlockCopy(source, sourceOffset + copied, copy, copied, count);
            hash.AppendData(copy, copied, count);

            await BrowserStaticAssetLoader.YieldToBrowserAsync();
            if (cancellationRequested())
            {
                return null;
            }
        }

        return Convert.ToHexString(hash.GetHashAndReset())
            .Equals(expectedHash, StringComparison.OrdinalIgnoreCase)
            ? copy
            : null;
    }
}

public class AssemblyMetadataHelper
{
    private static readonly TimeSpan StaticAssetRequestTimeout = TimeSpan.FromSeconds(30);
    private const int MaximumStaticAssetBytes = 32 * 1024 * 1024;
    private const int MaximumNamespaceIndexBytes = 4 * 1024 * 1024;
    private const int MaximumDocumentationBytes = 8 * 1024 * 1024;
    private readonly HttpClient _httpClient;
    private readonly object _documentationGate = new();
    private Task<DocumentationProvider?>? _documentationProviderTask;

    public AssemblyMetadataHelper(string uri)
    {
        _httpClient = new HttpClient { BaseAddress = new Uri(uri, UriKind.Absolute) };
    }

    public Task<byte[]?> GetReferencePackBytes(int expectedLength)
    {
        if (expectedLength <= 0 || expectedLength > MaximumStaticAssetBytes)
        {
            return Task.FromResult<byte[]?>(null);
        }

        return GetStaticAssetBytesAsync(
            "./_framework/codecraft-reference-pack.bin",
            "the compiler reference pack",
            required: true,
            expectedLength);
    }

    private async Task<byte[]?> GetStaticAssetBytesAsync(
        string relativeUrl,
        string resourceName,
        bool required,
        int maximumLength)
    {
        if (OperatingSystem.IsBrowser())
        {
            try
            {
                var absoluteUrl = new Uri(_httpClient.BaseAddress!, relativeUrl).AbsoluteUri;
                var bytes = await BrowserStaticAssetLoader.LoadBytesAsync(
                    absoluteUrl,
                    checked((int)StaticAssetRequestTimeout.TotalMilliseconds),
                    maximumLength);
                if (bytes != null)
                {
                    return bytes;
                }

                if (required)
                {
                    Console.WriteLine($"Native transfer returned no bytes for {resourceName}; a bounded native retry will be attempted.");
                }
            }
            catch (Exception e)
            {
                if (required)
                {
                    Console.WriteLine($"Native transfer failed for {resourceName}; a bounded native retry will be attempted: {e.Message}");
                }
            }

            // The managed HttpClient body bridge is precisely the browser path this
            // native loader replaces. Retrying through it duplicates network work and
            // can stall despite cancellation; a later bounded asset retry is safer.
            return null;
        }

        var managedBytes = await TryGetBytesAsync(
            relativeUrl,
            resourceName,
            required);
        if (managedBytes?.Length > maximumLength)
        {
            if (required)
            {
                Console.WriteLine($"Ignoring oversized {resourceName} ({managedBytes.Length} bytes).");
            }

            return null;
        }

        return managedBytes;
    }

    public async Task<DocumentationProvider?> GetSystemRuntimeDocumentationProvider(
        StaticAssetFile? documentation)
    {
        Task<DocumentationProvider?> task;
        lock (_documentationGate)
        {
            task = _documentationProviderTask ??=
                LoadSystemRuntimeDocumentationProviderAsync(documentation);
        }

        try
        {
            var provider = await task;
            if (provider != null || documentation == null)
            {
                return provider;
            }

            // A transient static-host/service-worker race must not permanently poison the
            // one immutable documentation request. Startup owns bounded retries and only a
            // successfully validated provider is retained for the lifetime of the worker.
            lock (_documentationGate)
            {
                if (ReferenceEquals(_documentationProviderTask, task))
                {
                    _documentationProviderTask = null;
                }
            }
            return null;
        }
        catch
        {
            lock (_documentationGate)
            {
                if (ReferenceEquals(_documentationProviderTask, task))
                {
                    _documentationProviderTask = null;
                }
            }
            throw;
        }
    }

    private async Task<DocumentationProvider?> LoadSystemRuntimeDocumentationProviderAsync(
        StaticAssetFile? documentation)
    {
        if (documentation == null)
        {
            return null;
        }

        var documentationBytes = await GetStaticAssetBytesAsync(
            "./System.Runtime.xml",
            "System.Runtime XML documentation",
            required: false,
            documentation.Length);
        if (documentationBytes == null)
        {
            return null;
        }

        // The JavaScript sidecar path validates before returning, but its compatibility
        // fallback intentionally uses the raw static response. Revalidate in managed code
        // so old browsers and sidecar failures cannot install stale or corrupt XML.
        if (!await StaticAssetMatchesManifestCooperativelyAsync(
                documentationBytes,
                documentation))
        {
            Console.WriteLine(
                "Ignoring System.Runtime XML documentation that does not match its static manifest.");
            return null;
        }

        try
        {
            return XmlDocumentationProvider.CreateFromBytes(documentationBytes);
        }
        catch (Exception e)
        {
            Console.WriteLine($"Could not load System.Runtime XML documentation: {e.Message}");
            return null;
        }
    }

    public async Task<ReferencePackIndex> GetNamespaceIndex()
    {
        const string namespaceIndexUrl = "./_framework/codecraft-namespace-index.json";

        try
        {
            var indexBytes = await GetStaticAssetBytesAsync(
                namespaceIndexUrl,
                "the compiler namespace index",
                required: true,
                MaximumNamespaceIndexBytes);
            if (indexBytes == null)
            {
                return ReferencePackIndex.Empty;
            }

            var index = JsonSerializer.Deserialize<NamespaceIndexDocument>(
                indexBytes,
                NamespaceIndexJsonOptions);

            if (index?.Assemblies == null ||
                index.AssemblyReferences == null ||
                index.Namespaces == null ||
                index.ReferencePack == null)
            {
                Console.WriteLine("Reference-pack index is empty or missing its manifest.");
                return ReferencePackIndex.Empty;
            }

            var assemblyNames = index.Assemblies
                .Where(assemblyName => !string.IsNullOrWhiteSpace(assemblyName))
                .Distinct(StringComparer.Ordinal)
                .OrderBy(assemblyName => assemblyName, StringComparer.Ordinal)
                .ToArray();
            if (assemblyNames.Length == 0 || assemblyNames.Length != index.Assemblies.Length)
            {
                Console.WriteLine("Reference-pack manifest contains empty or duplicate assembly names.");
                return ReferencePackIndex.Empty;
            }

            var manifest = new HashSet<string>(assemblyNames, StringComparer.Ordinal);
            if (index.AssemblyReferences.Count != assemblyNames.Length)
            {
                Console.WriteLine("Reference-pack dependency graph does not match its manifest.");
                return ReferencePackIndex.Empty;
            }

            var assemblyReferences = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
            foreach (var assemblyName in assemblyNames)
            {
                if (!index.AssemblyReferences.TryGetValue(assemblyName, out var rawDependencies) ||
                    rawDependencies == null)
                {
                    Console.WriteLine($"Reference-pack dependencies for '{assemblyName}' are missing.");
                    return ReferencePackIndex.Empty;
                }

                var dependencies = rawDependencies
                    .Where(dependency => !string.IsNullOrWhiteSpace(dependency))
                    .Distinct(StringComparer.Ordinal)
                    .OrderBy(dependency => dependency, StringComparer.Ordinal)
                    .ToArray();
                if (dependencies.Length != rawDependencies.Length ||
                    dependencies.Any(dependency => !manifest.Contains(dependency)))
                {
                    Console.WriteLine($"Reference-pack dependencies for '{assemblyName}' are invalid.");
                    return ReferencePackIndex.Empty;
                }

                assemblyReferences[assemblyName] = dependencies;
            }

            var rawReferencePack = index.ReferencePack;
            if (!rawReferencePack.Path.Equals("codecraft-reference-pack.bin", StringComparison.Ordinal) ||
                rawReferencePack.Length is <= 0 or > int.MaxValue ||
                !IsSha256(rawReferencePack.Sha256) ||
                rawReferencePack.Assemblies == null ||
                rawReferencePack.Assemblies.Count != assemblyNames.Length)
            {
                Console.WriteLine("Reference-pack binary manifest is invalid.");
                return ReferencePackIndex.Empty;
            }

            var slices = new Dictionary<string, ReferencePackSlice>(StringComparer.Ordinal);
            long expectedOffset = 0;
            foreach (var assemblyName in assemblyNames)
            {
                if (!rawReferencePack.Assemblies.TryGetValue(assemblyName, out var rawSlice) ||
                    rawSlice == null ||
                    rawSlice.Offset != expectedOffset ||
                    rawSlice.Length <= 0 ||
                    !IsSha256(rawSlice.Sha256))
                {
                    Console.WriteLine($"Reference-pack slice for '{assemblyName}' is invalid.");
                    return ReferencePackIndex.Empty;
                }

                expectedOffset = checked(expectedOffset + rawSlice.Length);
                if (expectedOffset > rawReferencePack.Length)
                {
                    Console.WriteLine($"Reference-pack slice for '{assemblyName}' exceeds the binary asset.");
                    return ReferencePackIndex.Empty;
                }

                slices[assemblyName] = new ReferencePackSlice(
                    checked((int)rawSlice.Offset),
                    rawSlice.Length,
                    rawSlice.Sha256);
            }

            if (expectedOffset != rawReferencePack.Length)
            {
                Console.WriteLine("Reference-pack slices do not exactly cover the binary asset.");
                return ReferencePackIndex.Empty;
            }

            StaticAssetFile? documentation = null;
            if (index.Documentation != null)
            {
                var rawDocumentation = index.Documentation;
                if (rawDocumentation.Path.Equals("System.Runtime.xml", StringComparison.Ordinal) &&
                    rawDocumentation.Length is > 0 and <= MaximumDocumentationBytes &&
                    IsSha256(rawDocumentation.Sha256))
                {
                    documentation = new StaticAssetFile(
                        rawDocumentation.Path,
                        checked((int)rawDocumentation.Length),
                        rawDocumentation.Sha256);
                }
                else
                {
                    // Documentation is optional and must never prevent the compiler pack
                    // from starting, but malformed metadata must not authorize raw XML.
                    Console.WriteLine(
                        "Ignoring invalid System.Runtime XML documentation manifest metadata.");
                }
            }

            var namespaces = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
            foreach (var (namespaceName, rawAssemblyNames) in index.Namespaces)
            {
                if (string.IsNullOrWhiteSpace(namespaceName) || rawAssemblyNames == null)
                {
                    Console.WriteLine("Reference-pack namespace index contains an invalid entry.");
                    return ReferencePackIndex.Empty;
                }

                var namespaceAssemblyNames = rawAssemblyNames
                    .Where(assemblyName => !string.IsNullOrWhiteSpace(assemblyName))
                    .Distinct(StringComparer.Ordinal)
                    .OrderBy(assemblyName => assemblyName, StringComparer.Ordinal)
                    .ToArray();
                if (namespaceAssemblyNames.Length != rawAssemblyNames.Length ||
                    namespaceAssemblyNames.Any(assemblyName => !manifest.Contains(assemblyName)))
                {
                    Console.WriteLine($"Reference-pack namespace '{namespaceName}' contains an invalid asset.");
                    return ReferencePackIndex.Empty;
                }

                namespaces[namespaceName] = namespaceAssemblyNames;
            }

            return namespaces.Count == 0
                ? ReferencePackIndex.Empty
                : new ReferencePackIndex(
                    assemblyNames,
                    assemblyReferences,
                    namespaces,
                    new ReferencePackFile(
                        checked((int)rawReferencePack.Length),
                        rawReferencePack.Sha256,
                        slices),
                    documentation);
        }
        catch (Exception e)
        {
            Console.WriteLine($"Error fetching namespace index: {e.Message}");
            return ReferencePackIndex.Empty;
        }
    }

    private async Task<byte[]?> TryGetBytesAsync(string relativeUrl, string resourceName, bool required)
    {
        try
        {
            return await FetchBytesCoreAsync(relativeUrl, resourceName, required)
                .WaitAsync(StaticAssetRequestTimeout);
        }
        catch (Exception e)
        {
            if (required)
            {
                Console.WriteLine($"Error fetching metadata {resourceName}: {e.Message}");
            }

            return null;
        }
    }

    private async Task<byte[]?> FetchBytesCoreAsync(
        string relativeUrl,
        string resourceName,
        bool required)
    {
        try
        {
            using var requestCancellation = new CancellationTokenSource(StaticAssetRequestTimeout);
            using var response = await _httpClient.GetAsync(
                relativeUrl,
                HttpCompletionOption.ResponseContentRead,
                requestCancellation.Token);
            if (!response.IsSuccessStatusCode)
            {
                if (required)
                {
                    Console.WriteLine($"Could not fetch {resourceName}: {response.StatusCode}");
                }

                return null;
            }

            return await response.Content.ReadAsByteArrayAsync(requestCancellation.Token);
        }
        catch (Exception e)
        {
            if (required)
            {
                Console.WriteLine($"Error fetching metadata {resourceName}: {e.Message}");
            }

            return null;
        }
    }

    private static readonly JsonSerializerOptions NamespaceIndexJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static bool IsSha256(string? value)
    {
        return value is { Length: 64 } && value.All(Uri.IsHexDigit);
    }

    private static bool StaticAssetMatchesManifest(byte[] bytes, StaticAssetFile manifest)
    {
        return bytes.Length == manifest.Length &&
               Convert.ToHexString(SHA256.HashData(bytes))
                   .Equals(manifest.Sha256, StringComparison.OrdinalIgnoreCase);
    }

    private static Task<bool> StaticAssetMatchesManifestCooperativelyAsync(
        byte[] bytes,
        StaticAssetFile manifest)
    {
        return bytes.Length == manifest.Length
            ? CooperativeMetadataWork.HashMatchesAsync(bytes, manifest.Sha256)
            : Task.FromResult(false);
    }

}

public sealed record NamespaceIndexDocument(
    string[] Assemblies,
    Dictionary<string, string[]> AssemblyReferences,
    ReferencePackDocument ReferencePack,
    StaticAssetDocument? Documentation,
    Dictionary<string, string[]> Namespaces);

public sealed record StaticAssetDocument(
    string Path,
    long Length,
    string Sha256);

public sealed record ReferencePackDocument(
    string Path,
    long Length,
    string Sha256,
    Dictionary<string, ReferencePackSliceDocument> Assemblies);

public sealed record ReferencePackSliceDocument(
    long Offset,
    int Length,
    string Sha256);

public sealed record ReferencePackIndex(
    IReadOnlyList<string> Assemblies,
    IReadOnlyDictionary<string, IReadOnlyList<string>> AssemblyReferences,
    IReadOnlyDictionary<string, IReadOnlyList<string>> Namespaces,
    ReferencePackFile ReferencePack,
    StaticAssetFile? Documentation)
{
    public static readonly ReferencePackIndex Empty = new(
        Array.Empty<string>(),
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal),
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal),
        ReferencePackFile.Empty,
        null);
}

public sealed record ReferencePackFile(
    int Length,
    string Sha256,
    IReadOnlyDictionary<string, ReferencePackSlice> Assemblies)
{
    public static readonly ReferencePackFile Empty = new(
        0,
        string.Empty,
        new Dictionary<string, ReferencePackSlice>(StringComparer.Ordinal));
}

public sealed record ReferencePackSlice(int Offset, int Length, string Sha256);

public sealed record StaticAssetFile(string Path, int Length, string Sha256);

public class OmniSharpProject
{
    public record NamespaceIncludeResult(
        string NamespaceName,
        IReadOnlyList<string> AddedAssemblies,
        IReadOnlyList<string> MatchedAssemblies,
        bool Success,
        string Message);

    public sealed record MetadataHydrationState(
        int Version,
        bool FullyHydrated,
        bool HydrationRunning);

    public sealed record MetadataHydrationCommitResult(bool Committed, bool Warmed);

    public record SourceFileSnapshot(string Path, string Content);

    public sealed record IncrementalTextChange(int Start, int Length, string NewText);

    public sealed record IncrementalUpdateResult(
        bool Success,
        bool RequiresFullSync,
        Document? Document,
        long Version,
        int TextLength,
        string Message);

    private readonly record struct MetadataSnapshot(
        int Version,
        IReadOnlyList<MetadataReference> References);

    private sealed class StaticSiteState
    {
        private readonly object _gate = new();
        private readonly AssemblyMetadataHelper _metadataHelper;
        private readonly object _namespaceIndexGate = new();
        private readonly SemaphoreSlim _initializationGate = new(1, 1);
        private readonly SemaphoreSlim _referenceMaterializationGate = new(1, 1);
        private readonly ConcurrentDictionary<string, IReadOnlyList<string>> _namespaceMatches =
            new(StringComparer.Ordinal);
        private readonly ConcurrentDictionary<string, byte> _promotedNamespaces =
            new(StringComparer.Ordinal);
        private readonly ConcurrentDictionary<string, Lazy<MetadataReference?>> _referenceMaterializations =
            new(StringComparer.Ordinal);
        private readonly SortedDictionary<string, MetadataReference> _metadataReferences =
            new(StringComparer.Ordinal);
        private readonly List<WeakReference<OmniSharpProject>> _projects = new();
        private Task<ReferencePackIndex>? _namespaceIndexTask;
        private ReferencePackIndex _referencePackIndex = ReferencePackIndex.Empty;
        private byte[]? _referencePackBytes;
        private DocumentationProvider? _documentationProvider;
        private volatile bool _staticAssetsLoaded;
        private volatile bool _staticAssetsComplete;
        private volatile bool _initializationComplete;
        private volatile HydrationPublication _hydrationPublication = new(0, false, false);
        private volatile bool _backgroundPackCommitted;
        private int _backgroundHydrationStarted;
        private int _interactivePriorityEpoch;
        private int _metadataVersion;

        private sealed record HydrationPublication(
            int Version,
            bool FullyHydrated,
            bool HydrationRunning);

        public StaticSiteState(string uri)
        {
            _metadataHelper = new AssemblyMetadataHelper(uri);
        }

        public async Task EnsureInitializedAsync()
        {
            if (_initializationComplete)
            {
                return;
            }

            await EnsureStaticAssetsValidatedAsync();
            if (!_staticAssetsComplete)
            {
                return;
            }

            await _initializationGate.WaitAsync();
            try
            {
                if (_initializationComplete)
                {
                    return;
                }

                // A complete static website has the whole immutable reference universe
                // locally available. Build it as one atomic metadata generation before
                // readiness instead of publishing a small generation and replacing it
                // later: completion caches never cross a metadata transition, every
                // namespace is immediately available, and System.Runtime is created only
                // once with its verified XML documentation attached.
                for (var attempt = 0; attempt < StaticPackInitializationAttempts; attempt++)
                {
                    var index = _referencePackIndex;
                    var packBytes = _referencePackBytes;
                    var documentationProvider =
                        await _metadataHelper.GetSystemRuntimeDocumentationProvider(
                            index.Documentation);
                    var documentationReady =
                        index.Documentation != null && documentationProvider != null;
                    var references = documentationReady &&
                                     packBytes != null &&
                                     packBytes.Length == index.ReferencePack.Length
                        ? await TryCreateReferencePackMetadataCooperativelyAsync(
                            index,
                            packBytes,
                            documentationProvider!,
                            index.Assemblies)
                        : null;
                    if (references?.Count == index.Assemblies.Count)
                    {
                        _documentationProvider = documentationProvider;
                        var documentedSystemRuntime = documentationProvider != null &&
                            references.TryGetValue("System.Runtime", out var systemRuntime)
                                ? systemRuntime
                                : null;
                        var installed = InstallReferencePackMetadata(
                            references,
                            documentedSystemRuntime,
                            applyToRegisteredProjects: true);
                        if (installed && ContainsAllMetadataReferences(index.Assemblies))
                        {
                            _backgroundPackCommitted = true;
                            // Every immutable MetadataReference owns its exact slice now.
                            // Release the 3.8 MiB monolithic source image before publishing
                            // readiness to offset the eager metadata objects in browser RAM.
                            _referencePackBytes = null;
                            _hydrationPublication = new HydrationPublication(
                                MetadataVersion,
                                FullyHydrated: true,
                                HydrationRunning: false);
                            // This volatile publication is the final readiness fence: any
                            // caller that observes initialization also observes the full
                            // reference generation, released pack bytes and hydration state.
                            _initializationComplete = true;
                            return;
                        }
                    }

                    if (attempt + 1 < StaticPackInitializationAttempts)
                    {
                        // Failed manifest/pack fetches do not poison either cache. A short
                        // timer-backed retry recovers transient static-host/service-worker
                        // races without ever constructing a metadata-less workspace.
                        await Task.Delay(100 * (1 << attempt));
                    }
                }

                throw new InvalidOperationException(
                    "The complete documented static C# reference pack could not be materialized before readiness.");
            }
            finally
            {
                _initializationGate.Release();
            }
        }

        public async Task EnsureStaticAssetsLoadedAsync()
        {
            if (_staticAssetsLoaded)
            {
                return;
            }

            await _initializationGate.WaitAsync();
            try
            {
                if (_staticAssetsLoaded)
                {
                    return;
                }

                for (var attempt = 0; attempt < StaticPackInitializationAttempts; attempt++)
                {
                    _staticAssetsLoaded = await LoadStaticAssetBytesCoreAsync();
                    BrowserStaticAssetLoader.ReportPhase("static-site-load-completed");
                    if (_staticAssetsLoaded)
                    {
                        return;
                    }

                    if (attempt + 1 < StaticPackInitializationAttempts)
                    {
                        await Task.Delay(100 * (1 << attempt));
                    }
                }

                throw new InvalidOperationException(
                    "The static C# reference-pack assets could not be loaded after bounded retries.");
            }
            finally
            {
                _initializationGate.Release();
                BrowserStaticAssetLoader.ReportPhase("static-site-gate-released");
            }
        }

        public async Task EnsureStaticAssetsValidatedAsync()
        {
            if (_staticAssetsComplete)
            {
                return;
            }

            await EnsureStaticAssetsLoadedAsync();
            await _initializationGate.WaitAsync();
            try
            {
                if (_staticAssetsComplete)
                {
                    return;
                }

                var namespaceIndex = _referencePackIndex;
                var referencePackBytes = _referencePackBytes;
                if (_staticAssetsLoaded &&
                    referencePackBytes != null &&
                    ValidateReferencePack(namespaceIndex, referencePackBytes))
                {
                    _staticAssetsComplete = true;
                    return;
                }

                _staticAssetsLoaded = false;
                _referencePackIndex = ReferencePackIndex.Empty;
                _referencePackBytes = null;
                lock (_namespaceIndexGate)
                {
                    _namespaceIndexTask = null;
                }
            }
            finally
            {
                _initializationGate.Release();
            }

            throw new InvalidOperationException(
                "The static C# reference pack failed cryptographic or PE identity validation.");
        }

        public bool IsInitialized => _initializationComplete;

        public bool IsFullyHydrated => _hydrationPublication.FullyHydrated;

        public bool IsHydrationRunning => _hydrationPublication.HydrationRunning;

        public int NotifiableMetadataVersion => _hydrationPublication.Version;

        public bool IsNamespacePromoted(string namespaceCandidate)
        {
            return _promotedNamespaces.ContainsKey(
                NormalizeNamespaceCandidate(namespaceCandidate));
        }

        public bool IsNamespacePromotedOrCompleted(
            string namespaceCandidate,
            IReadOnlySet<string> completedNamespaces)
        {
            var normalized = NormalizeNamespaceCandidate(namespaceCandidate);
            return _promotedNamespaces.ContainsKey(normalized) ||
                   completedNamespaces.Contains(normalized);
        }

        public int MetadataVersion
        {
            get
            {
                lock (_gate)
                {
                    return _metadataVersion;
                }
            }
        }

        public async Task<IReadOnlyList<string>> GetAssemblyNamesForNamespaceAsync(string namespaceName)
        {
            var namespaceIndex = await GetNamespaceIndexAsync();
            if (namespaceIndex.Namespaces.Count == 0)
            {
                // Empty indexes are deliberately retryable; do not poison the derived
                // namespace cache with a transient HTTP failure.
                return Array.Empty<string>();
            }

            return _namespaceMatches.GetOrAdd(
                namespaceName,
                key => FindAssemblyNames(namespaceIndex.Namespaces, key));
        }

        public async Task<IReadOnlyList<string>> GetAssemblyNamesForExactNamespaceAsync(
            string namespaceName)
        {
            var namespaceIndex = await GetNamespaceIndexAsync();
            return namespaceIndex.Namespaces.TryGetValue(namespaceName, out var assemblyNames)
                ? assemblyNames
                : Array.Empty<string>();
        }

        public async Task<IReadOnlySet<string>> PromoteNamespacesAsync(
            IEnumerable<string> namespaceCandidates)
        {
            if (!_initializationComplete)
            {
                return new HashSet<string>(StringComparer.Ordinal);
            }

            var namespaceIndex = _referencePackIndex;
            var pendingNamespaces = namespaceCandidates
                .Select(NormalizeNamespaceCandidate)
                .Where(namespaceName => namespaceName.Length > 0)
                .Distinct(StringComparer.Ordinal)
                .Where(namespaceName => !_promotedNamespaces.ContainsKey(namespaceName))
                .OrderBy(namespaceName => namespaceName, StringComparer.Ordinal)
                .ToArray();
            if (pendingNamespaces.Length == 0)
            {
                return new HashSet<string>(StringComparer.Ordinal);
            }

            var matches = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
            var assemblyNames = new SortedSet<string>(StringComparer.Ordinal);
            foreach (var namespaceName in pendingNamespaces)
            {
                var matchingAssemblies = FindAssemblyNamesForLongestNamespacePrefix(
                    namespaceIndex.Namespaces,
                    namespaceName);
                matches[namespaceName] = matchingAssemblies;
                assemblyNames.UnionWith(matchingAssemblies);
            }

            if (assemblyNames.Count > 0)
            {
                await AddMetadataReferencesAsync(assemblyNames);
            }

            var completedNamespaces = new HashSet<string>(StringComparer.Ordinal);
            foreach (var (namespaceName, matchingAssemblies) in matches)
            {
                // Empty matches are stable because the validated static manifest is immutable.
                // Non-empty matches are cached only after their complete dependency closure is
                // installed, so a transient materialization failure remains retryable.
                if (matchingAssemblies.Count == 0)
                {
                    // Do not retain arbitrary member chains such as `client.GetAsync` in a
                    // process-wide negative cache. The document cache drops this completed
                    // candidate without growing global state for large projects.
                    completedNamespaces.Add(namespaceName);
                }
                else if (ContainsAllMetadataReferences(matchingAssemblies))
                {
                    _promotedNamespaces.TryAdd(namespaceName, 0);
                    completedNamespaces.Add(namespaceName);
                }
            }

            return completedNamespaces;
        }

        public MetadataSnapshot GetMetadataSnapshot()
        {
            lock (_gate)
            {
                return CreateMetadataSnapshotLocked();
            }
        }

        public bool ContainsAllMetadataReferences(IEnumerable<string> assemblyNames)
        {
            lock (_gate)
            {
                return assemblyNames.All(_metadataReferences.ContainsKey);
            }
        }

        public bool ApplyCurrentMetadataToAllProjects()
        {
            MetadataSnapshot snapshot;
            List<OmniSharpProject> projects;
            lock (_gate)
            {
                snapshot = CreateMetadataSnapshotLocked();
                projects = GetLiveProjectsLocked();
            }

            var success = true;
            foreach (var project in projects)
            {
                success &= project.ApplyMetadataReferencesToWorkspace(snapshot);
            }

            return success;
        }

        public void Register(OmniSharpProject project)
        {
            MetadataSnapshot snapshot;
            lock (_gate)
            {
                RemoveDeadProjectsLocked();
                if (!_projects.Any(reference =>
                        reference.TryGetTarget(out var target) && ReferenceEquals(target, project)))
                {
                    _projects.Add(new WeakReference<OmniSharpProject>(project));
                }

                snapshot = CreateMetadataSnapshotLocked();
            }

            // Applying after registration closes both races: additions before registration
            // are in the snapshot, and additions after registration notify this project.
            project.ApplyMetadataReferencesToWorkspace(snapshot);
        }

        public void BeginBackgroundHydration(
            Func<Func<Task<bool>>, Func<bool>, Task<MetadataHydrationCommitResult>>
                commitAndWarmFullReferenceCompletionAsync)
        {
            if (!_initializationComplete || IsFullyHydrated)
            {
                return;
            }

            if (Interlocked.Exchange(ref _backgroundHydrationStarted, 1) != 0)
            {
                return;
            }

            var interactivePriorityEpoch = Volatile.Read(ref _interactivePriorityEpoch);
            _hydrationPublication = new HydrationPublication(MetadataVersion, false, true);

            _ = HydrateReferencePackInBackgroundAsync(
                commitAndWarmFullReferenceCompletionAsync,
                interactivePriorityEpoch);
        }

        public void RequestInteractivePriority()
        {
            if (IsHydrationRunning)
            {
                Interlocked.Increment(ref _interactivePriorityEpoch);
            }
        }

        private bool InteractivePriorityRequested(int hydrationEpoch)
        {
            return Volatile.Read(ref _interactivePriorityEpoch) != hydrationEpoch;
        }

        private async Task HydrateReferencePackInBackgroundAsync(
            Func<Func<Task<bool>>, Func<bool>, Task<MetadataHydrationCommitResult>>
                commitAndWarmFullReferenceCompletionAsync,
            int interactivePriorityEpoch)
        {
            try
            {
                // Yield to the browser timer queue before doing any optional work. The
                // service posts its initialization notification before starting hydration.
                await BrowserStaticAssetLoader.YieldToBrowserAsync();
                if (InteractivePriorityRequested(interactivePriorityEpoch))
                {
                    return;
                }
                MetadataHydrationCommitResult hydrationResult;
                if (_backgroundPackCommitted)
                {
                    // A prior attempt committed every reference but failed provider warm-up.
                    // Retry only the warm step; never replace metadata or advance the version
                    // again for an identical full-reference universe.
                    hydrationResult = await commitAndWarmFullReferenceCompletionAsync(
                        () => Task.FromResult(true),
                        () => InteractivePriorityRequested(interactivePriorityEpoch));
                }
                else
                {
                    var documentationTask = _metadataHelper.GetSystemRuntimeDocumentationProvider(
                        _referencePackIndex.Documentation);
                    var pendingReferences = new SortedDictionary<string, MetadataReference>(StringComparer.Ordinal);
                    var materializedSinceYield = 0;

                    foreach (var assemblyName in OrderBackgroundHydrationAssemblies(
                                 _referencePackIndex))
                    {
                        if (InteractivePriorityRequested(interactivePriorityEpoch))
                        {
                            return;
                        }
                        lock (_gate)
                        {
                            if (_metadataReferences.ContainsKey(assemblyName))
                            {
                                continue;
                            }
                        }

                        var materializedReference =
                            await TryGetCachedReferencePackMetadataCooperativelyAsync(
                                assemblyName,
                                interactivePriorityEpoch);
                        if (materializedReference == null)
                        {
                            return;
                        }

                        pendingReferences[assemblyName] = materializedReference;
                        materializedSinceYield++;
                        if (materializedSinceYield >= BackgroundMaterializationBatchSize)
                        {
                            materializedSinceYield = 0;
                            // A real timer yield lets completion/demand promotion run first on
                            // single-threaded WASM; Task.Run would not provide that guarantee.
                            await BrowserStaticAssetLoader.YieldToBrowserAsync();
                            if (InteractivePriorityRequested(interactivePriorityEpoch))
                            {
                                return;
                            }
                        }
                    }

                    var documentationProvider = await documentationTask;
                    if (InteractivePriorityRequested(interactivePriorityEpoch))
                    {
                        return;
                    }
                    MetadataReference? documentedSystemRuntime = null;
                    if (documentationProvider != null)
                    {
                        documentedSystemRuntime =
                            await TryCreateReferencePackMetadataReferenceCooperativelyAsync(
                                "System.Runtime",
                                documentationProvider,
                                interactivePriorityEpoch);
                        if (documentedSystemRuntime == null)
                        {
                            return;
                        }
                    }

                    hydrationResult = await commitAndWarmFullReferenceCompletionAsync(
                        async () =>
                        {
                            await _referenceMaterializationGate.WaitAsync();
                            try
                            {
                                if (InteractivePriorityRequested(interactivePriorityEpoch))
                                {
                                    return false;
                                }
                                _documentationProvider = documentationProvider;
                                var allProjectsApplied = CommitBackgroundReferencePack(
                                    pendingReferences,
                                    documentedSystemRuntime);
                                allProjectsApplied &= ApplyCurrentMetadataToAllProjects();
                                if (documentedSystemRuntime != null)
                                {
                                    _referenceMaterializations["System.Runtime"] =
                                        new Lazy<MetadataReference?>(() => documentedSystemRuntime);
                                }

                                return allProjectsApplied &&
                                       ContainsAllMetadataReferences(_referencePackIndex.Assemblies);
                            }
                            finally
                            {
                                _referenceMaterializationGate.Release();
                            }
                        },
                        () => InteractivePriorityRequested(interactivePriorityEpoch));
                }

                if (hydrationResult.Committed)
                {
                    _backgroundPackCommitted = true;
                    // A failed warm must still publish the committed semantic version so the
                    // parent invalidates stale caches. FullyHydrated stays false and a later
                    // bounded retry performs only the warm step.
                    _hydrationPublication = new HydrationPublication(
                        MetadataVersion,
                        hydrationResult.Warmed,
                        false);
                    if (hydrationResult.Warmed)
                    {
                        // Every assembly now has an immutable cached MetadataReference.
                        _referencePackBytes = null;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"Could not hydrate compiler references in the background: {e.Message}");
            }
            finally
            {
                if (!IsFullyHydrated)
                {
                    var publication = _hydrationPublication;
                    _hydrationPublication = publication with { HydrationRunning = false };
                    Interlocked.Exchange(ref _backgroundHydrationStarted, 0);
                }
            }
        }

        public async Task<IReadOnlyList<string>> AddMetadataReferencesAsync(IEnumerable<string> assemblyNames)
        {
            await _referenceMaterializationGate.WaitAsync();
            try
            {
                string[] missingAssemblyNames;
                lock (_gate)
                {
                    missingAssemblyNames = assemblyNames
                        .Where(assemblyName => !string.IsNullOrWhiteSpace(assemblyName))
                        .Distinct(StringComparer.Ordinal)
                        .Where(assemblyName => !_metadataReferences.ContainsKey(assemblyName))
                        .OrderBy(assemblyName => assemblyName, StringComparer.Ordinal)
                        .ToArray();
                }

                if (missingAssemblyNames.Length == 0)
                {
                    return Array.Empty<string>();
                }

                var packBytes = _referencePackBytes;
                if (packBytes == null ||
                    !TryGetCachedReferencePackMetadata(
                        missingAssemblyNames,
                        out var references))
                {
                    return Array.Empty<string>();
                }

                _ = InstallReferencePackMetadata(references);
                return references.Keys.ToArray();
            }
            finally
            {
                _referenceMaterializationGate.Release();
            }
        }

        private async Task<bool> LoadStaticAssetBytesCoreAsync()
        {
            // Readiness uses one manifest plus one deterministic 3.8 MiB pack instead of
            // 163 individual reference requests. The documented System.Runtime metadata
            // generation is then published atomically by EnsureInitializedAsync.
            // The browser HttpClient bridge is most reliable with one fully-buffered static
            // response at a time. Serializing the two integrity-checked managed handoffs
            // avoids stream/proxy races without duplicate speculative transfers.
            var namespaceIndex = await GetNamespaceIndexAsync();
            var referencePackBytes = await _metadataHelper.GetReferencePackBytes(
                namespaceIndex.ReferencePack.Length);
            BrowserStaticAssetLoader.ReportPhase("static-site-bytes-returned");
            if (namespaceIndex.Assemblies.Count == 0 ||
                referencePackBytes == null ||
                !StartupReferenceAssemblyNames.All(namespaceIndex.Assemblies.Contains) ||
                referencePackBytes.Length != namespaceIndex.ReferencePack.Length)
            {
                // Nothing is cached or installed until the complete pack validates.
                return false;
            }

            _referencePackIndex = namespaceIndex;
            _referencePackBytes = referencePackBytes;
            BrowserStaticAssetLoader.ReportPhase("static-site-assets-cached");
            return true;
        }

        private bool TryGetCachedReferencePackMetadata(
            IEnumerable<string> assemblyNames,
            out SortedDictionary<string, MetadataReference> references)
        {
            references = new SortedDictionary<string, MetadataReference>(StringComparer.Ordinal);
            try
            {
                foreach (var assemblyName in assemblyNames
                             .Distinct(StringComparer.Ordinal)
                             .OrderBy(name => name, StringComparer.Ordinal))
                {
                    var lazyReference = _referenceMaterializations.GetOrAdd(
                        assemblyName,
                        name => new Lazy<MetadataReference?>(
                            () => TryCreateReferencePackMetadataReference(
                                _referencePackIndex,
                                _referencePackBytes,
                                name,
                                name.Equals("System.Runtime", StringComparison.Ordinal)
                                    ? _documentationProvider
                                    : null),
                            LazyThreadSafetyMode.ExecutionAndPublication));
                    var metadataReference = lazyReference.Value;
                    if (metadataReference == null)
                    {
                        if (_referenceMaterializations.TryGetValue(assemblyName, out var cachedReference) &&
                            ReferenceEquals(cachedReference, lazyReference))
                        {
                            _referenceMaterializations.TryRemove(assemblyName, out _);
                        }
                        references.Clear();
                        return false;
                    }

                    references.Add(assemblyName, metadataReference);
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"Could not materialize compiler references: {e.Message}");
                references.Clear();
                return false;
            }

            return references.Count > 0;
        }

        private static IReadOnlyList<string> OrderBackgroundHydrationAssemblies(
            ReferencePackIndex index)
        {
            // Cache the cheapest immutable slices first. If authoring resumes and aborts
            // hydration, demand promotion can immediately reuse the largest possible
            // number of completed references; the expensive tail remains retryable.
            return index.Assemblies
                .OrderBy(assemblyName =>
                    index.ReferencePack.Assemblies.TryGetValue(assemblyName, out var slice)
                        ? slice.Length
                        : int.MaxValue)
                .ThenBy(assemblyName => assemblyName, StringComparer.Ordinal)
                .ToArray();
        }

        private async Task<MetadataReference?>
            TryGetCachedReferencePackMetadataCooperativelyAsync(
            string assemblyName,
            int hydrationEpoch)
        {
            if (_referenceMaterializations.TryGetValue(assemblyName, out var existingReference))
            {
                try
                {
                    var materializedReference = existingReference.Value;
                    if (materializedReference == null &&
                        _referenceMaterializations.TryGetValue(
                            assemblyName,
                            out var currentReference) &&
                        ReferenceEquals(currentReference, existingReference))
                    {
                        _referenceMaterializations.TryRemove(assemblyName, out _);
                    }
                    return materializedReference;
                }
                catch (Exception e)
                {
                    if (_referenceMaterializations.TryGetValue(
                            assemblyName,
                            out var currentReference) &&
                        ReferenceEquals(currentReference, existingReference))
                    {
                        _referenceMaterializations.TryRemove(assemblyName, out _);
                    }
                    Console.WriteLine(
                        $"Could not reuse compiler reference '{assemblyName}': {e.Message}");
                    return null;
                }
            }

            var preparedReference =
                await TryCreateReferencePackMetadataReferenceCooperativelyAsync(
                    assemblyName,
                    documentationProvider: null,
                    hydrationEpoch: hydrationEpoch);
            if (preparedReference == null)
            {
                return null;
            }

            // Demand promotion may have populated the cache while this operation yielded.
            // Publish atomically and use the winner so every caller observes one immutable
            // reference object without making background hydration hold the demand gate.
            var preparedLazy = new Lazy<MetadataReference?>(
                () => preparedReference,
                LazyThreadSafetyMode.ExecutionAndPublication);
            var publishedLazy = _referenceMaterializations.GetOrAdd(
                assemblyName,
                preparedLazy);
            try
            {
                var publishedReference = publishedLazy.Value;
                if (publishedReference == null &&
                    _referenceMaterializations.TryGetValue(
                        assemblyName,
                        out var currentReference) &&
                    ReferenceEquals(currentReference, publishedLazy))
                {
                    _referenceMaterializations.TryRemove(assemblyName, out _);
                }
                return publishedReference;
            }
            catch (Exception e)
            {
                if (_referenceMaterializations.TryGetValue(
                        assemblyName,
                        out var currentReference) &&
                    ReferenceEquals(currentReference, publishedLazy))
                {
                    _referenceMaterializations.TryRemove(assemblyName, out _);
                }
                Console.WriteLine(
                    $"Could not publish compiler reference '{assemblyName}': {e.Message}");
                return null;
            }
        }

        private async Task<MetadataReference?>
            TryCreateReferencePackMetadataReferenceCooperativelyAsync(
            string assemblyName,
            DocumentationProvider? documentationProvider,
            int hydrationEpoch)
        {
            var index = _referencePackIndex;
            var packBytes = _referencePackBytes;
            if (packBytes == null ||
                packBytes.Length != index.ReferencePack.Length ||
                !index.ReferencePack.Assemblies.TryGetValue(assemblyName, out var slice) ||
                slice.Offset < 0 ||
                slice.Length <= 0 ||
                slice.Offset > packBytes.Length - slice.Length)
            {
                Console.WriteLine(
                    $"Compiler reference-pack slice for '{assemblyName}' is out of bounds.");
                return null;
            }

            var assemblyBytes = await CooperativeMetadataWork.CopyVerifiedSliceAsync(
                packBytes,
                slice.Offset,
                slice.Length,
                slice.Sha256,
                () => InteractivePriorityRequested(hydrationEpoch));
            if (assemblyBytes == null)
            {
                if (!InteractivePriorityRequested(hydrationEpoch))
                {
                    Console.WriteLine(
                        $"Compiler reference-pack slice for '{assemblyName}' failed SHA-256 validation.");
                }
                return null;
            }
            if (InteractivePriorityRequested(hydrationEpoch))
            {
                return null;
            }

            try
            {
                var metadataReference = MetadataReference.CreateFromImage(
                    ImmutableCollectionsMarshal.AsImmutableArray(assemblyBytes),
                    documentation: documentationProvider);
                if (!HasAssemblyIdentity(metadataReference, assemblyName))
                {
                    Console.WriteLine(
                        $"Compiler reference-pack slice identity does not match '{assemblyName}'.");
                    return null;
                }

                return metadataReference;
            }
            catch (Exception e)
            {
                Console.WriteLine(
                    $"Could not materialize compiler reference '{assemblyName}': {e.Message}");
                return null;
            }
        }

        private static bool ValidateReferencePack(ReferencePackIndex index, byte[] packBytes)
        {
            return packBytes.Length == index.ReferencePack.Length &&
                   HashMatches(packBytes, index.ReferencePack.Sha256);
        }

        private bool TryCreateReferencePackMetadata(
            ReferencePackIndex index,
            byte[] packBytes,
            DocumentationProvider? documentationProvider,
            IEnumerable<string> assemblyNames,
            out SortedDictionary<string, MetadataReference> references)
        {
            references = new SortedDictionary<string, MetadataReference>(StringComparer.Ordinal);
            if (packBytes.Length != index.ReferencePack.Length)
            {
                Console.WriteLine("Compiler reference-pack length does not match its manifest.");
                return false;
            }

            try
            {
                var pendingReferences = new SortedDictionary<string, MetadataReference>(StringComparer.Ordinal);
                foreach (var assemblyName in assemblyNames
                             .Distinct(StringComparer.Ordinal)
                             .OrderBy(name => name, StringComparer.Ordinal))
                {
                    var metadataReference = TryCreateReferencePackMetadataReference(
                        index,
                        packBytes,
                        assemblyName,
                        assemblyName.Equals("System.Runtime", StringComparison.Ordinal)
                            ? documentationProvider
                            : null);
                    if (metadataReference == null)
                    {
                        return false;
                    }
                    pendingReferences.Add(assemblyName, metadataReference);
                }

                references = pendingReferences;
            }
            catch (Exception e)
            {
                Console.WriteLine($"Could not materialize the compiler reference pack: {e.Message}");
                references.Clear();
                return false;
            }

            return references.Count > 0;
        }

        private async Task<SortedDictionary<string, MetadataReference>?>
            TryCreateReferencePackMetadataCooperativelyAsync(
                ReferencePackIndex index,
                byte[] packBytes,
                DocumentationProvider documentationProvider,
                IEnumerable<string> assemblyNames)
        {
            if (packBytes.Length != index.ReferencePack.Length)
            {
                return null;
            }

            var references = new SortedDictionary<string, MetadataReference>(
                StringComparer.Ordinal);
            var hydrationEpoch = Volatile.Read(ref _interactivePriorityEpoch);
            try
            {
                foreach (var assemblyName in assemblyNames
                             .Distinct(StringComparer.Ordinal)
                             .OrderBy(name => name, StringComparer.Ordinal))
                {
                    var metadataReference =
                        await TryCreateReferencePackMetadataReferenceCooperativelyAsync(
                            assemblyName,
                            assemblyName.Equals("System.Runtime", StringComparison.Ordinal)
                                ? documentationProvider
                                : null,
                            hydrationEpoch);
                    if (metadataReference == null)
                    {
                        return null;
                    }
                    references.Add(assemblyName, metadataReference);
                }
            }
            catch (Exception e)
            {
                Console.WriteLine(
                    $"Could not cooperatively materialize the compiler reference pack: {e.Message}");
                return null;
            }

            return references.Count > 0 ? references : null;
        }

        private static MetadataReference? TryCreateReferencePackMetadataReference(
            ReferencePackIndex index,
            byte[]? packBytes,
            string assemblyName,
            DocumentationProvider? documentationProvider)
        {
            if (packBytes == null ||
                packBytes.Length != index.ReferencePack.Length ||
                !index.ReferencePack.Assemblies.TryGetValue(assemblyName, out var slice) ||
                slice.Offset < 0 ||
                slice.Length <= 0 ||
                slice.Offset > packBytes.Length - slice.Length)
            {
                Console.WriteLine($"Compiler reference-pack slice for '{assemblyName}' is out of bounds.");
                return null;
            }

            var assemblyBytes = new byte[slice.Length];
            Buffer.BlockCopy(packBytes, slice.Offset, assemblyBytes, 0, slice.Length);
            if (!HashMatches(assemblyBytes, slice.Sha256))
            {
                Console.WriteLine($"Compiler reference-pack slice for '{assemblyName}' failed SHA-256 validation.");
                return null;
            }

            var metadataReference = MetadataReference.CreateFromImage(
                ImmutableCollectionsMarshal.AsImmutableArray(assemblyBytes),
                documentation: documentationProvider);
            if (!HasAssemblyIdentity(metadataReference, assemblyName))
            {
                Console.WriteLine($"Compiler reference-pack slice identity does not match '{assemblyName}'.");
                return null;
            }

            return metadataReference;
        }

        private bool CommitBackgroundReferencePack(
            IReadOnlyDictionary<string, MetadataReference> references,
            MetadataReference? documentedSystemRuntime)
        {
            return InstallReferencePackMetadata(
                references,
                documentedSystemRuntime,
                applyToRegisteredProjects: true);
        }

        private bool InstallReferencePackMetadata(
            IReadOnlyDictionary<string, MetadataReference> references,
            MetadataReference? documentedSystemRuntime = null,
            bool applyToRegisteredProjects = false)
        {
            MetadataSnapshot snapshot = default;
            List<OmniSharpProject>? projectsToUpdate = null;

            lock (_gate)
            {
                var added = false;
                var legacyReferencesToAdd =
                    new List<KeyValuePair<string, MetadataReference>>(references.Count + 1);
                foreach (var (assemblyName, metadataReference) in references)
                {
                    if (_metadataReferences.ContainsKey(assemblyName))
                    {
                        continue;
                    }

                    _metadataReferences.Add(assemblyName, metadataReference);
                    legacyReferencesToAdd.Add(
                        new KeyValuePair<string, MetadataReference>(assemblyName, metadataReference));
                    added = true;
                }

                if (documentedSystemRuntime != null &&
                    (!_metadataReferences.TryGetValue("System.Runtime", out var currentSystemRuntime) ||
                     !ReferenceEquals(currentSystemRuntime, documentedSystemRuntime)))
                {
                    _metadataReferences["System.Runtime"] = documentedSystemRuntime;
                    legacyReferencesToAdd.Add(
                        new KeyValuePair<string, MetadataReference>(
                            "System.Runtime",
                            documentedSystemRuntime));
                    added = true;
                }

                if (added)
                {
                    AddLegacyMetadataReferences(legacyReferencesToAdd);
                    _metadataVersion++;
                    snapshot = CreateMetadataSnapshotLocked();
                    if (applyToRegisteredProjects)
                    {
                        projectsToUpdate = GetLiveProjectsLocked();
                    }
                }
            }

            if (projectsToUpdate != null)
            {
                var success = true;
                foreach (var project in projectsToUpdate)
                {
                    success &= project.ApplyMetadataReferencesToWorkspace(snapshot);
                }

                return success;
            }

            return true;
        }

        private static bool HashMatches(byte[] bytes, string expectedHash)
        {
            return Convert.ToHexString(SHA256.HashData(bytes))
                .Equals(expectedHash, StringComparison.OrdinalIgnoreCase);
        }

        private static IReadOnlyList<string> ResolveReferenceClosure(
            IEnumerable<string> roots,
            IReadOnlyDictionary<string, IReadOnlyList<string>> assemblyReferences)
        {
            var closure = new SortedSet<string>(StringComparer.Ordinal);
            var pending = new Stack<string>(roots.Reverse());
            while (pending.Count > 0)
            {
                var assemblyName = pending.Pop();
                if (!closure.Add(assemblyName) ||
                    !assemblyReferences.TryGetValue(assemblyName, out var dependencies))
                {
                    continue;
                }

                foreach (var dependency in dependencies.Reverse())
                {
                    if (!closure.Contains(dependency))
                    {
                        pending.Push(dependency);
                    }
                }
            }

            return closure.ToArray();
        }

        private static string NormalizeNamespaceCandidate(string? namespaceCandidate)
        {
            var normalized = namespaceCandidate?.Trim() ?? string.Empty;
            while (normalized.StartsWith("global::", StringComparison.Ordinal))
            {
                normalized = normalized["global::".Length..];
            }

            return normalized;
        }

        private static IReadOnlyList<string> FindAssemblyNamesForLongestNamespacePrefix(
            IReadOnlyDictionary<string, IReadOnlyList<string>> namespaceIndex,
            string namespaceCandidate)
        {
            var current = NormalizeNamespaceCandidate(namespaceCandidate);
            while (current.Length > 0)
            {
                if (namespaceIndex.TryGetValue(current, out var assemblyNames))
                {
                    return assemblyNames;
                }

                var separator = current.LastIndexOf('.');
                if (separator < 0)
                {
                    break;
                }

                current = current[..separator];
            }

            return Array.Empty<string>();
        }

        private static bool HasAssemblyIdentity(
            MetadataReference metadataReference,
            string expectedAssemblyName)
        {
            if (metadataReference is not PortableExecutableReference portableReference ||
                portableReference.GetMetadata() is not AssemblyMetadata assemblyMetadata)
            {
                return false;
            }

            var modules = assemblyMetadata.GetModules();
            if (modules.Length == 0)
            {
                return false;
            }

            var reader = modules[0].GetMetadataReader();
            return reader.IsAssembly &&
                   reader.GetString(reader.GetAssemblyDefinition().Name)
                       .Equals(expectedAssemblyName, StringComparison.Ordinal);
        }

        private async Task<ReferencePackIndex> GetNamespaceIndexAsync()
        {
            Task<ReferencePackIndex> fetchTask;
            lock (_namespaceIndexGate)
            {
                fetchTask = _namespaceIndexTask ??= _metadataHelper.GetNamespaceIndex();
            }

            var namespaceIndex = await fetchTask;
            if (namespaceIndex.Assemblies.Count == 0)
            {
                lock (_namespaceIndexGate)
                {
                    if (ReferenceEquals(_namespaceIndexTask, fetchTask))
                    {
                        _namespaceIndexTask = null;
                    }
                }
            }

            return namespaceIndex;
        }

        private MetadataSnapshot CreateMetadataSnapshotLocked()
        {
            return new MetadataSnapshot(_metadataVersion, _metadataReferences.Values.ToArray());
        }

        private List<OmniSharpProject> GetLiveProjectsLocked()
        {
            var projects = new List<OmniSharpProject>(_projects.Count);
            for (var index = _projects.Count - 1; index >= 0; index--)
            {
                if (_projects[index].TryGetTarget(out var project))
                {
                    projects.Add(project);
                }
                else
                {
                    _projects.RemoveAt(index);
                }
            }

            return projects;
        }

        private void RemoveDeadProjectsLocked()
        {
            for (var index = _projects.Count - 1; index >= 0; index--)
            {
                if (!_projects[index].TryGetTarget(out _))
                {
                    _projects.RemoveAt(index);
                }
            }
        }
    }

    private const int BackgroundMaterializationBatchSize = 1;
    private const int StaticPackInitializationAttempts = 3;

    private static readonly string[] StartupReferenceAssemblyNames =
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

    private static readonly CSharpProjectConfiguration DefaultProjectConfiguration = new();
    private static readonly CSharpParseOptions ParseOptions =
        CSharpCompilerSettings.CreateParseOptions(DefaultProjectConfiguration);
    private static readonly CSharpCompilationOptions CompilationOptions =
        CSharpCompilerSettings.CreateCompilationOptions(DefaultProjectConfiguration);

    private static readonly Lazy<MefHostServices> SharedMefHost = new(
        () => MefHostServices.DefaultHost,
        LazyThreadSafetyMode.ExecutionAndPublication);

    private static readonly ConcurrentDictionary<string, StaticSiteState> StaticSites =
        new(StringComparer.Ordinal);

    private static readonly object LegacyMetadataReferencesGate = new();
    private static readonly HashSet<string> LegacyMetadataReferenceNames = new(StringComparer.Ordinal);
    private static readonly HashSet<MetadataReference> ManagedMetadataReferences =
        new(ReferenceEqualityComparer.Instance);

    private readonly object _workspaceGate = new();
    private readonly SemaphoreSlim _initializationGate = new(1, 1);
    private readonly SemaphoreSlim _namespacePromotionGate = new(1, 1);
    private readonly StaticSiteState _staticSiteState;
    private readonly Dictionary<string, DocumentId> _additionalDocumentIds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _additionalDocumentContents = new(StringComparer.Ordinal);
    private readonly Dictionary<DocumentId, DocumentNamespaceCache> _documentNamespaceCaches = new();
    private SourceText _primarySourceText = SourceText.From(string.Empty);
    private string? _primaryDocumentText = string.Empty;
    private string _primaryDocumentPath = string.Empty;
    private long _primaryDocumentVersion;
    private int _appliedMetadataVersion;
    private bool _initialized;

    private sealed record DocumentNamespaceCache(
        SyntaxTree SyntaxTree,
        HashSet<string> NamespaceCandidates);

    public OmniSharpProject(string uri)
    {
        var staticSiteUri = NormalizeStaticSiteUri(uri);
        _staticSiteState = StaticSites.GetOrAdd(staticSiteUri, key => new StaticSiteState(key));
    }

    // Preserve the original public compatibility surface. Workspace correctness no longer
    // depends on this mutable legacy list; origin-specific, locked snapshots above are the
    // source of truth used by Roslyn.
    public static List<MetadataReference> MetadataReferences = new();

    public long PrimaryDocumentVersion
    {
        get
        {
            lock (_workspaceGate)
            {
                return _primaryDocumentVersion;
            }
        }
    }

    public int PrimaryDocumentTextLength
    {
        get
        {
            lock (_workspaceGate)
            {
                return _primarySourceText.Length;
            }
        }
    }

    public int AppliedMetadataVersion
    {
        get
        {
            lock (_workspaceGate)
            {
                return _appliedMetadataVersion;
            }
        }
    }

    public MetadataHydrationState GetMetadataHydrationState()
    {
        var appliedVersion = AppliedMetadataVersion;
        return new MetadataHydrationState(
            _staticSiteState.NotifiableMetadataVersion,
            _staticSiteState.IsFullyHydrated &&
            appliedVersion == _staticSiteState.MetadataVersion,
            _staticSiteState.IsHydrationRunning);
    }

    public void BeginBackgroundMetadataHydration(
        Func<Func<Task<bool>>, Func<bool>, Task<MetadataHydrationCommitResult>>
            commitAndWarmFullReferenceCompletionAsync)
    {
        _staticSiteState.BeginBackgroundHydration(
            commitAndWarmFullReferenceCompletionAsync);
    }

    public void RequestInteractivePriority()
    {
        _staticSiteState.RequestInteractivePriority();
    }

    public Task InitializeStaticMetadataAsync()
    {
        return _staticSiteState.EnsureInitializedAsync();
    }

    public Task InitializeStaticAssetsAsync()
    {
        return _staticSiteState.EnsureStaticAssetsLoadedAsync();
    }

    public Task ValidateStaticAssetsAsync()
    {
        return _staticSiteState.EnsureStaticAssetsValidatedAsync();
    }

    public async Task Init()
    {
        await _initializationGate.WaitAsync();
        try
        {
            if (_initialized)
            {
                return;
            }

            // Start network initialization before composing the first workspace. The MEF
            // host is shared, so only the first project pays composition cost; subsequent
            // projects overlap their already-shared HTTP task with cheap workspace setup.
            var metadataInitializationTask = _staticSiteState.EnsureInitializedAsync();
            var sharedMefHost = SharedMefHost.Value;
            var workspace = new AdhocWorkspace(sharedMefHost);
            await metadataInitializationTask;
            if (!_staticSiteState.IsInitialized)
            {
                workspace.Dispose();
                throw new InvalidOperationException(
                    "The validated static C# reference pack could not be initialized; retry project initialization.");
            }

            var metadataSnapshot = _staticSiteState.GetMetadataSnapshot();
            var projectMetadataReferences = MergeMetadataReferences(metadataSnapshot.References);
            var projectInfo = ProjectInfo
                .Create(ProjectId.CreateNewId(), VersionStamp.Create(), "OmniSharp", "OmniSharp", LanguageNames.CSharp)
                .WithMetadataReferences(projectMetadataReferences)
                .WithCompilationOptions(CompilationOptions)
                .WithParseOptions(ParseOptions);

            var project = workspace.AddProject(projectInfo);
            var initialText = SourceText.From(string.Empty);
            var document = workspace.AddDocument(project.Id, "Code.cs", initialText);

            lock (_workspaceGate)
            {
                Workspace = workspace;
                UseOnlyOnceDocument = document;
                DocumentId = document.Id;
                _primarySourceText = initialText;
                _appliedMetadataVersion = metadataSnapshot.Version;
                _initialized = true;
            }

            _staticSiteState.Register(this);
        }
        finally
        {
            _initializationGate.Release();
        }
    }

    public Task<Document> UpdateDocumentAsync(string code)
    {
        lock (_workspaceGate)
        {
            EnsureInitialized();
            var safeCode = code ?? string.Empty;
            var currentCode = GetPrimaryDocumentTextLocked();
            if (safeCode == currentCode)
            {
                return Task.FromResult(GetCurrentDocumentLocked());
            }

            var nextText = ApplySingleTextDifference(_primarySourceText, currentCode, safeCode);
            if (!TryApplyPrimaryTextLocked(nextText, safeCode, out var document))
            {
                throw new InvalidOperationException("Could not apply the OmniSharp primary document update.");
            }

            // This method deliberately changes only the primary text. In particular, it
            // does not clear the active file path or any additional project documents.
            return Task.FromResult(document);
        }
    }

    public Task<IncrementalUpdateResult> TryUpdatePrimaryDocumentAsync(
        long expectedVersion,
        int expectedOldTextLength,
        IReadOnlyList<IncrementalTextChange>? orderedChanges)
    {
        lock (_workspaceGate)
        {
            if (!_initialized)
            {
                return Task.FromResult(new IncrementalUpdateResult(
                    false,
                    true,
                    null,
                    _primaryDocumentVersion,
                    _primarySourceText.Length,
                    "The project is not initialized; perform a full synchronization after initialization."));
            }

            var currentDocument = GetCurrentDocumentLocked();
            if (!currentDocument.TryGetText(out var workspaceText))
            {
                return Task.FromResult(IncrementalFailureLocked(
                    "The workspace could not provide its current primary text."));
            }

            if (!ReferenceEquals(workspaceText, _primarySourceText))
            {
                if (workspaceText.Length != _primarySourceText.Length ||
                    !workspaceText.ContentEquals(_primarySourceText))
                {
                    return Task.FromResult(IncrementalFailureLocked(
                        "The workspace primary text changed outside the synchronized update path."));
                }

                // Preserve correctness if Roslyn rehydrates an equivalent text instance.
                // Future changes must derive from the exact text owned by the workspace.
                _primarySourceText = workspaceText;
            }

            if (expectedVersion != _primaryDocumentVersion)
            {
                return Task.FromResult(IncrementalFailureLocked(
                    $"Expected primary document version {expectedVersion}, but the current version is {_primaryDocumentVersion}."));
            }

            if (expectedOldTextLength != _primarySourceText.Length)
            {
                return Task.FromResult(IncrementalFailureLocked(
                    $"Expected primary text length {expectedOldTextLength}, but the current length is {_primarySourceText.Length}."));
            }

            if (orderedChanges == null)
            {
                return Task.FromResult(IncrementalFailureLocked(
                    "Incremental text changes are required."));
            }

            var normalizedChanges = new (IncrementalTextChange Change, int OriginalIndex)[orderedChanges.Count];
            for (var index = 0; index < orderedChanges.Count; index++)
            {
                var change = orderedChanges[index];
                if (change == null)
                {
                    return Task.FromResult(IncrementalFailureLocked(
                        $"Incremental text change {index} is null."));
                }

                if (change.Start < 0 || change.Length < 0 ||
                    change.Start > _primarySourceText.Length ||
                    change.Length > _primarySourceText.Length - change.Start)
                {
                    return Task.FromResult(IncrementalFailureLocked(
                        $"Incremental text change {index} is outside the current source text."));
                }

                if (change.NewText == null)
                {
                    return Task.FromResult(IncrementalFailureLocked(
                        $"Incremental text change {index} has null replacement text."));
                }

                normalizedChanges[index] = (change, index);
            }

            // Monaco emits multi-change events from the end of the document toward the
            // beginning, while SourceText.WithChanges consumes original-coordinate changes
            // in ascending span order. At the same start, an insertion precedes a replacement;
            // identical insertions must reverse Monaco's emitted order to retain edit order.
            Array.Sort(normalizedChanges, static (left, right) =>
            {
                var positionComparison = left.Change.Start.CompareTo(right.Change.Start);
                if (positionComparison != 0)
                {
                    return positionComparison;
                }

                var lengthComparison = left.Change.Length.CompareTo(right.Change.Length);
                if (lengthComparison != 0)
                {
                    return lengthComparison;
                }

                return left.Change.Length == 0
                    ? right.OriginalIndex.CompareTo(left.OriginalIndex)
                    : left.OriginalIndex.CompareTo(right.OriginalIndex);
            });

            var roslynChanges = new TextChange[normalizedChanges.Length];
            var previousEnd = 0;
            long expectedNewLength = _primarySourceText.Length;

            for (var index = 0; index < normalizedChanges.Length; index++)
            {
                var (change, originalIndex) = normalizedChanges[index];

                if (change.Start < previousEnd)
                {
                    return Task.FromResult(IncrementalFailureLocked(
                        $"Incremental text change {originalIndex} overlaps another change."));
                }

                previousEnd = change.Start + change.Length;
                expectedNewLength += change.NewText.Length - change.Length;
                if (expectedNewLength is < 0 or > int.MaxValue)
                {
                    return Task.FromResult(IncrementalFailureLocked(
                        "The incremental update would create an invalid source-text length."));
                }

                roslynChanges[index] = new TextChange(
                    new TextSpan(change.Start, change.Length),
                    change.NewText);
            }

            SourceText nextText;
            try
            {
                nextText = _primarySourceText.WithChanges(roslynChanges);
            }
            catch (ArgumentException e)
            {
                return Task.FromResult(IncrementalFailureLocked(
                    $"Roslyn rejected the incremental text changes: {e.Message}"));
            }

            if (nextText.Length != expectedNewLength)
            {
                return Task.FromResult(IncrementalFailureLocked(
                    "The incremental update produced an unexpected source-text length."));
            }

            if (orderedChanges.Count == 0)
            {
                return Task.FromResult(new IncrementalUpdateResult(
                    true,
                    false,
                    currentDocument,
                    _primaryDocumentVersion,
                    _primarySourceText.Length,
                    "The incremental update was already reflected in the primary document."));
            }

            // Do not flatten the changed SourceText into a full string on the hot path.
            // The full string is reconstructed lazily only if a later full-sync call needs it.
            if (!TryApplyPrimaryTextLocked(nextText, nextCode: null, out var updatedDocument))
            {
                return Task.FromResult(IncrementalFailureLocked(
                    "The workspace rejected the incremental update; perform a full synchronization."));
            }

            return Task.FromResult(new IncrementalUpdateResult(
                true,
                false,
                updatedDocument,
                _primaryDocumentVersion,
                _primarySourceText.Length,
                "The incremental primary document update was applied."));
        }
    }

    public Task<Document> UpdateProjectDocumentsAsync(
        string code,
        string? activePath,
        IEnumerable<SourceFileSnapshot>? files,
        CSharpProjectConfiguration? configuration = null)
    {
        lock (_workspaceGate)
        {
            EnsureInitialized();
            var safeCode = code ?? string.Empty;
            var currentCode = GetPrimaryDocumentTextLocked();
            var normalizedActivePath = NormalizeSourcePath(activePath);
            var nextPrimaryPath = string.IsNullOrWhiteSpace(normalizedActivePath)
                ? _primaryDocumentPath
                : normalizedActivePath;
            var nextDocuments = new Dictionary<string, string>(StringComparer.Ordinal);

            foreach (var file in files ?? Array.Empty<SourceFileSnapshot>())
            {
                var path = NormalizeSourcePath(file.Path);
                if (string.IsNullOrWhiteSpace(path) || path.Equals(nextPrimaryPath, StringComparison.Ordinal))
                {
                    continue;
                }

                nextDocuments[path] = file.Content ?? string.Empty;
            }

            var originalPrimaryDocumentId = DocumentId;
            var projectId = originalPrimaryDocumentId.ProjectId;
            var solution = Workspace.CurrentSolution;
            var project = solution.GetProject(projectId)
                ?? throw new InvalidOperationException("The OmniSharp project disappeared.");
            var nextParseOptions = CSharpCompilerSettings.CreateParseOptions(configuration);
            var nextCompilationOptions = CSharpCompilerSettings.CreateCompilationOptions(configuration);
            var projectOptionsChanged =
                !Equals(project.ParseOptions, nextParseOptions)
                || !Equals(project.CompilationOptions, nextCompilationOptions);

            if (!projectOptionsChanged &&
                safeCode == currentCode &&
                nextPrimaryPath == _primaryDocumentPath &&
                DictionariesEqual(_additionalDocumentContents, nextDocuments))
            {
                return Task.FromResult(GetCurrentDocumentLocked());
            }

            if (projectOptionsChanged)
            {
                solution = solution
                    .WithProjectParseOptions(projectId, nextParseOptions)
                    .WithProjectCompilationOptions(projectId, nextCompilationOptions);
            }

            var primaryPathChanged = nextPrimaryPath != _primaryDocumentPath;
            var nextPrimaryDocumentId = !primaryPathChanged
                ? originalPrimaryDocumentId
                : _additionalDocumentIds.TryGetValue(nextPrimaryPath, out var existingPrimaryDocumentId)
                    ? existingPrimaryDocumentId
                    : string.IsNullOrWhiteSpace(_primaryDocumentPath)
                        ? originalPrimaryDocumentId
                        : DocumentId.CreateNewId(projectId, nextPrimaryPath);
            var nextDocumentIds = new Dictionary<string, DocumentId>(StringComparer.Ordinal);
            foreach (var path in nextDocuments.Keys)
            {
                if (!string.IsNullOrWhiteSpace(_primaryDocumentPath) &&
                    path.Equals(_primaryDocumentPath, StringComparison.Ordinal) &&
                    originalPrimaryDocumentId != nextPrimaryDocumentId)
                {
                    nextDocumentIds[path] = originalPrimaryDocumentId;
                }
                else if (_additionalDocumentIds.TryGetValue(path, out var existingDocumentId) &&
                         existingDocumentId != nextPrimaryDocumentId)
                {
                    nextDocumentIds[path] = existingDocumentId;
                }
                else
                {
                    nextDocumentIds[path] = DocumentId.CreateNewId(projectId, path);
                }
            }

            // A Roslyn document identity belongs to one physical source file. Moving one
            // DocumentId from A to B while simultaneously adding a new A document can make
            // Workspace.TryApplyChanges reuse B's text loader for both paths. Select the
            // existing ID for each path instead, and only add/remove IDs for genuinely
            // added/removed files.
            var retainedDocumentIds = nextDocumentIds.Values
                .Append(nextPrimaryDocumentId)
                .ToHashSet();
            foreach (var staleDocumentId in project.DocumentIds
                         .Where(documentId => !retainedDocumentIds.Contains(documentId))
                         .ToArray())
            {
                solution = solution.RemoveDocument(staleDocumentId);
            }

            SourceText nextPrimaryText;
            var existingPrimaryDocument = solution.GetDocument(nextPrimaryDocumentId);
            if (existingPrimaryDocument == null)
            {
                nextPrimaryText = SourceText.From(safeCode);
                solution = solution.AddDocument(
                    nextPrimaryDocumentId,
                    SourceNameForPath(nextPrimaryPath),
                    nextPrimaryText,
                    SourceFoldersForPath(nextPrimaryPath),
                    filePath: nextPrimaryPath);
            }
            else
            {
                var previousPrimaryContent =
                    nextPrimaryDocumentId == originalPrimaryDocumentId
                        ? currentCode
                        : _additionalDocumentContents.TryGetValue(
                            nextPrimaryPath,
                            out var existingPrimaryContent)
                            ? existingPrimaryContent
                            : null;
                if (previousPrimaryContent != safeCode)
                {
                    nextPrimaryText =
                        nextPrimaryDocumentId == originalPrimaryDocumentId &&
                        !primaryPathChanged
                            ? ApplySingleTextDifference(_primarySourceText, currentCode, safeCode)
                            : SourceText.From(safeCode);
                    solution = solution.WithDocumentText(
                        nextPrimaryDocumentId,
                        nextPrimaryText,
                        nextPrimaryDocumentId == originalPrimaryDocumentId &&
                        !primaryPathChanged
                            ? PreservationMode.PreserveIdentity
                            : PreservationMode.PreserveValue);
                }
                else if (existingPrimaryDocument.TryGetText(out var existingPrimaryText) &&
                         existingPrimaryText != null)
                {
                    nextPrimaryText = existingPrimaryText;
                }
                else
                {
                    nextPrimaryText = SourceText.From(safeCode);
                }

                if (!string.IsNullOrWhiteSpace(nextPrimaryPath) &&
                    (!string.Equals(
                         existingPrimaryDocument.FilePath,
                         nextPrimaryPath,
                         StringComparison.Ordinal) ||
                     !string.Equals(
                         existingPrimaryDocument.Name,
                         SourceNameForPath(nextPrimaryPath),
                         StringComparison.Ordinal)))
                {
                    solution = solution
                        .WithDocumentName(
                            nextPrimaryDocumentId,
                            SourceNameForPath(nextPrimaryPath))
                        .WithDocumentFilePath(nextPrimaryDocumentId, nextPrimaryPath);
                }
            }

            foreach (var (path, content) in nextDocuments)
            {
                var documentId = nextDocumentIds[path];
                var existingDocument = solution.GetDocument(documentId);
                if (existingDocument != null)
                {
                    var previousContent =
                        documentId == originalPrimaryDocumentId
                            ? currentCode
                            : _additionalDocumentContents.TryGetValue(
                                path,
                                out var existingContent)
                                ? existingContent
                                : null;
                    if (previousContent != content)
                    {
                        solution = solution.WithDocumentText(documentId, SourceText.From(content));
                    }

                    continue;
                }

                solution = solution.AddDocument(
                    documentId,
                    SourceNameForPath(path),
                    SourceText.From(content),
                    SourceFoldersForPath(path),
                    filePath: path);
            }

            if (Workspace.TryApplyChanges(solution))
            {
                DocumentId = nextPrimaryDocumentId;
                if (primaryPathChanged || safeCode != currentCode)
                {
                    _primarySourceText = nextPrimaryText;
                    _primaryDocumentText = safeCode;
                    _primaryDocumentVersion++;
                }

                _primaryDocumentPath = nextPrimaryPath;
                _additionalDocumentIds.Clear();
                foreach (var (path, documentId) in nextDocumentIds)
                {
                    _additionalDocumentIds[path] = documentId;
                }

                _additionalDocumentContents.Clear();
                foreach (var (path, content) in nextDocuments)
                {
                    _additionalDocumentContents[path] = content;
                }

                UseOnlyOnceDocument = GetCurrentDocumentLocked();
            }
            else
            {
                throw new InvalidOperationException("Could not apply the OmniSharp project document snapshot.");
            }

            return Task.FromResult(GetCurrentDocumentLocked());
        }
    }

    public async Task EnsureReferencesForDocumentAsync(Document document, bool scanAll = false)
    {
        if (!_staticSiteState.IsInitialized)
        {
            return;
        }

        if (_staticSiteState.IsFullyHydrated)
        {
            EnsureLatestMetadataApplied();
            return;
        }

        await _namespacePromotionGate.WaitAsync();
        try
        {
            var namespaceCandidates = await DiscoverDocumentNamespaceCandidatesAsync(document, scanAll);
            if (namespaceCandidates.Count > 0)
            {
                var completedNamespaces = await _staticSiteState.PromoteNamespacesAsync(
                    namespaceCandidates);
                RemoveCompletedNamespaceCandidates(document.Id, completedNamespaces);
            }

            EnsureLatestMetadataApplied();
        }
        finally
        {
            _namespacePromotionGate.Release();
        }
    }

    public async Task EnsureReferencesForProjectAsync(Project project)
    {
        if (!_staticSiteState.IsInitialized)
        {
            return;
        }

        if (_staticSiteState.IsFullyHydrated)
        {
            EnsureLatestMetadataApplied();
            return;
        }

        await _namespacePromotionGate.WaitAsync();
        try
        {
            var documentIds = project.DocumentIds.ToHashSet();
            foreach (var staleDocumentId in _documentNamespaceCaches.Keys
                         .Where(documentId => !documentIds.Contains(documentId))
                         .ToArray())
            {
                _documentNamespaceCaches.Remove(staleDocumentId);
            }

            var namespaceCandidates = new SortedSet<string>(StringComparer.Ordinal);
            foreach (var document in project.Documents)
            {
                namespaceCandidates.UnionWith(
                    await DiscoverDocumentNamespaceCandidatesAsync(document, scanAll: true));
            }

            if (namespaceCandidates.Count > 0)
            {
                var completedNamespaces = await _staticSiteState.PromoteNamespacesAsync(
                    namespaceCandidates);
                foreach (var documentId in documentIds)
                {
                    RemoveCompletedNamespaceCandidates(documentId, completedNamespaces);
                }
            }

            EnsureLatestMetadataApplied();
        }
        finally
        {
            _namespacePromotionGate.Release();
        }
    }

    private async Task<IReadOnlyCollection<string>> DiscoverDocumentNamespaceCandidatesAsync(
        Document document,
        bool scanAll)
    {
        var syntaxRoot = await document.GetSyntaxRootAsync();
        if (syntaxRoot == null)
        {
            return Array.Empty<string>();
        }

        var syntaxTree = syntaxRoot.SyntaxTree;
        if (!_documentNamespaceCaches.TryGetValue(document.Id, out var cache))
        {
            cache = new DocumentNamespaceCache(
                syntaxTree,
                new HashSet<string>(GetAllNamespaceCandidates(syntaxRoot), StringComparer.Ordinal));
            _documentNamespaceCaches[document.Id] = cache;
            return cache.NamespaceCandidates;
        }

        if (ReferenceEquals(cache.SyntaxTree, syntaxTree))
        {
            return cache.NamespaceCandidates;
        }

        if (scanAll)
        {
            cache.NamespaceCandidates.UnionWith(GetAllNamespaceCandidates(syntaxRoot));
        }
        else
        {
            IList<TextSpan> changedSpans;
            try
            {
                changedSpans = syntaxTree.GetChangedSpans(cache.SyntaxTree);
            }
            catch (ArgumentException)
            {
                changedSpans = new[] { syntaxRoot.FullSpan };
                scanAll = true;
            }

            if (scanAll)
            {
                cache.NamespaceCandidates.UnionWith(GetAllNamespaceCandidates(syntaxRoot));
            }
            else
            {
                cache.NamespaceCandidates.UnionWith(
                    GetChangedNamespaceCandidates(syntaxRoot, changedSpans));
            }
        }

        _documentNamespaceCaches[document.Id] = cache with { SyntaxTree = syntaxTree };
        return cache.NamespaceCandidates;
    }

    private void RemoveCompletedNamespaceCandidates(
        DocumentId documentId,
        IReadOnlySet<string> completedNamespaces)
    {
        if (_documentNamespaceCaches.TryGetValue(documentId, out var cache))
        {
            cache.NamespaceCandidates.RemoveWhere(namespaceCandidate =>
                _staticSiteState.IsNamespacePromotedOrCompleted(
                    namespaceCandidate,
                    completedNamespaces));
        }
    }

    private static IEnumerable<string> GetAllNamespaceCandidates(SyntaxNode syntaxRoot)
    {
        return syntaxRoot
            .DescendantNodesAndSelf()
            .Select(GetNamespaceCandidate)
            .Where(namespaceName => !string.IsNullOrWhiteSpace(namespaceName))
            .Select(namespaceName => namespaceName!);
    }

    private static string? GetNamespaceCandidate(SyntaxNode node)
    {
        return node switch
        {
            UsingDirectiveSyntax usingDirective => usingDirective.Name?.ToString(),
            MemberAccessExpressionSyntax memberAccess
                when memberAccess.Parent is not MemberAccessExpressionSyntax =>
                memberAccess.ToString(),
            QualifiedNameSyntax qualifiedName
                when qualifiedName.Parent is not QualifiedNameSyntax =>
                qualifiedName.ToString(),
            AliasQualifiedNameSyntax aliasQualifiedName
                when aliasQualifiedName.Parent is not QualifiedNameSyntax =>
                aliasQualifiedName.ToString(),
            _ => null,
        };
    }

    private static IEnumerable<string> GetChangedNamespaceCandidates(
        SyntaxNode syntaxRoot,
        IEnumerable<TextSpan> changedSpans)
    {
        if (syntaxRoot.FullSpan.IsEmpty)
        {
            yield break;
        }

        var lastPosition = syntaxRoot.FullSpan.End - 1;
        var seenCandidates = new HashSet<string>(StringComparer.Ordinal);
        foreach (var changedSpan in changedSpans)
        {
            var start = Math.Clamp(changedSpan.Start, syntaxRoot.FullSpan.Start, lastPosition);
            var end = Math.Clamp(
                Math.Max(changedSpan.Start, changedSpan.End - 1),
                syntaxRoot.FullSpan.Start,
                lastPosition);
            var boundedSpan = TextSpan.FromBounds(start, Math.Min(end + 1, syntaxRoot.FullSpan.End));
            foreach (var namespaceCandidate in syntaxRoot
                         .DescendantNodes(boundedSpan)
                         .Select(GetNamespaceCandidate)
                         .Where(candidate => !string.IsNullOrWhiteSpace(candidate)))
            {
                if (seenCandidates.Add(namespaceCandidate!))
                {
                    yield return namespaceCandidate!;
                }
            }

            // Boundary ancestors keep the single-character edit path shallow and also
            // cover a containing qualified/member chain whose node starts outside the
            // changed span. Descendants above cover every namespace in a multiline paste.
            foreach (var position in start == end ? new[] { start } : new[] { start, end })
            {
                var ancestors = syntaxRoot
                    .FindToken(position, findInsideTrivia: true)
                    .Parent?
                    .AncestorsAndSelf();
                if (ancestors == null)
                {
                    continue;
                }

                foreach (var namespaceCandidate in ancestors
                             .Select(GetNamespaceCandidate)
                             .Where(candidate => !string.IsNullOrWhiteSpace(candidate)))
                {
                    if (seenCandidates.Add(namespaceCandidate!))
                    {
                        yield return namespaceCandidate!;
                    }
                }
            }
        }
    }

    public async Task<NamespaceIncludeResult> IncludeNamespaceAsync(string namespaceName)
    {
        namespaceName = namespaceName?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(namespaceName))
        {
            return new NamespaceIncludeResult(
                namespaceName,
                Array.Empty<string>(),
                Array.Empty<string>(),
                false,
                "Namespace is required.");
        }

        await _staticSiteState.EnsureInitializedAsync();
        var matchingAssemblyNames = await _staticSiteState.GetAssemblyNamesForNamespaceAsync(namespaceName);
        if (matchingAssemblyNames.Count == 0)
        {
            return new NamespaceIncludeResult(
                namespaceName,
                Array.Empty<string>(),
                Array.Empty<string>(),
                false,
                $"No .NET 8 assemblies matched namespace '{namespaceName}'.");
        }

        var addedAssemblyNames = await _staticSiteState.AddMetadataReferencesAsync(matchingAssemblyNames);
        var metadataSnapshot = _staticSiteState.GetMetadataSnapshot();
        var referencesApplied = ApplyMetadataReferencesToWorkspace(metadataSnapshot);
        var allWorkspacesApplied = _staticSiteState.ApplyCurrentMetadataToAllProjects();
        var allReferencesLoaded = _staticSiteState.ContainsAllMetadataReferences(matchingAssemblyNames);
        var success = allReferencesLoaded && referencesApplied && allWorkspacesApplied;

        var message = success
            ? addedAssemblyNames.Count > 0
                ? $"Included {addedAssemblyNames.Count} assembly reference(s) for '{namespaceName}'."
                : $"Namespace '{namespaceName}' was already available."
            : !allReferencesLoaded
                ? $"Some assembly references for '{namespaceName}' could not be loaded; retry the inclusion."
                : $"One or more workspaces could not apply the references for '{namespaceName}'; retry the inclusion.";

        return new NamespaceIncludeResult(
            namespaceName,
            addedAssemblyNames,
            matchingAssemblyNames,
            success,
            message);
    }

    private bool ApplyMetadataReferencesToWorkspace(MetadataSnapshot snapshot)
    {
        lock (_workspaceGate)
        {
            if (!_initialized)
            {
                return false;
            }

            if (snapshot.Version < _appliedMetadataVersion)
            {
                snapshot = _staticSiteState.GetMetadataSnapshot();
            }

            var projectId = DocumentId.ProjectId;
            var mergedReferences = MergeMetadataReferences(snapshot.References);
            var currentReferences = Workspace.CurrentSolution.GetProject(projectId)?.MetadataReferences;
            if (snapshot.Version <= _appliedMetadataVersion &&
                currentReferences != null &&
                currentReferences.SequenceEqual(mergedReferences))
            {
                return true;
            }

            var updatedSolution = Workspace.CurrentSolution.WithProjectMetadataReferences(
                projectId,
                mergedReferences);
            if (Workspace.TryApplyChanges(updatedSolution))
            {
                _appliedMetadataVersion = snapshot.Version;
                UseOnlyOnceDocument = GetCurrentDocumentLocked();
                return true;
            }

            Console.WriteLine("Could not apply OmniSharp metadata-reference update.");
            return false;
        }
    }

    private bool TryApplyPrimaryTextLocked(SourceText nextText, string? nextCode, out Document document)
    {
        var updatedSolution = Workspace.CurrentSolution.WithDocumentText(
            DocumentId,
            nextText,
            PreservationMode.PreserveIdentity);
        if (!Workspace.TryApplyChanges(updatedSolution))
        {
            document = GetCurrentDocumentLocked();
            return false;
        }

        _primarySourceText = nextText;
        _primaryDocumentText = nextCode;
        _primaryDocumentVersion++;
        document = GetCurrentDocumentLocked();
        UseOnlyOnceDocument = document;
        return true;
    }

    private string GetPrimaryDocumentTextLocked()
    {
        return _primaryDocumentText ??= _primarySourceText.ToString();
    }

    private IncrementalUpdateResult IncrementalFailureLocked(string message)
    {
        return new IncrementalUpdateResult(
            false,
            true,
            null,
            _primaryDocumentVersion,
            _primarySourceText.Length,
            message);
    }

    private Document GetCurrentDocumentLocked()
    {
        return Workspace.CurrentSolution.GetDocument(DocumentId)
            ?? throw new InvalidOperationException("The OmniSharp primary document is missing from its workspace.");
    }

    private void EnsureInitialized()
    {
        if (!_initialized)
        {
            throw new InvalidOperationException("The OmniSharp project has not been initialized.");
        }
    }

    private void EnsureLatestMetadataApplied()
    {
        var snapshot = _staticSiteState.GetMetadataSnapshot();
        if (!ApplyMetadataReferencesToWorkspace(snapshot))
        {
            throw new InvalidOperationException(
                "Could not apply the promoted compiler references to the current workspace.");
        }
    }

    private static SourceText ApplySingleTextDifference(
        SourceText currentText,
        string currentCode,
        string nextCode)
    {
        var commonPrefixLength = 0;
        var maximumPrefixLength = Math.Min(currentCode.Length, nextCode.Length);
        while (commonPrefixLength < maximumPrefixLength &&
               currentCode[commonPrefixLength] == nextCode[commonPrefixLength])
        {
            commonPrefixLength++;
        }

        var currentSuffixStart = currentCode.Length;
        var nextSuffixStart = nextCode.Length;
        while (currentSuffixStart > commonPrefixLength &&
               nextSuffixStart > commonPrefixLength &&
               currentCode[currentSuffixStart - 1] == nextCode[nextSuffixStart - 1])
        {
            currentSuffixStart--;
            nextSuffixStart--;
        }

        var replacementText = nextCode.Substring(
            commonPrefixLength,
            nextSuffixStart - commonPrefixLength);
        return currentText.WithChanges(new TextChange(
            new TextSpan(commonPrefixLength, currentSuffixStart - commonPrefixLength),
            replacementText));
    }

    private static IReadOnlyList<string> FindAssemblyNames(
        IReadOnlyDictionary<string, IReadOnlyList<string>> namespaceIndex,
        string namespaceName)
    {
        var assemblyNames = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var (indexedNamespace, indexedAssemblyNames) in namespaceIndex)
        {
            if (NamespaceMatches(indexedNamespace, namespaceName))
            {
                foreach (var assemblyName in indexedAssemblyNames)
                {
                    // The publish-time index is built exclusively from the clean targeting
                    // pack, and each value is already its exact transitive closure.
                    assemblyNames.Add(assemblyName);
                }
            }

            foreach (var assemblyName in indexedAssemblyNames)
            {
                if (NamespaceMatches(assemblyName, namespaceName))
                {
                    assemblyNames.Add(assemblyName);
                }
            }
        }

        return assemblyNames.ToArray();
    }

    private static void AddLegacyMetadataReferences(
        IReadOnlyList<KeyValuePair<string, MetadataReference>> references)
    {
        lock (LegacyMetadataReferencesGate)
        {
            foreach (var (assemblyName, metadataReference) in references)
            {
                ManagedMetadataReferences.Add(metadataReference);
                if (LegacyMetadataReferenceNames.Add(assemblyName))
                {
                    MetadataReferences.Add(metadataReference);
                }
            }
        }
    }

    private static IReadOnlyList<MetadataReference> MergeMetadataReferences(
        IReadOnlyList<MetadataReference> managedReferences)
    {
        lock (LegacyMetadataReferencesGate)
        {
            var legacyReferences = MetadataReferences;
            var mergedReferences = new List<MetadataReference>(
                managedReferences.Count + (legacyReferences?.Count ?? 0));
            var seenReferences = new HashSet<MetadataReference>(ReferenceEqualityComparer.Instance);

            foreach (var metadataReference in managedReferences)
            {
                if (seenReferences.Add(metadataReference))
                {
                    mergedReferences.Add(metadataReference);
                }
            }

            if (legacyReferences != null)
            {
                foreach (var metadataReference in legacyReferences)
                {
                    if (metadataReference != null &&
                        !ManagedMetadataReferences.Contains(metadataReference) &&
                        seenReferences.Add(metadataReference))
                    {
                        mergedReferences.Add(metadataReference);
                    }
                }
            }

            return mergedReferences;
        }
    }

    private static bool NamespaceMatches(string candidate, string namespaceName)
    {
        return candidate.Equals(namespaceName, StringComparison.Ordinal) ||
               candidate.StartsWith(namespaceName + ".", StringComparison.Ordinal);
    }

    private static bool DictionariesEqual(
        IReadOnlyDictionary<string, string> left,
        IReadOnlyDictionary<string, string> right)
    {
        if (left.Count != right.Count)
        {
            return false;
        }

        foreach (var (key, value) in left)
        {
            if (!right.TryGetValue(key, out var rightValue) || rightValue != value)
            {
                return false;
            }
        }

        return true;
    }

    private static string NormalizeStaticSiteUri(string uri)
    {
        var parsedUri = new Uri(uri, UriKind.Absolute);
        var builder = new UriBuilder(parsedUri)
        {
            Query = string.Empty,
            Fragment = string.Empty
        };
        return builder.Uri.AbsoluteUri;
    }

    private static string NormalizeSourcePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return string.Empty;
        }

        var parts = new List<string>();
        foreach (var rawPart in path.Replace('\\', '/').Split('/'))
        {
            var part = rawPart.Trim();
            if (part.Length == 0 || part == ".")
            {
                continue;
            }

            if (part == "..")
            {
                if (parts.Count > 0)
                {
                    parts.RemoveAt(parts.Count - 1);
                }

                continue;
            }

            parts.Add(part);
        }

        return string.Join("/", parts);
    }

    private static string SourceNameForPath(string path)
    {
        var normalized = NormalizeSourcePath(path);
        var slash = normalized.LastIndexOf('/');
        return slash >= 0 ? normalized[(slash + 1)..] : normalized;
    }

    private static IEnumerable<string> SourceFoldersForPath(string path)
    {
        var normalized = NormalizeSourcePath(path);
        var slash = normalized.LastIndexOf('/');
        return slash > 0
            ? normalized[..slash].Split('/', StringSplitOptions.RemoveEmptyEntries)
            : Array.Empty<string>();
    }

    public AdhocWorkspace Workspace { get; set; } = null!;

    public Document UseOnlyOnceDocument { get; set; } = null!;

    public DocumentId DocumentId { get; set; } = null!;
}
