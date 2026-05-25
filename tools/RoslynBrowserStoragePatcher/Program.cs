using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Mono.Cecil;
using Mono.Cecil.Cil;

const string workspacesAssemblyName = "Microsoft.CodeAnalysis.Workspaces.dll";
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

UpdateBlazorBootHash(targetPath);
RefreshCompressedAsset(targetPath);
RefreshCompressedAsset(Path.Combine(Path.GetDirectoryName(targetPath)!, "blazor.boot.json"));

Console.WriteLine($"Patched Roslyn persistent storage for browser: {targetPath}");
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

static void UpdateBlazorBootHash(string assemblyPath)
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
    if (assemblies == null || !assemblies.ContainsKey(workspacesAssemblyName))
    {
        return;
    }

    var hash = Convert.ToBase64String(SHA256.HashData(File.ReadAllBytes(assemblyPath)));
    assemblies[workspacesAssemblyName] = $"sha256-{hash}";

    File.WriteAllText(
        bootJsonPath,
        bootJson.ToJsonString(new JsonSerializerOptions
        {
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            WriteIndented = true
        }) + Environment.NewLine);
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
