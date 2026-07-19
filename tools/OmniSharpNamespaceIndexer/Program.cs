using System.Text.Encodings.Web;
using System.Text.Json;
using System.Security.Cryptography;
using System.IO.Compression;
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
var assemblyReferences = new SortedDictionary<string, SortedSet<string>>(StringComparer.Ordinal);
var assemblyAssets = new SortedDictionary<string, string>(StringComparer.Ordinal);
var assemblies = new SortedSet<string>(StringComparer.Ordinal);
var indexingFailed = false;

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
            Console.Error.WriteLine($"Invalid assembly identity in {fileName}.");
            indexingFailed = true;
            continue;
        }

        var assetName = Path.GetFileNameWithoutExtension(fileName);
        if (!assemblyName.Equals(assetName, StringComparison.Ordinal))
        {
            // Browser metadata requests are exact static paths of the form
            // `{assembly identity}.dll`; accepting a differently named asset here would
            // generate an index entry that can only produce a 404 at runtime.
            Console.Error.WriteLine(
                $"Assembly identity '{assemblyName}' does not match static asset '{fileName}'.");
            indexingFailed = true;
            continue;
        }

        if (!assemblies.Add(assemblyName))
        {
            Console.Error.WriteLine($"Duplicate assembly identity '{assemblyName}' in {frameworkDirectory}.");
            indexingFailed = true;
            continue;
        }

        assemblyReferences[assemblyName] = new SortedSet<string>(
            assembly.MainModule.AssemblyReferences
                .Select(reference => reference.Name)
                .Where(referenceName => !string.IsNullOrWhiteSpace(referenceName)),
            StringComparer.Ordinal);
        assemblyAssets[assemblyName] = assemblyPath;

        foreach (var type in assembly.MainModule.Types)
        {
            IndexTypeNamespaces(type, assemblyName, namespaceToAssemblies);
        }
    }
    catch (Exception e)
    {
        Console.Error.WriteLine($"Could not index {fileName}: {e.Message}");
        indexingFailed = true;
    }
}

if (indexingFailed)
{
    Console.Error.WriteLine("Namespace index generation failed; no partial manifest was written.");
    return 1;
}

if (assemblies.Count == 0)
{
    Console.Error.WriteLine($"No reference assemblies were found in {frameworkDirectory}.");
    return 1;
}

// Compatibility facades in Microsoft.NETCore.App.Ref intentionally mention optional
// package assemblies (for example System.Drawing.Common) that are not members of the
// targeting pack. The static closure is exact by construction: retain only edges whose
// target is one of the published reference assets, and never emit an unprobeable URL.
var referencePackAssemblyReferences = assemblyReferences.ToDictionary(
    entry => entry.Key,
    entry => new SortedSet<string>(
        entry.Value.Where(assemblies.Contains),
        StringComparer.Ordinal),
    StringComparer.Ordinal);

var referenceClosures = assemblies.ToDictionary(
    assemblyName => assemblyName,
    assemblyName => ResolveReferenceClosure(assemblyName, referencePackAssemblyReferences),
    StringComparer.Ordinal);
var expandedNamespaceToAssemblies = namespaceToAssemblies.ToDictionary(
    entry => entry.Key,
    entry => entry.Value
        .SelectMany(assemblyName => referenceClosures[assemblyName])
        .Distinct(StringComparer.Ordinal)
        .OrderBy(assemblyName => assemblyName, StringComparer.Ordinal)
        .ToArray(),
    StringComparer.Ordinal);

Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
var outputDirectory = Path.GetDirectoryName(outputPath)!;
var referencePack = CreateReferencePack(
    Path.Combine(outputDirectory, "codecraft-reference-pack.bin"),
    assemblyAssets);
CreateCompressedSidecars(Path.Combine(outputDirectory, referencePack.Path));
var documentation = TryCreateDocumentationAsset(outputDirectory);

var document = new NamespaceIndexDocument(
    Assemblies: assemblies.ToArray(),
    AssemblyReferences: referencePackAssemblyReferences.ToDictionary(
        entry => entry.Key,
        entry => entry.Value.ToArray(),
        StringComparer.Ordinal),
    ReferencePack: referencePack,
    Documentation: documentation,
    Namespaces: expandedNamespaceToAssemblies.ToDictionary(
        entry => entry.Key,
        entry => entry.Value,
        StringComparer.Ordinal));

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

