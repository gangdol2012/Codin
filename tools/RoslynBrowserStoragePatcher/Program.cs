using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Mono.Cecil;
using Mono.Cecil.Cil;

const string workspacesAssemblyName = "Microsoft.CodeAnalysis.Workspaces.dll";
const string workerCoreAssemblyName = "BlazorWorker.Core.dll";
// Keep Roslyn's SQLite storage path enabled, but avoid the browser-unsupported Process API in its cache identity.
const string browserStorageIdentity = "CodeCraft.OmniSharpWasm.Browser";

if (args.Length != 1)
{
    Console.Error.WriteLine($"Usage: RoslynBrowserStoragePatcher <path-to-{workspacesAssemblyName}-or-framework-directory>");
    return 2;
}

var targetPath = ResolveTargetPath(args[0]);
if (!File.Exists(targetPath))
{
    Console.Error.WriteLine($"Roslyn workspace assembly not found: {targetPath}");
    return 2;
}

var changed = PatchDefaultPersistentStorageConfiguration(targetPath);
if (!changed)
{
    Console.WriteLine($"{workspacesAssemblyName} already has browser-safe persistent storage identity.");
}

var frameworkDirectory = Path.GetDirectoryName(targetPath)!;
var workerCorePath = Path.Combine(frameworkDirectory, workerCoreAssemblyName);
if (!File.Exists(workerCorePath))
{
    throw new FileNotFoundException(
        "The BlazorWorker core assembly required by the browser authoring worker is missing.",
        workerCorePath);
}

var workerChanged = PatchWorkerStaticCompressionLoader(workerCorePath);
if (!workerChanged)
{
    Console.WriteLine($"{workerCoreAssemblyName} already uses verified static-host compression.");
}

UpdateBlazorBootHash(targetPath, workspacesAssemblyName);
UpdateBlazorBootHash(workerCorePath, workerCoreAssemblyName);
RefreshCompressedAsset(targetPath);
RefreshCompressedAsset(workerCorePath);
RefreshCompressedAsset(Path.Combine(frameworkDirectory, "blazor.boot.json"));

Console.WriteLine($"Prepared browser-safe Roslyn and BlazorWorker assets in: {frameworkDirectory}");
return 0;

static string ResolveTargetPath(string input)
{
    var fullPath = Path.GetFullPath(input);
    if (Directory.Exists(fullPath))
    {
        return Path.Combine(fullPath, workspacesAssemblyName);
    }

    return fullPath;
}

static bool PatchDefaultPersistentStorageConfiguration(string assemblyPath)
{
    var resolver = new DefaultAssemblyResolver();
    resolver.AddSearchDirectory(Path.GetDirectoryName(assemblyPath)!);

    using var assembly = AssemblyDefinition.ReadAssembly(
        assemblyPath,
        new ReaderParameters
        {
            AssemblyResolver = resolver,
            ReadSymbols = false,
            ReadingMode = ReadingMode.Immediate
        });

    var type = assembly.MainModule.GetType("Microsoft.CodeAnalysis.Host.DefaultPersistentStorageConfiguration")
        ?? throw new InvalidOperationException("Could not find DefaultPersistentStorageConfiguration.");

    var staticConstructor = type.Methods.SingleOrDefault(method => method.IsConstructor && method.IsStatic)
        ?? throw new InvalidOperationException("Could not find DefaultPersistentStorageConfiguration static constructor.");

    var safeNameMethod = type.Methods.SingleOrDefault(method => method.Name == "SafeName" && method.Parameters.Count == 1)
        ?? throw new InvalidOperationException("Could not find DefaultPersistentStorageConfiguration.SafeName.");

    var instructions = staticConstructor.Body.Instructions;
    if (instructions.Any(instruction => instruction.OpCode == OpCodes.Ldstr
        && string.Equals(instruction.Operand as string, browserStorageIdentity, StringComparison.Ordinal)))
    {
        return false;
    }

    var processCall = instructions.FirstOrDefault(instruction =>
        instruction.Operand is MethodReference method
        && method.Name == "GetCurrentProcess"
        && method.DeclaringType.FullName == "System.Diagnostics.Process")
        ?? throw new InvalidOperationException("Could not find Process.GetCurrentProcess call to patch.");

    var safeNameCall = instructions
        .Skip(instructions.IndexOf(processCall))
        .FirstOrDefault(instruction =>
            (instruction.OpCode == OpCodes.Call || instruction.OpCode == OpCodes.Callvirt)
            && instruction.Operand is MethodReference method
            && method.Resolve() == safeNameMethod)
        ?? throw new InvalidOperationException("Could not find SafeName call after Process.GetCurrentProcess.");

    processCall.OpCode = OpCodes.Ldstr;
    processCall.Operand = browserStorageIdentity;

    for (var current = processCall.Next; current != null && current != safeNameCall; current = current.Next)
    {
        current.OpCode = OpCodes.Nop;
        current.Operand = null;
    }

    WriteAssemblyAtomically(assembly, assemblyPath);
    return true;
}

