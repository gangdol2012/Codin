using System.Net.Http;
using System.Text.Json;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;

public class AssemblyMetadataHelper
{

    private HttpClient _httpClient = new HttpClient();


    public AssemblyMetadataHelper(string uri)
    {
        _httpClient.BaseAddress = new Uri(uri);
    }

    public async Task<MetadataReference?> GetAssemblyMetadataReference(string assemblyName)
    {
        MetadataReference? ret = null;
        var assemblyUrl = $"./_framework/{assemblyName}.dll";
        try
        {
            var tmp = await _httpClient.GetAsync(assemblyUrl);
            if (tmp.IsSuccessStatusCode)
            {
                var bytes = await tmp.Content.ReadAsByteArrayAsync();
                Console.WriteLine($"Fetching assembly: {assemblyName}");
                if (assemblyName == "System.Runtime")
                {
                    var docProviderFetch = await _httpClient.GetAsync($"./System.Runtime.xml");
                    var docProviderBytes = await docProviderFetch.Content.ReadAsByteArrayAsync();
                    var documentationProvider = XmlDocumentationProvider.CreateFromBytes(docProviderBytes);
                    ret = MetadataReference.CreateFromImage(bytes, documentation: documentationProvider);
                }
                else
                {
                    ret = MetadataReference.CreateFromImage(bytes);
                }
                ret = MetadataReference.CreateFromImage(bytes);
            }
        }
        catch (Exception e)
        {
            Console.WriteLine($"Error fetching metadata {e.Message}");
        }
        return ret;
    }

    public async Task<IReadOnlyDictionary<string, IReadOnlyList<string>>> GetNamespaceIndex()
    {
        const string namespaceIndexUrl = "./_framework/codecraft-namespace-index.json";

        try
        {
            var response = await _httpClient.GetAsync(namespaceIndexUrl);
            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Namespace index not found at {namespaceIndexUrl}: {response.StatusCode}");
                return new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
            }

            await using var stream = await response.Content.ReadAsStreamAsync();
            var index = await JsonSerializer.DeserializeAsync<NamespaceIndexDocument>(
                stream,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            return index?.Namespaces?
                .Where(entry => !string.IsNullOrWhiteSpace(entry.Key))
                .ToDictionary(
                    entry => entry.Key,
                    entry => (IReadOnlyList<string>)entry.Value
                        .Where(assemblyName => !string.IsNullOrWhiteSpace(assemblyName))
                        .Distinct(StringComparer.Ordinal)
                        .OrderBy(assemblyName => assemblyName, StringComparer.Ordinal)
                        .ToArray(),
                    StringComparer.Ordinal)
                ?? new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        }
        catch (Exception e)
        {
            Console.WriteLine($"Error fetching namespace index: {e.Message}");
            return new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        }
    }
}

public sealed record NamespaceIndexDocument(Dictionary<string, string[]> Namespaces);


public class OmniSharpProject
{
    public record NamespaceIncludeResult(string NamespaceName, IReadOnlyList<string> AddedAssemblies, IReadOnlyList<string> MatchedAssemblies, bool Success, string Message);
    public record SourceFileSnapshot(string Path, string Content);

    public static List<MetadataReference> MetadataReferences = new List<MetadataReference>();
    private static HashSet<string> ReferencedAssemblyNames = new HashSet<string>(StringComparer.Ordinal);

    private static readonly string[] AutoIncludedReferenceKeys =
    {
        "System.Console",
        "System.Linq",
        "System.Net.Http",
        "System.Private.CoreLib",
        "System.Runtime",
        "System.Threading.Tasks",
        "netstandard"
    };

    private static readonly CSharpParseOptions ParseOptions = CSharpParseOptions.Default
        .WithKind(SourceCodeKind.Regular)
        .WithLanguageVersion(LanguageVersion.Preview);

    private static readonly CSharpCompilationOptions CompilationOptions = new CSharpCompilationOptions(
            OutputKind.ConsoleApplication,
            concurrentBuild: false,
            optimizationLevel: OptimizationLevel.Debug)
        .WithPlatform(Platform.AnyCpu);

    private readonly Dictionary<string, DocumentId> _additionalDocumentIds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _additionalDocumentContents = new(StringComparer.Ordinal);
    private string _primaryDocumentText = string.Empty;
    private string _primaryDocumentPath = string.Empty;
    private IReadOnlyDictionary<string, IReadOnlyList<string>> _namespaceIndex = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
    private string Uri {get; init;}
    public OmniSharpProject(string uri)
    {
        Uri = uri;
    }

