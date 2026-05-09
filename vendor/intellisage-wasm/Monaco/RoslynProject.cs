using System.Net.Http;
using System.Reflection;

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
    public async Task<MetadataReference?> GetAssemblyMetadataReference(Assembly assembly)
    {
        MetadataReference? ret = null;
        var assemblyName = assembly.GetName().Name ?? "";
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
}


public class RoslynProject
{
    public record NamespaceIncludeResult(string NamespaceName, IReadOnlyList<string> AddedAssemblies, IReadOnlyList<string> MatchedAssemblies, bool Success, string Message);
    public record SourceFileSnapshot(string Path, string Content);

    private List<Assembly> Assemblies = new List<Assembly>();
    public static List<MetadataReference> MetadataReferences = new List<MetadataReference>();
    private static HashSet<string> ReferencedAssemblyNames = new HashSet<string>(StringComparer.Ordinal);
    private static readonly string[] DefaultUsings =
    {
        "System",
        "System.Collections",
        "System.Collections.Generic",
        "System.Text",
        "System.Linq",
        "System.Net.Http",
        "System.Threading.Tasks"
    };

    private static readonly CSharpParseOptions ParseOptions = CSharpParseOptions.Default
        .WithKind(SourceCodeKind.Regular)
        .WithLanguageVersion(LanguageVersion.Preview);

    private static readonly CSharpCompilationOptions CompilationOptions = new CSharpCompilationOptions(
            OutputKind.ConsoleApplication,
            usings: DefaultUsings,
            concurrentBuild: false,
            optimizationLevel: OptimizationLevel.Debug)
        .WithPlatform(Platform.AnyCpu);

    private readonly Dictionary<string, DocumentId> _additionalDocumentIds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _additionalDocumentContents = new(StringComparer.Ordinal);
    private string _primaryDocumentText = string.Empty;
    private string _primaryDocumentPath = "Code.cs";
    private string Uri {get; init;}
    public RoslynProject(string uri)
    {
        Uri = uri;

        var assemblyNames = new HashSet<string>(StringComparer.Ordinal);

        void AddAssembly(Assembly assembly)
        {
            var name = assembly.GetName().Name;
            if (!string.IsNullOrWhiteSpace(name) && assemblyNames.Add(name))
            {
                Assemblies.Add(assembly);
            }
        }

        void TryAddNamedAssembly(string assemblyName)
        {
            try
            {
                AddAssembly(Assembly.Load(assemblyName));
            }
            catch (Exception e)
            {
                Console.WriteLine($"Failed to load reference assembly {assemblyName}: {e.Message}");
            }
        }

        void TryAddTypeAssembly(Type type)
        {
            try
            {
                AddAssembly(type.Assembly);
            }
            catch (Exception e)
            {
                Console.WriteLine($"Failed to load reference assembly for {type.FullName}: {e.Message}");
            }
        }

        // Keep authoring support close to the same "core library" profile used by the BrowserCSharp runtime.
        TryAddNamedAssembly("System.Runtime");
        TryAddNamedAssembly("System.Collections");
        TryAddNamedAssembly("netstandard");
        TryAddNamedAssembly("System");
        TryAddTypeAssembly(typeof(object));
        TryAddTypeAssembly(typeof(Console));
        TryAddTypeAssembly(typeof(List<>));
        TryAddTypeAssembly(typeof(Task));
        TryAddTypeAssembly(typeof(Enumerable));
        TryAddTypeAssembly(typeof(HttpClient));
    }

    public async Task Init()
    {
        var host = MefHostServices.Create(MefHostServices.DefaultAssemblies);
        Workspace = new AdhocWorkspace(host);

        if (MetadataReferences.Count == 0)
        {
            var mh = new AssemblyMetadataHelper(Uri);

            
            foreach (var a in Assemblies)
            {
                try
                {
                    var metadataReference = await mh.GetAssemblyMetadataReference(a);
                    if (metadataReference == null)
                    {
                        Console.WriteLine($"Did not get metadata ref {a.FullName}");
                        continue;
                    }
                    MetadataReferences.Add(metadataReference);
                    var assemblyName = a.GetName().Name;
                    if (!string.IsNullOrWhiteSpace(assemblyName))
                    {
                        ReferencedAssemblyNames.Add(assemblyName);
                    }
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Could not add rdrf {e.Message}");
                }
            }
        }


        var projectInfo = ProjectInfo
            .Create(ProjectId.CreateNewId(), VersionStamp.Create(), "IntelliSage", "IntelliSage", LanguageNames.CSharp)
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
        var primaryDocumentPath = string.IsNullOrWhiteSpace(normalizedActivePath) ? "Code.cs" : normalizedActivePath;
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

        if (safeCode == _primaryDocumentText && primaryDocumentPath == _primaryDocumentPath && DictionariesEqual(_additionalDocumentContents, nextDocuments))
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

        if (primaryDocumentPath != _primaryDocumentPath)
        {
            solution = solution.WithDocumentName(DocumentId, SourceNameForPath(primaryDocumentPath));
            solution = solution.WithDocumentFolders(DocumentId, SourceFoldersForPath(primaryDocumentPath));
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
            _primaryDocumentPath = primaryDocumentPath;
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
            Console.WriteLine("Could not apply Roslyn project document snapshot.");
        }

        return Task.FromResult(Workspace.CurrentSolution.GetDocument(DocumentId)!);
    }