static bool PatchWorkerStaticCompressionLoader(string assemblyPath)
{
    const string marker = "installStaticAssetByteLoader";
    const string originalRuntimeCreation = """
                const { dotnet } = await import(`${initConf.appRoot}/${initConf.wasmRoot}/${dotnetjsfilename}`);

                const { setModuleImports, getAssemblyExports } = await dotnet
                    .withDiagnosticTracing(initConf.debug)
                    .withEnvironmentVariables(initConf.envMap)
                    .create();
""";
    const string compressedRuntimeCreation = """
                const { dotnet } = await import(`${initConf.appRoot}/${initConf.wasmRoot}/${dotnetjsfilename}`);
                let runtimeBuilder = dotnet
                    .withDiagnosticTracing(initConf.debug)
                    .withEnvironmentVariables(initConf.envMap);
                try {
                    const { createVerifiedGzipBootResourceLoader, installStaticAssetByteLoader, installVerifiedReferencePackFetch } = await import(`${initConf.appRoot}/boot-resource-loader.js`);
                    installVerifiedReferencePackFetch();
                    installStaticAssetByteLoader();
                    runtimeBuilder = runtimeBuilder.withResourceLoader(createVerifiedGzipBootResourceLoader());
                } catch (error) {
                    console.warn("BlazorWorker is using the default boot-resource loader.", error);
                }
                const { setModuleImports, getAssemblyExports } = await runtimeBuilder.create();
""";
    const string legacyCompressedRuntimeCreation = """
                const { dotnet } = await import(`${initConf.appRoot}/${initConf.wasmRoot}/${dotnetjsfilename}`);
                let runtimeBuilder = dotnet
                    .withDiagnosticTracing(initConf.debug)
                    .withEnvironmentVariables(initConf.envMap);
                try {
                    const { createVerifiedGzipBootResourceLoader } = await import(`${initConf.appRoot}/boot-resource-loader.js`);
                    runtimeBuilder = runtimeBuilder.withResourceLoader(createVerifiedGzipBootResourceLoader());
                } catch (error) {
                    console.warn("BlazorWorker is using the default boot-resource loader.", error);
                }
                const { setModuleImports, getAssemblyExports } = await runtimeBuilder.create();
""";
    const string referencePackCompressedRuntimeCreation = """
                const { dotnet } = await import(`${initConf.appRoot}/${initConf.wasmRoot}/${dotnetjsfilename}`);
                let runtimeBuilder = dotnet
                    .withDiagnosticTracing(initConf.debug)
                    .withEnvironmentVariables(initConf.envMap);
                try {
                    const { createVerifiedGzipBootResourceLoader, installVerifiedReferencePackFetch } = await import(`${initConf.appRoot}/boot-resource-loader.js`);
                    installVerifiedReferencePackFetch();
                    runtimeBuilder = runtimeBuilder.withResourceLoader(createVerifiedGzipBootResourceLoader());
                } catch (error) {
                    console.warn("BlazorWorker is using the default boot-resource loader.", error);
                }
                const { setModuleImports, getAssemblyExports } = await runtimeBuilder.create();
""";

    var resolver = new DefaultAssemblyResolver();
    resolver.AddSearchDirectory(Path.GetDirectoryName(assemblyPath)!);

    using var assembly = AssemblyDefinition.ReadAssembly(
        assemblyPath,
        new ReaderParameters
        {
            AssemblyResolver = resolver,
            ReadSymbols = false,
            ReadingMode = ReadingMode.Immediate
        });

    var scriptResources = assembly.MainModule.Resources
        .OfType<EmbeddedResource>()
        .Select(resource => new
        {
            Resource = resource,
            Bytes = resource.GetResourceData()
        })
        .Select(resource => new
        {
            resource.Resource,
            resource.Bytes,
            Script = Encoding.UTF8.GetString(resource.Bytes)
        })
        .Where(resource => resource.Script.Contains(
            "window.BlazorWorker = function",
            StringComparison.Ordinal))
        .ToArray();
    if (scriptResources.Length != 1)
    {
        throw new InvalidOperationException(
            $"Expected exactly one embedded BlazorWorker bootstrap script, found {scriptResources.Length}.");
    }

    var scriptResource = scriptResources[0];
    var workerScript = scriptResource.Script;
    if (workerScript.Contains(marker, StringComparison.Ordinal))
    {
        return false;
    }
    var newline = workerScript.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
    var exactOriginalRuntimeCreation = originalRuntimeCreation.Replace("\n", newline, StringComparison.Ordinal);
    var exactLegacyRuntimeCreation = legacyCompressedRuntimeCreation.Replace("\n", newline, StringComparison.Ordinal);
    var exactReferencePackRuntimeCreation = referencePackCompressedRuntimeCreation.Replace("\n", newline, StringComparison.Ordinal);
    var exactCompressedRuntimeCreation = compressedRuntimeCreation.Replace("\n", newline, StringComparison.Ordinal);
    var matchedRuntimeCreation = workerScript.Contains(exactOriginalRuntimeCreation, StringComparison.Ordinal)
        ? exactOriginalRuntimeCreation
        : workerScript.Contains(exactReferencePackRuntimeCreation, StringComparison.Ordinal)
            ? exactReferencePackRuntimeCreation
            : workerScript.Contains(exactLegacyRuntimeCreation, StringComparison.Ordinal)
                ? exactLegacyRuntimeCreation
                : null;
    if (matchedRuntimeCreation == null)
    {
        throw new InvalidOperationException(
            "The embedded BlazorWorker runtime bootstrap has changed; refusing an unsafe approximate patch.");
    }

    var patchedScript = workerScript.Replace(
        matchedRuntimeCreation,
        exactCompressedRuntimeCreation,
        StringComparison.Ordinal);
    var resourceIndex = assembly.MainModule.Resources.IndexOf(scriptResource.Resource);
    assembly.MainModule.Resources[resourceIndex] = new EmbeddedResource(
        scriptResource.Resource.Name,
        scriptResource.Resource.Attributes,
        Encoding.UTF8.GetBytes(patchedScript));
    WriteAssemblyAtomically(assembly, assemblyPath);
    return true;
}