    public async Task Init()
    {
        var host = MefHostServices.Create(MefHostServices.DefaultAssemblies);
        Workspace = new AdhocWorkspace(host);
        var mh = new AssemblyMetadataHelper(Uri);
        _namespaceIndex = await mh.GetNamespaceIndex();

        if (MetadataReferences.Count == 0)
        {
            foreach (var referenceKey in AutoIncludedReferenceKeys)
            {
                await AddMetadataReferencesForIncludeKey(referenceKey, mh);
            }
        }


        var projectInfo = ProjectInfo
            .Create(ProjectId.CreateNewId(), VersionStamp.Create(), "OmniSharp", "OmniSharp", LanguageNames.CSharp)
            .WithMetadataReferences(MetadataReferences)
            .WithCompilationOptions(CompilationOptions)
            .WithParseOptions(ParseOptions);

        var project = Workspace.AddProject(projectInfo);

        UseOnlyOnceDocument = Workspace.AddDocument(project.Id, "Code.cs", SourceText.From(string.Empty));
        DocumentId = UseOnlyOnceDocument.Id;

    }

    public Task<Document> UpdateDocumentAsync(string code)
    {
        return UpdateProjectDocumentsAsync(code, null, Array.Empty<SourceFileSnapshot>());
    }

    public Task<Document> UpdateProjectDocumentsAsync(string code, string? activePath, IEnumerable<SourceFileSnapshot>? files)
    {
        var safeCode = code ?? string.Empty;
        var normalizedActivePath = NormalizeSourcePath(activePath);
        var nextDocuments = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var file in files ?? Array.Empty<SourceFileSnapshot>())
        {
            var path = NormalizeSourcePath(file.Path);
            if (string.IsNullOrWhiteSpace(path) || path.Equals(normalizedActivePath, StringComparison.Ordinal))
            {
                continue;
            }

            nextDocuments[path] = file.Content ?? string.Empty;
        }

        if (safeCode == _primaryDocumentText &&
            normalizedActivePath == _primaryDocumentPath &&
            DictionariesEqual(_additionalDocumentContents, nextDocuments))
        {
            return Task.FromResult(Workspace.CurrentSolution.GetDocument(DocumentId)!);
        }

        var projectId = DocumentId.ProjectId;
        var solution = Workspace.CurrentSolution;
        var nextDocumentIds = new Dictionary<string, DocumentId>(StringComparer.Ordinal);

        if (safeCode != _primaryDocumentText)
        {
            solution = solution.WithDocumentText(DocumentId, SourceText.From(safeCode));
        }

        if (!string.IsNullOrWhiteSpace(normalizedActivePath) && normalizedActivePath != _primaryDocumentPath)
        {
            solution = solution
                .WithDocumentName(DocumentId, SourceNameForPath(normalizedActivePath))
                .WithDocumentFilePath(DocumentId, normalizedActivePath);
        }

        foreach (var stalePath in _additionalDocumentIds.Keys.Where(path => !nextDocuments.ContainsKey(path)).ToArray())
        {
            solution = solution.RemoveDocument(_additionalDocumentIds[stalePath]);
        }

        foreach (var (path, content) in nextDocuments)
        {
            if (_additionalDocumentIds.TryGetValue(path, out var documentId))
            {
                nextDocumentIds[path] = documentId;
                if (!_additionalDocumentContents.TryGetValue(path, out var previousContent) || previousContent != content)
                {
                    solution = solution.WithDocumentText(documentId, SourceText.From(content));
                }
                continue;
            }

            var newDocumentId = DocumentId.CreateNewId(projectId, path);
            nextDocumentIds[path] = newDocumentId;
            solution = solution.AddDocument(
                newDocumentId,
                SourceNameForPath(path),
                SourceText.From(content),
                SourceFoldersForPath(path),
                filePath: path);
        }

        if (Workspace.TryApplyChanges(solution))
        {
            _primaryDocumentText = safeCode;
            _primaryDocumentPath = normalizedActivePath;
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
        }
        else
        {
            Console.WriteLine("Could not apply OmniSharp project document snapshot.");
        }