static ReferencePackDocument CreateReferencePack(
    string outputPath,
    IReadOnlyDictionary<string, string> assemblyAssets)
{
    var temporaryPath = outputPath + ".tmp";
    var slices = new Dictionary<string, ReferencePackSliceDocument>(StringComparer.Ordinal);
    using var packHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
    long offset = 0;

    try
    {
        using (var output = new FileStream(
                   temporaryPath,
                   FileMode.Create,
                   FileAccess.Write,
                   FileShare.None,
                   bufferSize: 128 * 1024,
                   FileOptions.SequentialScan))
        {
            foreach (var (assemblyName, assemblyPath) in assemblyAssets)
            {
                var assemblyBytes = File.ReadAllBytes(assemblyPath);
                if (assemblyBytes.Length == 0)
                {
                    throw new InvalidDataException($"Reference asset '{assemblyPath}' is empty.");
                }

                output.Write(assemblyBytes);
                packHash.AppendData(assemblyBytes);
                slices[assemblyName] = new ReferencePackSliceDocument(
                    Offset: offset,
                    Length: assemblyBytes.Length,
                    Sha256: Convert.ToHexString(SHA256.HashData(assemblyBytes)).ToLowerInvariant());
                offset = checked(offset + assemblyBytes.Length);
            }

            output.Flush(flushToDisk: true);
        }

        File.Move(temporaryPath, outputPath, overwrite: true);
    }
    finally
    {
        if (File.Exists(temporaryPath))
        {
            File.Delete(temporaryPath);
        }
    }

    return new ReferencePackDocument(
        Path: Path.GetFileName(outputPath),
        Length: offset,
        Sha256: Convert.ToHexString(packHash.GetHashAndReset()).ToLowerInvariant(),
        Assemblies: slices);
}

static void CreateCompressedSidecars(string inputPath)
{
    var bytes = File.ReadAllBytes(inputPath);
    WriteAtomically(
        inputPath + ".gz",
        output =>
        {
            using var gzip = new GZipStream(output, CompressionLevel.SmallestSize, leaveOpen: true);
            gzip.Write(bytes);
        });
    WriteAtomically(
        inputPath + ".br",
        output =>
        {
            using var brotli = new BrotliStream(output, CompressionLevel.SmallestSize, leaveOpen: true);
            brotli.Write(bytes);
        });
}

static StaticAssetDocument? TryCreateDocumentationAsset(string manifestDirectory)
{
    // The namespace manifest is published in `<static-root>/_framework`, while the
    // documentation file is a normal root-relative static asset. Deriving the path
    // from the manifest location keeps custom/non-root deployment URL prefixes out of
    // the manifest and lets the browser resolve everything against the actual request.
    var staticRootDirectory = Directory.GetParent(manifestDirectory)?.FullName;
    if (string.IsNullOrEmpty(staticRootDirectory))
    {
        return null;
    }

    const string documentationAssetName = "System.Runtime.xml";
    var documentationPath = Path.Combine(staticRootDirectory, documentationAssetName);
    if (!File.Exists(documentationPath))
    {
        // Documentation is an optional OmniSharp enhancement. An index generated for
        // a standalone reference-pack fixture must remain valid without it; the browser
        // wrapper simply leaves the original raw request untouched in that case.
        return null;
    }

    var bytes = File.ReadAllBytes(documentationPath);
    if (bytes.Length == 0)
    {
        throw new InvalidDataException($"Documentation asset '{documentationPath}' is empty.");
    }

    WriteAtomically(
        documentationPath + ".gz",
        output =>
        {
            using var gzip = new GZipStream(output, CompressionLevel.SmallestSize, leaveOpen: true);
            gzip.Write(bytes);
        });

    return new StaticAssetDocument(
        Path: documentationAssetName,
        Length: bytes.LongLength,
        Sha256: Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant());
}

static void WriteAtomically(string outputPath, Action<Stream> write)
{
    // Static prebuilds can overlap (for example, an explicit runtime publish followed
    // immediately by the app's sync step). A fixed ".tmp" path lets one indexer move
    // another process's file and leaves the loser with FileNotFoundException.
    var temporaryPath = $"{outputPath}.{Environment.ProcessId}.{Guid.NewGuid():N}.tmp";
    try
    {
        using (var output = new FileStream(
                   temporaryPath,
                   FileMode.Create,
                   FileAccess.Write,
                   FileShare.None,
                   bufferSize: 128 * 1024,
                   FileOptions.SequentialScan))
        {
            write(output);
            output.Flush(flushToDisk: true);
        }
        File.Move(temporaryPath, outputPath, overwrite: true);
    }
    finally
    {
        if (File.Exists(temporaryPath))
        {
            File.Delete(temporaryPath);
        }
    }
}

static string[] ResolveReferenceClosure(
    string rootAssemblyName,
    IReadOnlyDictionary<string, SortedSet<string>> assemblyReferences)
{
    var closure = new SortedSet<string>(StringComparer.Ordinal);
    var pending = new Stack<string>();
    pending.Push(rootAssemblyName);

    while (pending.Count > 0)
    {
        var assemblyName = pending.Pop();
        if (!closure.Add(assemblyName))
        {
            continue;
        }

        foreach (var referenceName in assemblyReferences[assemblyName])
        {
            if (!closure.Contains(referenceName))
            {
                pending.Push(referenceName);
            }
        }
    }

    return closure.ToArray();
}

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