static void WriteAssemblyAtomically(AssemblyDefinition assembly, string assemblyPath)
{
    var tempPath = $"{assemblyPath}.tmp";
    if (File.Exists(tempPath))
    {
        File.Delete(tempPath);
    }

    assembly.Write(tempPath, new WriterParameters { WriteSymbols = false });
    File.Move(tempPath, assemblyPath, overwrite: true);
}

static void UpdateBlazorBootHash(string assemblyPath, string assemblyName)
{
    var frameworkDirectory = Path.GetDirectoryName(assemblyPath)!;
    var bootJsonPath = Path.Combine(frameworkDirectory, "blazor.boot.json");
    if (!File.Exists(bootJsonPath))
    {
        return;
    }

    var bootJson = JsonNode.Parse(File.ReadAllText(bootJsonPath))
        ?? throw new InvalidOperationException("Could not parse blazor.boot.json.");

    var assemblies = bootJson["resources"]?["assembly"]?.AsObject();
    if (assemblies == null || !assemblies.ContainsKey(assemblyName))
    {
        return;
    }

    var hash = Convert.ToBase64String(SHA256.HashData(File.ReadAllBytes(assemblyPath)));
    assemblies[assemblyName] = $"sha256-{hash}";
    UpdateBlazorResourcesHash(bootJson);

    File.WriteAllText(
        bootJsonPath,
        bootJson.ToJsonString(new JsonSerializerOptions
        {
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            WriteIndented = true
        }) + Environment.NewLine);
}

static void UpdateBlazorResourcesHash(JsonNode bootJson)
{
    var resources = bootJson["resources"]?.AsObject();
    if (resources == null)
    {
        return;
    }

    // Match Microsoft.NET.Sdk.WebAssembly.Pack.Tasks' ComputeResourcesHash exactly.
    // The aggregate is a stable concatenation of the individual resource hashes;
    // it is used as the application cache identity by the Blazor boot loader.
    var hashInput = new StringBuilder();
    foreach (var resourceKind in new[]
    {
        "assembly",
        "jsModuleWorker",
        "jsModuleNative",
        "jsModuleRuntime",
        "wasmNative",
        "wasmSymbols",
        "icu",
        "runtime",
        "lazyAssembly"
    })
    {
        AppendResourceHashes(hashInput, resources[resourceKind] as JsonObject);
    }

    foreach (var resourceKind in new[] { "satelliteResources", "vfs" })
    {
        if (resources[resourceKind] is not JsonObject groupedResources)
        {
            continue;
        }

        foreach (var group in groupedResources)
        {
            AppendResourceHashes(hashInput, group.Value as JsonObject);
        }
    }

    var aggregateHash = SHA256.HashData(Encoding.UTF8.GetBytes(hashInput.ToString()));
    resources["hash"] = $"sha256-{Convert.ToBase64String(aggregateHash)}";
}

static void AppendResourceHashes(StringBuilder destination, JsonObject? resources)
{
    if (resources == null)
    {
        return;
    }

    foreach (var hash in resources
        .Select(resource => resource.Value?.GetValue<string>())
        .Where(hash => hash != null)
        .OrderBy(hash => hash))
    {
        destination.Append(hash);
    }
}

static void RefreshCompressedAsset(string path)
{
    if (!File.Exists(path))
    {
        return;
    }

    var bytes = File.ReadAllBytes(path);
    var gzipPath = $"{path}.gz";
    if (File.Exists(gzipPath))
    {
        using var gzipFile = File.Create(gzipPath);
        using var gzip = new GZipStream(gzipFile, CompressionLevel.SmallestSize);
        gzip.Write(bytes);
    }

    var brotliPath = $"{path}.br";
    if (File.Exists(brotliPath))
    {
        using var brotliFile = File.Create(brotliPath);
        using var brotli = new BrotliStream(brotliFile, CompressionLevel.SmallestSize);
        brotli.Write(bytes);
    }
}