        return Task.FromResult(Workspace.CurrentSolution.GetDocument(DocumentId)!);
    }

    public async Task<NamespaceIncludeResult> IncludeNamespaceAsync(string namespaceName)
    {
        namespaceName = namespaceName.Trim();
        if (string.IsNullOrWhiteSpace(namespaceName))
        {
            return new NamespaceIncludeResult(namespaceName, Array.Empty<string>(), Array.Empty<string>(), false, "Namespace is required.");
        }

        var matchingAssemblyNames = GetAssemblyNamesForNamespace(namespaceName)
            .ToList();

        if (matchingAssemblyNames.Count == 0)
        {
            return new NamespaceIncludeResult(
                namespaceName,
                Array.Empty<string>(),
                Array.Empty<string>(),
                false,
                $"No .NET 8 assemblies matched namespace '{namespaceName}'."
            );
        }

        var addedAssemblyNames = await AddMetadataReferencesForIncludeKey(namespaceName, new AssemblyMetadataHelper(Uri), matchingAssemblyNames);

        ApplyMetadataReferencesToWorkspace();

        var success = matchingAssemblyNames.Count > 0;
        var message = addedAssemblyNames.Count > 0
            ? $"Included {addedAssemblyNames.Count} assembly reference(s) for '{namespaceName}'."
            : $"Namespace '{namespaceName}' was already available or did not add new metadata references.";

        return new NamespaceIncludeResult(
            namespaceName,
            addedAssemblyNames,
            matchingAssemblyNames,
            success,
            message
        );
    }

    private async Task<IReadOnlyList<string>> AddMetadataReferencesForIncludeKey(
        string includeKey,
        AssemblyMetadataHelper helper,
        IReadOnlyCollection<string>? matchingAssemblyNames = null)
    {
        var addedAssemblyNames = new List<string>();
        foreach (var assemblyName in matchingAssemblyNames ?? GetAssemblyNamesForNamespace(includeKey))
        {
            if (string.IsNullOrWhiteSpace(assemblyName) || ReferencedAssemblyNames.Contains(assemblyName))
            {
                continue;
            }

            try
            {
                var metadataReference = await helper.GetAssemblyMetadataReference(assemblyName);
                if (metadataReference == null)
                {
                    continue;
                }

                MetadataReferences.Add(metadataReference);
                ReferencedAssemblyNames.Add(assemblyName);
                addedAssemblyNames.Add(assemblyName);
            }
            catch (Exception e)
            {
                Console.WriteLine($"Failed to include metadata for {assemblyName}: {e.Message}");
            }
        }

        return addedAssemblyNames;
    }

    private IReadOnlyCollection<string> GetAssemblyNamesForNamespace(string namespaceName)
    {
        var assemblyNames = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var (indexedNamespace, indexedAssemblyNames) in _namespaceIndex)
        {
            if (!NamespaceMatches(indexedNamespace, namespaceName))
            {
                continue;
            }

            foreach (var assemblyName in indexedAssemblyNames)
            {
                assemblyNames.Add(assemblyName);
            }
        }

        foreach (var assemblyName in GetIndexedAssemblyNames())
        {
            if (NamespaceMatches(assemblyName, namespaceName))
            {
                assemblyNames.Add(assemblyName);
            }
        }

        return assemblyNames.ToArray();
    }

    private IReadOnlyCollection<string> GetIndexedAssemblyNames()
    {
        var assemblyNames = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var indexedAssemblyNames in _namespaceIndex.Values)
        {
            foreach (var assemblyName in indexedAssemblyNames)
            {
                assemblyNames.Add(assemblyName);
            }
        }

        return assemblyNames.ToArray();
    }

    private static bool NamespaceMatches(string candidate, string namespaceName)
    {
        if (candidate.Equals(namespaceName, StringComparison.Ordinal))
        {
            return true;
        }

        return candidate.StartsWith(namespaceName + ".", StringComparison.Ordinal);
    }

    private void ApplyMetadataReferencesToWorkspace()
    {
        if (Workspace == null || DocumentId == null)
        {
            return;
        }

        var projectId = DocumentId.ProjectId;
        var updatedSolution = Workspace.CurrentSolution.WithProjectMetadataReferences(projectId, MetadataReferences);
        Workspace.TryApplyChanges(updatedSolution);
    }

    private static bool DictionariesEqual(IReadOnlyDictionary<string, string> left, IReadOnlyDictionary<string, string> right)
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

    public AdhocWorkspace Workspace { get; set; }

    public Document UseOnlyOnceDocument { get; set; }

    public DocumentId DocumentId { get; set; }
}