    public string GetDocumentPath(Document document)
    {
        if (document.Id == DocumentId)
        {
            return _primaryDocumentPath;
        }

        return NormalizeSourcePath(document.FilePath ?? document.Name);
    }

    public async Task<NamespaceIncludeResult> IncludeNamespaceAsync(string namespaceName)
    {
        namespaceName = namespaceName.Trim();
        if (string.IsNullOrWhiteSpace(namespaceName))
        {
            return new NamespaceIncludeResult(namespaceName, Array.Empty<string>(), Array.Empty<string>(), false, "Namespace is required.");
        }

        var matchingAssemblies = AppDomain.CurrentDomain
            .GetAssemblies()
            .Where(a => !a.IsDynamic)
            .Where(a => AssemblyMatchesNamespace(a, namespaceName))
            .OrderBy(a => a.GetName().Name, StringComparer.Ordinal)
            .ToList();

        if (matchingAssemblies.Count == 0)
        {
            return new NamespaceIncludeResult(
                namespaceName,
                Array.Empty<string>(),
                Array.Empty<string>(),
                false,
                $"No loaded assemblies matched namespace '{namespaceName}'."
            );
        }

        var helper = new AssemblyMetadataHelper(Uri);
        var addedAssemblyNames = new List<string>();

        foreach (var assembly in matchingAssemblies)
        {
            var assemblyName = assembly.GetName().Name;
            if (string.IsNullOrWhiteSpace(assemblyName) || ReferencedAssemblyNames.Contains(assemblyName))
            {
                continue;
            }

            try
            {
                var metadataReference = await helper.GetAssemblyMetadataReference(assembly);
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

        ApplyMetadataReferencesToWorkspace();

        var matchedAssemblyNames = matchingAssemblies
            .Select(a => a.GetName().Name)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Cast<string>()
            .ToList();

        var success = matchedAssemblyNames.Count > 0;
        var message = addedAssemblyNames.Count > 0
            ? $"Included {addedAssemblyNames.Count} assembly reference(s) for '{namespaceName}'."
            : $"Namespace '{namespaceName}' was already available or did not add new metadata references.";

        return new NamespaceIncludeResult(
            namespaceName,
            addedAssemblyNames,
            matchedAssemblyNames,
            success,
            message
        );
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

    private static bool AssemblyMatchesNamespace(Assembly assembly, string namespaceName)
    {
        var assemblyName = assembly.GetName().Name;
        if (!string.IsNullOrWhiteSpace(assemblyName))
        {
            if (assemblyName.Equals(namespaceName, StringComparison.Ordinal))
            {
                return true;
            }

            if (assemblyName.StartsWith(namespaceName + ".", StringComparison.Ordinal))
            {
                return true;
            }
        }

        try
        {
            return AssemblyDefinesNamespace(assembly.ExportedTypes, namespaceName);
        }
        catch (ReflectionTypeLoadException e)
        {
            return AssemblyDefinesNamespace(e.Types.Where(t => t != null)!.Cast<Type>(), namespaceName);
        }
        catch
        {
            return false;
        }
    }

    private static bool AssemblyDefinesNamespace(IEnumerable<Type> types, string namespaceName)
    {
        foreach (var type in types)
        {
            var typeNamespace = type.Namespace;
            if (string.IsNullOrWhiteSpace(typeNamespace))
            {
                continue;
            }

            if (typeNamespace.Equals(namespaceName, StringComparison.Ordinal))
            {
                return true;
            }

            if (typeNamespace.StartsWith(namespaceName + ".", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
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
