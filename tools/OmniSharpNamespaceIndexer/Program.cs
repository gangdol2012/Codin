using System.Text.Encodings.Web;
using System.Text.Json;
using Mono.Cecil;

if (args.Length is < 1 or > 2)
{
    Console.Error.WriteLine("Usage: OmniSharpNamespaceIndexer <framework-directory> [output-json]");
    return 2;
}

var frameworkDirectory = Path.GetFullPath(args[0]);
if (!Directory.Exists(frameworkDirectory))
{
    Console.Error.WriteLine($"Framework directory not found: {frameworkDirectory}");
    return 2;
}

var outputPath = args.Length == 2
    ? Path.GetFullPath(args[1])
    : Path.Combine(frameworkDirectory, "codecraft-namespace-index.json");

var namespaceToAssemblies = new SortedDictionary<string, SortedSet<string>>(StringComparer.Ordinal);
var assemblies = new SortedSet<string>(StringComparer.Ordinal);

var resolver = new DefaultAssemblyResolver();
resolver.AddSearchDirectory(frameworkDirectory);

foreach (var assemblyPath in Directory.EnumerateFiles(frameworkDirectory, "*.dll").OrderBy(path => path, StringComparer.Ordinal))
{
    var fileName = Path.GetFileName(assemblyPath);
    if (fileName.EndsWith(".resources.dll", StringComparison.Ordinal))
    {
        continue;
    }

    try
    {
        using var assembly = AssemblyDefinition.ReadAssembly(
            assemblyPath,
            new ReaderParameters
            {
                AssemblyResolver = resolver,
                ReadSymbols = false,
                ReadingMode = ReadingMode.Immediate
            });

        var assemblyName = assembly.Name.Name;
        if (string.IsNullOrWhiteSpace(assemblyName))
        {
            continue;
        }

        assemblies.Add(assemblyName);
        foreach (var type in assembly.MainModule.Types)
        {
            IndexTypeNamespaces(type, assemblyName, namespaceToAssemblies);
        }
    }
    catch (Exception e)
    {
        Console.Error.WriteLine($"Skipping {fileName}: {e.Message}");
    }
}

var document = new NamespaceIndexDocument(
    GeneratedAtUtc: DateTimeOffset.UtcNow,
    Assemblies: assemblies.ToArray(),
    Namespaces: namespaceToAssemblies.ToDictionary(
        entry => entry.Key,
        entry => entry.Value.ToArray(),
        StringComparer.Ordinal));

Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
File.WriteAllText(
    outputPath,
    JsonSerializer.Serialize(
        document,
        new JsonSerializerOptions
        {
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true
        }) + Environment.NewLine);

Console.WriteLine($"Generated OmniSharp namespace index: {outputPath} ({document.Namespaces.Count} namespaces, {document.Assemblies.Length} assemblies)");
return 0;

static void IndexTypeNamespaces(
    TypeDefinition type,
    string assemblyName,
    SortedDictionary<string, SortedSet<string>> namespaceToAssemblies)
{
    if (!string.IsNullOrWhiteSpace(type.Namespace))
    {
        if (!namespaceToAssemblies.TryGetValue(type.Namespace, out var assemblyNames))
        {
            assemblyNames = new SortedSet<string>(StringComparer.Ordinal);
            namespaceToAssemblies[type.Namespace] = assemblyNames;
        }

        assemblyNames.Add(assemblyName);
    }

    foreach (var nestedType in type.NestedTypes)
    {
        IndexTypeNamespaces(nestedType, assemblyName, namespaceToAssemblies);
    }
}

public sealed record NamespaceIndexDocument(
    DateTimeOffset GeneratedAtUtc,
    string[] Assemblies,
    Dictionary<string, string[]> Namespaces);
