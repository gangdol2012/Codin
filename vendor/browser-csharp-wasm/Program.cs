using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using CodeCraft.CSharp;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Emit;
using Microsoft.JSInterop;

namespace BrowserCSharp
{
	public static class Program
	{
		private const string frameworkBinUri = "_framework/_bin";
		private const string namespaceIndexUri = "_framework/_bin/codecraft-namespace-index.json";
		private const string codecraftWorkspaceRoot = "/workspace";
		private const string defaultScriptSourcePath = "Script.cs";
		private static readonly IImmutableSet<string> autoIncludedReferenceKeys = ImmutableHashSet.Create(
			"mscorlib",
			"netstandard",
			"System.Core",
			"System.Net.Http",
			"System.Memory"
		);

		private static readonly SemaphoreSlim referenceGate = new SemaphoreSlim(1, 1);
		private static readonly HashSet<string> loadedReferenceAssemblyNames = new HashSet<string>(StringComparer.Ordinal);
		private static Task<PortableExecutableReference[]> loadedReferences;
		private static string runtimeBaseUri;
		private static NamespaceIndexDocument namespaceIndex;

		private static IJSRuntime jsRuntime;

		private static IDictionary<string, ScriptContext> previousCompilations = new Dictionary<string, ScriptContext>();

		private static readonly JsonSerializerOptions projectConfigurationJsonOptions = new JsonSerializerOptions
		{
			PropertyNameCaseInsensitive = true
		};

		private static CSharpProjectConfiguration ParseProjectConfiguration(string configurationJson)
		{
			if (String.IsNullOrWhiteSpace(configurationJson))
			{
				return null;
			}

			try
			{
				return JsonSerializer.Deserialize<CSharpProjectConfiguration>(
					configurationJson,
					projectConfigurationJsonOptions
				);
			}
			catch (Exception error)
			{
				throw new ArgumentException("The C# project configuration payload is invalid.", nameof(configurationJson), error);
			}
		}

		public static void Main()
		{
			WebAssemblyHostBuilder builder = WebAssemblyHostBuilder.CreateDefault();
			WebAssemblyHost host = builder.Build();
			jsRuntime = (IJSRuntime)host.Services.GetService(typeof(IJSRuntime));

			runtimeBaseUri = builder.HostEnvironment.BaseAddress;
			loadedReferences = GetReferences(runtimeBaseUri);
			loadedReferences.GetAwaiter().OnCompleted(notifyJS);

			static void notifyJS()
			{
				if (loadedReferences.IsCompletedSuccessfully)
				{
					jsRuntime.InvokeVoidAsync("BrowserCSharp.loaded");
				}
				else
				{
					jsRuntime.InvokeVoidAsync("BrowserCSharp.failed");
				}
			}
		}

		private static Task<PortableExecutableReference[]> GetReferences(string baseUri)
		{
			async Task<PortableExecutableReference[]> loadReferences()
			{
				using HttpClient client = new HttpClient();
				client.BaseAddress = new Uri(baseUri);
				await referenceGate.WaitAsync().ConfigureAwait(false);
				try
				{
					namespaceIndex = await LoadNamespaceIndex(client).ConfigureAwait(false);
					IReadOnlyCollection<string> assemblyNames = ResolveAssemblyNamesForIncludeKeys(namespaceIndex, autoIncludedReferenceKeys);
					if (assemblyNames.Count == 0)
					{
						throw new Exception("Could not resolve auto-included references from runtime namespace index.");
					}

					PortableExecutableReference[] references = await LoadMetadataReferences(client, assemblyNames, loadedReferenceAssemblyNames).ConfigureAwait(false);
					loadedReferenceAssemblyNames.Clear();
					foreach (string assemblyName in assemblyNames)
					{
						loadedReferenceAssemblyNames.Add(assemblyName);
					}
					return references;
				}
				finally
				{
					referenceGate.Release();
				}
			}

			return loadReferences();
		}

		private static async Task<PortableExecutableReference[]> LoadMetadataReferences(
			HttpClient client,
			IEnumerable<string> assemblyNames,
			ISet<string> excludedAssemblyNames = null)
		{
			static PortableExecutableReference toReference(Task<Stream> completedTask)
			{
				if (completedTask.IsCompletedSuccessfully)
				{
					return MetadataReference.CreateFromStream(completedTask.Result);
				}

				throw new Exception("Could not load a reference required for runtime compilation.", completedTask.Exception);
			}

			IDictionary<string, Task<PortableExecutableReference>> foundReferences = new Dictionary<string, Task<PortableExecutableReference>>();
			foreach (string assemblyName in assemblyNames.Where(name => !String.IsNullOrWhiteSpace(name)).Distinct(StringComparer.Ordinal))
			{
				if (excludedAssemblyNames != null && excludedAssemblyNames.Contains(assemblyName))
				{
					continue;
				}

				Task<PortableExecutableReference> task = client.GetStreamAsync(Path.Join(frameworkBinUri, $"{assemblyName}.dll")).ContinueWith(toReference);
				foundReferences.Add(assemblyName, task);
			}

			return await Task.WhenAll(foundReferences.Values).ConfigureAwait(false);
		}

		private static async Task<NamespaceIndexDocument> LoadNamespaceIndex(HttpClient client)
		{
			using Stream stream = await client.GetStreamAsync(namespaceIndexUri).ConfigureAwait(false);
			NamespaceIndexDocument index = await JsonSerializer.DeserializeAsync<NamespaceIndexDocument>(
				stream,
				new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
			).ConfigureAwait(false);

			if (index == null || index.Namespaces == null || index.Assemblies == null)
			{
				throw new Exception("Runtime namespace index is empty or invalid.");
			}

			return index;
		}

		private static IReadOnlyCollection<string> ResolveAssemblyNamesForIncludeKeys(NamespaceIndexDocument index, IEnumerable<string> includeKeys)
		{
			SortedSet<string> assemblyNames = new SortedSet<string>(StringComparer.Ordinal);
			SortedSet<string> indexedAssemblyNames = new SortedSet<string>(index.Assemblies.Where(name => !String.IsNullOrWhiteSpace(name)), StringComparer.Ordinal);

			foreach (string includeKey in includeKeys.Where(key => !String.IsNullOrWhiteSpace(key)))
			{
				foreach (KeyValuePair<string, string[]> entry in index.Namespaces)
				{
					if (!NamespaceMatches(entry.Key, includeKey))
					{
						continue;
					}

					foreach (string assemblyName in entry.Value.Where(name => !String.IsNullOrWhiteSpace(name)))
					{
						assemblyNames.Add(assemblyName);
					}
				}

				foreach (string assemblyName in indexedAssemblyNames)
				{
					if (NamespaceMatches(assemblyName, includeKey))
					{
						assemblyNames.Add(assemblyName);
					}
				}
			}

			return assemblyNames.ToArray();
		}

		private static bool NamespaceMatches(string candidate, string includeKey)
		{
			if (candidate.Equals(includeKey, StringComparison.Ordinal))
			{
				return true;
			}

			return candidate.StartsWith(includeKey + ".", StringComparison.Ordinal);
		}

		[JSInvokable]
		public static Task<NamespaceIncludeResult> IncludeNamespace(string namespaceName)
		{
			async Task<NamespaceIncludeResult> execute()
			{
				string trimmedNamespace = (namespaceName ?? String.Empty).Trim();
				if (String.IsNullOrWhiteSpace(trimmedNamespace))
				{
					return new NamespaceIncludeResult(trimmedNamespace, Array.Empty<string>(), Array.Empty<string>(), false, "Namespace is required.");
				}

				await loadedReferences.ConfigureAwait(false);
				using HttpClient client = new HttpClient();
				client.BaseAddress = new Uri(runtimeBaseUri);
				await referenceGate.WaitAsync().ConfigureAwait(false);
				try
				{
					namespaceIndex = namespaceIndex ?? await LoadNamespaceIndex(client).ConfigureAwait(false);
					IReadOnlyCollection<string> matchingAssemblyNames = ResolveAssemblyNamesForIncludeKeys(
						namespaceIndex,
						new[] { trimmedNamespace }
					);

					if (matchingAssemblyNames.Count == 0)
					{
						return new NamespaceIncludeResult(
							trimmedNamespace,
							Array.Empty<string>(),
							Array.Empty<string>(),
							false,
							$"No runtime assemblies matched namespace '{trimmedNamespace}'."
						);
					}

					PortableExecutableReference[] currentReferences = loadedReferences.Result;
					PortableExecutableReference[] addedReferences = await LoadMetadataReferences(
						client,
						matchingAssemblyNames,
						loadedReferenceAssemblyNames
					).ConfigureAwait(false);
					List<string> addedAssemblyNames = matchingAssemblyNames
						.Where(assemblyName => !loadedReferenceAssemblyNames.Contains(assemblyName))
						.ToList();

					if (addedReferences.Length > 0)
					{
						foreach (string assemblyName in addedAssemblyNames)
						{
							loadedReferenceAssemblyNames.Add(assemblyName);
						}
						loadedReferences = Task.FromResult(currentReferences.Concat(addedReferences).ToArray());
					}

					string message = addedAssemblyNames.Count > 0
						? $"Included {addedAssemblyNames.Count} runtime assembly reference(s) for '{trimmedNamespace}'."
						: $"Namespace '{trimmedNamespace}' was already available to the runtime or did not add new references.";

					return new NamespaceIncludeResult(
						trimmedNamespace,
						addedAssemblyNames,
						matchingAssemblyNames,
						true,
						message
					);
				}
				finally
				{
					referenceGate.Release();
				}
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteScript(string code)
		{
			async Task<ExecutionResult> execute()
			{
				CompilationResult compilationResult = await CompileScript(code).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					return await RunScript(compilationResult.Assembly, compilationResult.Compilation).ConfigureAwait(false);
				}
				else
				{
					return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
				}
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteScriptInteractive(string code)
		{
			async Task<ExecutionResult> execute()
			{
				CompilationResult compilationResult = await CompileScript(code).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					return await RunScript(compilationResult.Assembly, compilationResult.Compilation, new object[] { null, null }, true).ConfigureAwait(false);
				}
				else
				{
					return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
				}
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteScriptInContext(string code, string contextId)
		{
			async Task<ExecutionResult> execute()
			{
				ScriptContext context = previousCompilations.TryGetValue(contextId, out ScriptContext c) ? c : ScriptContext.Empty;
				CompilationResult compilationResult = await CompileScript(code, context).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					context = context.AddCompilation(compilationResult.Compilation);
					previousCompilations[contextId] = context;
					return await RunScript(compilationResult.Assembly, compilationResult.Compilation, context.States).ConfigureAwait(false);
				}
				else
				{
					return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
				}
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteScriptInContextInteractive(string code, string contextId)
		{
			async Task<ExecutionResult> execute()
			{
				ScriptContext context = previousCompilations.TryGetValue(contextId, out ScriptContext c) ? c : ScriptContext.Empty;
				CompilationResult compilationResult = await CompileScript(code, context).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					context = context.AddCompilation(compilationResult.Compilation);
					previousCompilations[contextId] = context;
					return await RunScript(compilationResult.Assembly, compilationResult.Compilation, context.States, true).ConfigureAwait(false);
				}
				else
				{
					return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
				}
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteScriptConfigured(
			string code,
			string sourcePath,
			string configurationJson)
		{
			async Task<ExecutionResult> execute()
			{
				CompilationResult compilationResult = await CompileScript(
					code,
					null,
					sourcePath,
					ParseProjectConfiguration(configurationJson)
				).ConfigureAwait(false);

				return compilationResult.Success
					? await RunScript(compilationResult.Assembly, compilationResult.Compilation).ConfigureAwait(false)
					: new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteScriptConfiguredInteractive(
			string code,
			string sourcePath,
			string configurationJson)
		{
			async Task<ExecutionResult> execute()
			{
				CompilationResult compilationResult = await CompileScript(
					code,
					null,
					sourcePath,
					ParseProjectConfiguration(configurationJson)
				).ConfigureAwait(false);

				return compilationResult.Success
					? await RunScript(
						compilationResult.Assembly,
						compilationResult.Compilation,
						new object[] { null, null },
						true
					).ConfigureAwait(false)
					: new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteScriptInContextConfigured(
			string code,
			string contextId,
			string sourcePath,
			string configurationJson)
		{
			async Task<ExecutionResult> execute()
			{
				ScriptContext context = previousCompilations.TryGetValue(contextId, out ScriptContext existing)
					? existing
					: ScriptContext.Empty;
				CompilationResult compilationResult = await CompileScript(
					code,
					context,
					sourcePath,
					ParseProjectConfiguration(configurationJson)
				).ConfigureAwait(false);
				if (!compilationResult.Success)
				{
					return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
				}

				context = context.AddCompilation(compilationResult.Compilation);
				previousCompilations[contextId] = context;
				return await RunScript(
					compilationResult.Assembly,
					compilationResult.Compilation,
					context.States
				).ConfigureAwait(false);
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteScriptInContextConfiguredInteractive(
			string code,
			string contextId,
			string sourcePath,
			string configurationJson)
		{
			async Task<ExecutionResult> execute()
			{
				ScriptContext context = previousCompilations.TryGetValue(contextId, out ScriptContext existing)
					? existing
					: ScriptContext.Empty;
				CompilationResult compilationResult = await CompileScript(
					code,
					context,
					sourcePath,
					ParseProjectConfiguration(configurationJson)
				).ConfigureAwait(false);
				if (!compilationResult.Success)
				{
					return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
				}

				context = context.AddCompilation(compilationResult.Compilation);
				previousCompilations[contextId] = context;
				return await RunScript(
					compilationResult.Assembly,
					compilationResult.Compilation,
					context.States,
					true
				).ConfigureAwait(false);
			}

			return Task.Run(execute);
		}

		/// <summary>
		/// Drops a REPL context so the next <see cref="ExecuteScriptInContext"/> for this id starts fresh.
		/// </summary>
		[JSInvokable]
		public static bool ClearScriptContext(string contextId)
		{
			return previousCompilations.Remove(contextId);
		}

		/// <summary>
		/// Whether a REPL context id has been used with <see cref="ExecuteScriptInContext"/>.
		/// </summary>
		[JSInvokable]
		public static bool HasScriptContext(string contextId)
		{
			return previousCompilations.ContainsKey(contextId);
		}

		/// <summary>
		/// Compiles and runs C# as a normal console program (<see cref="SourceCodeKind.Regular"/>).
		/// If the source has no <c>Main</c>, it is wrapped in a synthetic entry type (async Task Main).
		/// </summary>
		[JSInvokable]
		public static Task<ExecutionResult> ExecuteRegular(string code)
		{
			async Task<ExecutionResult> execute()
			{
				CompilationResult compilationResult = await CompileRegularProgram(
					new[] { new KeyValuePair<string, string>("Program.cs", code ?? String.Empty) },
					"Program.cs"
				).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					return await RunRegularProgram(compilationResult.Assembly, compilationResult.Compilation).ConfigureAwait(false);
				}

				return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteRegularInteractive(string code)
		{
			async Task<ExecutionResult> execute()
			{
				CompilationResult compilationResult = await CompileRegularProgram(
					new[] { new KeyValuePair<string, string>("Program.cs", code ?? String.Empty) },
					"Program.cs"
				).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					return await RunRegularProgram(compilationResult.Assembly, compilationResult.Compilation, true).ConfigureAwait(false);
				}

				return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteRegularProject(string[] paths, string[] contents, string entryPath)
		{
			async Task<ExecutionResult> execute()
			{
				if (paths == null || contents == null || paths.Length == 0 || paths.Length != contents.Length)
				{
					return new ExecutionResult(null, null, "Invalid C# project payload.");
				}

				KeyValuePair<string, string>[] sourceFiles = paths
					.Select((path, index) => new KeyValuePair<string, string>(
						String.IsNullOrWhiteSpace(path) ? $"File{index + 1}.cs" : path,
						contents[index] ?? String.Empty
					))
					.ToArray();

				CompilationResult compilationResult = await CompileRegularProgram(sourceFiles, entryPath).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					return await RunRegularProgram(compilationResult.Assembly, compilationResult.Compilation).ConfigureAwait(false);
				}

				return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ExecutionResult> ExecuteRegularProjectInteractive(string[] paths, string[] contents, string entryPath)
		{
			async Task<ExecutionResult> execute()
			{
				if (paths == null || contents == null || paths.Length == 0 || paths.Length != contents.Length)
				{
					return new ExecutionResult(null, null, "Invalid C# project payload.");
				}

				KeyValuePair<string, string>[] sourceFiles = paths
					.Select((path, index) => new KeyValuePair<string, string>(
						String.IsNullOrWhiteSpace(path) ? $"File{index + 1}.cs" : path,
						contents[index] ?? String.Empty
					))
					.ToArray();

				CompilationResult compilationResult = await CompileRegularProgram(sourceFiles, entryPath).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					return await RunRegularProgram(compilationResult.Assembly, compilationResult.Compilation, true).ConfigureAwait(false);
				}

				return new ExecutionResult(null, null, FormatCompilerDiagnostics(compilationResult.Errors));
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ProjectExecutionResult> ExecuteRegularProjectWithFiles(
			string[] paths,
			string[] contents,
			string entryPath,
			string[] runtimePaths,
			string[] runtimeContents
		)
		{
			async Task<ProjectExecutionResult> execute()
			{
				return await ExecuteRegularProjectWithFilesCore(
					paths,
					contents,
					entryPath,
					runtimePaths,
					runtimeContents,
					false,
					null
				).ConfigureAwait(false);
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ProjectExecutionResult> ExecuteRegularProjectWithFilesInteractive(
			string[] paths,
			string[] contents,
			string entryPath,
			string[] runtimePaths,
			string[] runtimeContents
		)
		{
			async Task<ProjectExecutionResult> execute()
			{
				return await ExecuteRegularProjectWithFilesCore(
					paths,
					contents,
					entryPath,
					runtimePaths,
					runtimeContents,
					true,
					null
				).ConfigureAwait(false);
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ProjectExecutionResult> ExecuteRegularProjectWithFilesConfigured(
			string[] paths,
			string[] contents,
			string entryPath,
			string[] runtimePaths,
			string[] runtimeContents,
			string configurationJson
		)
		{
			async Task<ProjectExecutionResult> execute()
			{
				return await ExecuteRegularProjectWithFilesCore(
					paths,
					contents,
					entryPath,
					runtimePaths,
					runtimeContents,
					false,
					ParseProjectConfiguration(configurationJson)
				).ConfigureAwait(false);
			}

			return Task.Run(execute);
		}

		[JSInvokable]
		public static Task<ProjectExecutionResult> ExecuteRegularProjectWithFilesConfiguredInteractive(
			string[] paths,
			string[] contents,
			string entryPath,
			string[] runtimePaths,
			string[] runtimeContents,
			string configurationJson
		)
		{
			async Task<ProjectExecutionResult> execute()
			{
				return await ExecuteRegularProjectWithFilesCore(
					paths,
					contents,
					entryPath,
					runtimePaths,
					runtimeContents,
					true,
					ParseProjectConfiguration(configurationJson)
				).ConfigureAwait(false);
			}

			return Task.Run(execute);
		}

		private static async Task<ProjectExecutionResult> ExecuteRegularProjectWithFilesCore(
			string[] paths,
			string[] contents,
			string entryPath,
			string[] runtimePaths,
			string[] runtimeContents,
			bool interactive,
			CSharpProjectConfiguration projectConfiguration
		)
		{
			if (paths == null || contents == null || paths.Length == 0 || paths.Length != contents.Length)
			{
				return new ProjectExecutionResult(null, null, "Invalid C# project payload.", Array.Empty<FileSnapshot>());
			}

			KeyValuePair<string, string>[] sourceFiles = paths
				.Select((path, index) => new KeyValuePair<string, string>(
					NormalizeWorkspaceRelativePath(String.IsNullOrWhiteSpace(path) ? $"File{index + 1}.cs" : path),
					contents[index] ?? String.Empty
				))
				.ToArray();
			KeyValuePair<string, string>[] runtimeFiles = BuildRuntimeFiles(
				runtimePaths,
				runtimeContents,
				sourceFiles
			);
			string normalizedEntryPath = NormalizeWorkspaceRelativePath(entryPath);
			WriteProjectFilesToWorkspace(runtimeFiles);

			CompilationResult compilationResult = await CompileRegularProgram(
				sourceFiles,
				normalizedEntryPath,
				projectConfiguration
			).ConfigureAwait(false);

			if (!compilationResult.Success)
			{
				return new ProjectExecutionResult(
					null,
					null,
					FormatCompilerDiagnostics(compilationResult.Errors),
					CollectWorkspaceFiles()
				);
			}

			ExecutionResult result = await RunRegularProgram(
				compilationResult.Assembly,
				compilationResult.Compilation,
				interactive,
				codecraftWorkspaceRoot
			).ConfigureAwait(false);
			return new ProjectExecutionResult(result.Result, result.StdOut, result.StdErr, CollectWorkspaceFiles());
		}

		private static KeyValuePair<string, string>[] BuildRuntimeFiles(
			string[] runtimePaths,
			string[] runtimeContents,
			KeyValuePair<string, string>[] sourceFiles
		)
		{
			if (runtimePaths == null || runtimeContents == null || runtimePaths.Length == 0 || runtimePaths.Length != runtimeContents.Length)
			{
				return sourceFiles;
			}

			Dictionary<string, string> files = new Dictionary<string, string>(StringComparer.Ordinal);
			for (int index = 0; index < runtimePaths.Length; index++)
			{
				string path = NormalizeWorkspaceRelativePath(runtimePaths[index]);
				files[path] = runtimeContents[index] ?? String.Empty;
			}
			foreach (KeyValuePair<string, string> sourceFile in sourceFiles)
			{
				files[sourceFile.Key] = sourceFile.Value ?? String.Empty;
			}
			return files
				.OrderBy(file => file.Key, StringComparer.Ordinal)
				.Select(file => new KeyValuePair<string, string>(file.Key, file.Value))
				.ToArray();
		}

		private static string NormalizeWorkspaceRelativePath(string path)
		{
			string[] parts = (path ?? String.Empty)
				.Replace('\\', '/')
				.Split('/')
				.Select(part => part.Trim())
				.Where(part => part.Length > 0 && part != "." && part != "..")
				.ToArray();
			return parts.Length > 0 ? String.Join("/", parts) : "Program.cs";
		}

		private static void RecreateWorkspaceRoot()
		{
			try
			{
				if (Directory.Exists(codecraftWorkspaceRoot))
				{
					Directory.Delete(codecraftWorkspaceRoot, true);
				}
			}
			catch
			{
				// Runtime scratch files are reset best-effort before each project run.
			}
			Directory.CreateDirectory(codecraftWorkspaceRoot);
		}

		private static void WriteProjectFilesToWorkspace(IEnumerable<KeyValuePair<string, string>> sourceFiles)
		{
			RecreateWorkspaceRoot();
			foreach (KeyValuePair<string, string> sourceFile in sourceFiles)
			{
				string relativePath = NormalizeWorkspaceRelativePath(sourceFile.Key);
				string fullPath = Path.Combine(codecraftWorkspaceRoot, relativePath.Replace('/', Path.DirectorySeparatorChar));
				string directory = Path.GetDirectoryName(fullPath);
				if (!String.IsNullOrWhiteSpace(directory))
				{
					Directory.CreateDirectory(directory);
				}
				File.WriteAllText(fullPath, sourceFile.Value ?? String.Empty, Encoding.UTF8);
			}
		}

		private static FileSnapshot[] CollectWorkspaceFiles()
		{
			if (!Directory.Exists(codecraftWorkspaceRoot))
			{
				return Array.Empty<FileSnapshot>();
			}

			return Directory
				.GetFiles(codecraftWorkspaceRoot, "*", SearchOption.AllDirectories)
				.Select(path =>
				{
					string relativePath = path.Substring(codecraftWorkspaceRoot.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
					return new FileSnapshot(relativePath.Replace(Path.DirectorySeparatorChar, '/'), File.ReadAllText(path, Encoding.UTF8));
				})
				.OrderBy(file => file.Path, StringComparer.Ordinal)
				.ToArray();
		}

		private static async Task<CompilationResult> CompileRegularProgram(
			IReadOnlyList<KeyValuePair<string, string>> sourceFiles,
			string entryPath,
			CSharpProjectConfiguration projectConfiguration = null)
		{
			PortableExecutableReference[] refs = await loadedReferences.ConfigureAwait(false);
			CompilationResult first = TryCompileRegular(sourceFiles, refs, entryPath, projectConfiguration);
			if (projectConfiguration != null)
			{
				// A real project follows compiler entry-point semantics exactly. In particular,
				// do not silently select a Main method or wrap invalid project code.
				return first;
			}
			if (first.Success && first.Compilation.GetEntryPoint(CancellationToken.None) != null)
			{
				return first;
			}

			string targetEntryPath = sourceFiles.FirstOrDefault(file => String.Equals(file.Key, entryPath, StringComparison.Ordinal)).Key
				?? sourceFiles.FirstOrDefault().Key;
			KeyValuePair<string, string>[] wrappedSources = sourceFiles
				.Select(file => String.Equals(file.Key, targetEntryPath, StringComparison.Ordinal)
					? new KeyValuePair<string, string>(file.Key, WrapAsConsoleProgram(file.Value))
					: file)
				.ToArray();
			CompilationResult wrapped = TryCompileRegular(wrappedSources, refs, targetEntryPath, null);
			return wrapped.Success ? wrapped : first;
		}

		private static string WrapAsConsoleProgram(string userCode)
		{
			string[] lines = userCode.Replace("\r\n", "\n").Split('\n');
			string body = String.Join("\n", lines.Select(l => "        " + l));
			return $@"internal static class __CodeCraftEntry
{{
    private static async System.Threading.Tasks.Task Main(string[] args)
    {{
{body}
    }}
}}
";
		}

		private static CompilationResult TryCompileRegular(
			IReadOnlyList<KeyValuePair<string, string>> sourceFiles,
			PortableExecutableReference[] refs,
			string entryPath,
			CSharpProjectConfiguration projectConfiguration
		)
		{
			CSharpProjectConfiguration effectiveConfiguration =
				projectConfiguration ?? new CSharpProjectConfiguration();
			CSharpParseOptions parseOptions =
				CSharpCompilerSettings.CreateParseOptions(effectiveConfiguration);
			SyntaxTree[] syntaxTrees = sourceFiles
				.Select(file => CSharpSyntaxTree.ParseText(file.Value ?? String.Empty, parseOptions, path: file.Key))
				.ToArray();
			CSharpCompilationOptions options =
				CSharpCompilerSettings.CreateCompilationOptions(effectiveConfiguration);
			if (projectConfiguration == null)
			{
				string mainTypeName = InferRegularProjectMainTypeName(syntaxTrees, entryPath);
				if (!String.IsNullOrWhiteSpace(mainTypeName))
				{
					options = options.WithMainTypeName(mainTypeName);
				}
			}
			CSharpCompilation compilation = CSharpCompilation.Create(
				Path.GetRandomFileName(),
				syntaxTrees,
				refs,
				options);

			IEnumerable<Diagnostic> upfrontErrors = compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error);
			if (upfrontErrors.Any())
			{
				return new CompilationResult(upfrontErrors);
			}

			using MemoryStream ms = new MemoryStream();
			EmitResult emit = compilation.Emit(ms);
			if (!emit.Success)
			{
				return new CompilationResult(emit.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error));
			}

			return new CompilationResult(Assembly.Load(ms.ToArray()), compilation);
		}

		private static string InferRegularProjectMainTypeName(IEnumerable<SyntaxTree> syntaxTrees, string entryPath)
		{
			if (String.IsNullOrWhiteSpace(entryPath))
			{
				return null;
			}

			SyntaxTree entryTree = syntaxTrees.FirstOrDefault(tree =>
				String.Equals(tree.FilePath, entryPath, StringComparison.Ordinal)
			);
			if (entryTree == null)
			{
				return null;
			}

			SyntaxNode root = entryTree.GetRoot();
			TypeDeclarationSyntax typeNode = root
				.DescendantNodes()
				.OfType<TypeDeclarationSyntax>()
				.FirstOrDefault(typeDeclaration =>
					typeDeclaration.Members
						.OfType<MethodDeclarationSyntax>()
						.Any(method =>
							method.Identifier.ValueText == "Main"
							&& method.Modifiers.Any(modifier => modifier.IsKind(SyntaxKind.StaticKeyword))
						)
				);
			if (typeNode == null)
			{
				return null;
			}

			string namespaceName = String.Join(
				".",
				typeNode.Ancestors()
					.OfType<NamespaceDeclarationSyntax>()
					.Select(namespaceNode => namespaceNode.Name.ToString())
					.Reverse()
			);
			string typeName = typeNode.Identifier.ValueText;
			return String.IsNullOrWhiteSpace(namespaceName) ? typeName : $"{namespaceName}.{typeName}";
		}

		private static async Task<ExecutionResult> RunRegularProgram(
			Assembly assembly,
			Compilation compilation,
			bool interactive = false,
			string workingDirectory = null
		)
		{
			IMethodSymbol entrySymbol = compilation.GetEntryPoint(CancellationToken.None);
			if (entrySymbol == null)
			{
				return new ExecutionResult(null, null, "No entry point (Main) found.");
			}

			MethodInfo entry = ResolveCompiledEntryPoint(assembly, entrySymbol);
			if (entry == null)
			{
				return new ExecutionResult(null, null, $"Unable to resolve compiled entry point `{entrySymbol.MetadataName}`.");
			}

			TextWriter ogOut = Console.Out;
			TextWriter ogError = Console.Error;
			TextReader ogIn = Console.In;
			string ogCurrentDirectory = null;
			try
			{
				if (!String.IsNullOrWhiteSpace(workingDirectory))
				{
					Directory.CreateDirectory(workingDirectory);
					ogCurrentDirectory = Directory.GetCurrentDirectory();
					Directory.SetCurrentDirectory(workingDirectory);
				}
				StringWriter sw = interactive ? null : new StringWriter();
				StringWriter ew = interactive ? null : new StringWriter();
				if (interactive)
				{
					Console.SetOut(new CodeCraftInteractiveTextWriter("stdout"));
					Console.SetError(new CodeCraftInteractiveTextWriter("stderr"));
					Console.SetIn(new CodeCraftInteractiveTextReader());
				}
				else
				{
					Console.SetOut(sw);
					Console.SetError(ew);
				}
				ParameterInfo[] parameters = entry.GetParameters();
				object[] mainArgs = parameters.Length == 0 ? null : new object[] { Array.Empty<string>() };
				object invokeResult = entry.Invoke(null, mainArgs);
				object exitOrResult = null;

				if (invokeResult is Task taskResult)
				{
					await taskResult.ConfigureAwait(false);
					Type taskType = taskResult.GetType();
					if (taskType.IsGenericType)
					{
						System.Reflection.PropertyInfo resultProp = taskType.GetProperty("Result");
						exitOrResult = resultProp?.GetValue(taskResult);
					}
				}
				else
				{
					exitOrResult = invokeResult;
				}

				string stdOut = sw?.ToString();
				string stdErr = ew?.ToString();
				string outStr = ToNonEmptyString(stdOut);
				string errStr = ToNonEmptyString(stdErr);
				if (exitOrResult != null && !(exitOrResult is Task))
				{
					return new ExecutionResult(exitOrResult, outStr, errStr);
				}

				return new ExecutionResult(null, outStr, errStr);
			}
			catch (Exception ex)
			{
				string stdOut = Console.Out is StringWriter sw ? sw.ToString() : null;
				string stdErr = Console.Error is StringWriter ew ? ew.ToString() : null;
				return new ExecutionResult(null, ToNonEmptyString(stdOut), AppendExecutionError(stdErr, FormatExecutionException(ex)));
			}
			finally
			{
				Console.SetOut(ogOut);
				Console.SetError(ogError);
				Console.SetIn(ogIn);
				if (!String.IsNullOrWhiteSpace(ogCurrentDirectory))
				{
					try
					{
						Directory.SetCurrentDirectory(ogCurrentDirectory);
					}
					catch { }
				}
			}
		}

		private static MethodInfo ResolveCompiledEntryPoint(Assembly assembly, IMethodSymbol entryPoint)
		{
			string containingNamespace = entryPoint.ContainingNamespace?.IsGlobalNamespace == false
				? entryPoint.ContainingNamespace.ToDisplayString()
				: null;
			string containingTypeName = entryPoint.ContainingType?.MetadataName;
			int parameterCount = entryPoint.Parameters.Length;

			return assembly
				.GetTypes()
				.Where(type => type.Name == containingTypeName && type.Namespace == containingNamespace)
				.SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance))
				.FirstOrDefault(method => method.Name == entryPoint.MetadataName && method.GetParameters().Length == parameterCount);
		}

		private static async Task<CompilationResult> CompileScript(
			string code,
			ScriptContext? context = null,
			string sourcePath = defaultScriptSourcePath,
			CSharpProjectConfiguration projectConfiguration = null)
		{
			string normalizedSourcePath = String.IsNullOrWhiteSpace(sourcePath)
				? defaultScriptSourcePath
				: sourcePath;
			CSharpProjectConfiguration effectiveConfiguration =
				projectConfiguration ?? new CSharpProjectConfiguration();
			CSharpCompilation compilation = CSharpCompilation.CreateScriptCompilation(
				Path.GetRandomFileName(),
				CSharpSyntaxTree.ParseText(
					code,
					CSharpCompilerSettings.CreateParseOptions(
						effectiveConfiguration,
						SourceCodeKind.Script
					),
					path: normalizedSourcePath),
				await loadedReferences.ConfigureAwait(false),
				CSharpCompilerSettings
					.CreateCompilationOptions(
						effectiveConfiguration,
						OutputKind.DynamicallyLinkedLibrary
					)
					.WithMainTypeName(null),
				context?.Compilation
			);

			IEnumerable<Diagnostic> parsingErrors = compilation.GetDiagnostics().Where(x => x.Severity == DiagnosticSeverity.Error);
			if (parsingErrors.Any())
			{
				return new CompilationResult(parsingErrors);
			}
			else
			{
				using MemoryStream ms = new MemoryStream();
				EmitResult result = compilation.Emit(ms);

				if (result.Success)
				{
					return new CompilationResult(Assembly.Load(ms.ToArray()), compilation);
				}
				else
				{
					return new CompilationResult(result.Diagnostics);
				}
			}
		}

		private static Task<ExecutionResult> RunScript(Assembly assembly, Compilation compilation)
		{
			return RunScript(assembly, compilation, new object[] { null, null }, false);
		}
		private static async Task<ExecutionResult> RunScript(Assembly assembly, Compilation compilation, object[] states, bool interactive = false)
		{
			IMethodSymbol entryPoint = compilation.GetEntryPoint(CancellationToken.None);
			Type type = assembly.GetType($"{entryPoint.ContainingNamespace.MetadataName}.{entryPoint.ContainingType.MetadataName}"); ;
			MethodInfo entryPointMethod = type.GetMethod(entryPoint.MetadataName);

			TextWriter ogOut = Console.Out;
			TextWriter ogError = Console.Error;
			TextReader ogIn = Console.In;
			try
			{
				StringWriter sw = interactive ? null : new StringWriter();
				StringWriter ew = interactive ? null : new StringWriter();
				if (interactive)
				{
					Console.SetOut(new CodeCraftInteractiveTextWriter("stdout"));
					Console.SetError(new CodeCraftInteractiveTextWriter("stderr"));
					Console.SetIn(new CodeCraftInteractiveTextReader());
				}
				else
				{
					Console.SetOut(sw);
					Console.SetError(ew);
				}

				Func<object[], Task<object>> submission = (Func<object[], Task<object>>)entryPointMethod.CreateDelegate(typeof(Func<object[], Task<object>>));
				object result = await submission.Invoke(states).ConfigureAwait(false);

				string stdOut = sw?.ToString();
				string stdErr = ew?.ToString();
				return new ExecutionResult(result, ToNonEmptyString(stdOut), ToNonEmptyString(stdErr));
			}
			catch (Exception ex)
			{
				string stdOut = Console.Out is StringWriter sw ? sw.ToString() : null;
				string stdErr = Console.Error is StringWriter ew ? ew.ToString() : null;
				return new ExecutionResult(null, ToNonEmptyString(stdOut), AppendExecutionError(stdErr, FormatExecutionException(ex)));
			}
			finally
			{
				Console.SetOut(ogOut);
				Console.SetError(ogError);
				Console.SetIn(ogIn);
			}
		}

		private sealed class CodeCraftInteractiveTextWriter : TextWriter
		{
			private readonly string stream;

			public CodeCraftInteractiveTextWriter(string stream)
			{
				this.stream = stream;
			}

			public override Encoding Encoding => Encoding.UTF8;

			public override void Write(char value)
			{
				Write(value.ToString());
			}

			public override void Write(string value)
			{
				if (String.IsNullOrEmpty(value)) return;
				jsRuntime.InvokeVoidAsync("CodeCraftCSharp.writeOutput", stream, value);
			}

			public override void WriteLine(string value)
			{
				Write((value ?? String.Empty) + Environment.NewLine);
			}
		}

		private sealed class CodeCraftInteractiveTextReader : TextReader
		{
			private string buffer = String.Empty;

			public override string ReadLine()
			{
				buffer = String.Empty;
				return RequestConsoleInput(String.Empty);
			}

			public override int Read()
			{
				if (buffer.Length == 0)
				{
					buffer = RequestConsoleInput(String.Empty) + Environment.NewLine;
				}

				char next = buffer[0];
				buffer = buffer.Substring(1);
				return next;
			}

			public override int Read(char[] targetBuffer, int index, int count)
			{
				if (targetBuffer == null) throw new ArgumentNullException(nameof(targetBuffer));
				if (index < 0 || count < 0 || index + count > targetBuffer.Length) throw new ArgumentOutOfRangeException();
				if (count == 0) return 0;

				int read = 0;
				while (read < count)
				{
					int next = Read();
					if (next < 0) break;
					targetBuffer[index + read] = (char)next;
					read++;
					if (buffer.Length == 0) break;
				}
				return read;
			}
		}

		private static string RequestConsoleInput(string prompt)
		{
			if (jsRuntime is IJSInProcessRuntime syncRuntime)
			{
				return syncRuntime.Invoke<string>("CodeCraftCSharp.requestInput", prompt ?? String.Empty) ?? String.Empty;
			}

			return jsRuntime
				.InvokeAsync<string>("CodeCraftCSharp.requestInput", prompt ?? String.Empty)
				.AsTask()
				.GetAwaiter()
				.GetResult() ?? String.Empty;
		}

		private static string FormatExecutionException(Exception exception)
		{
			return UnwrapExecutionException(exception).ToString();
		}

		private static string FormatCompilerDiagnostics(IEnumerable<Diagnostic> diagnostics)
		{
			return String.Join(Environment.NewLine, diagnostics.Select(diagnostic => diagnostic.ToString()));
		}

		private static string ToNonEmptyString(string value)
		{
			return !String.IsNullOrEmpty(value) ? value : null;
		}

		private static string AppendExecutionError(string capturedStdErr, string executionError)
		{
			string errStr = ToNonEmptyString(capturedStdErr);
			if (String.IsNullOrEmpty(errStr))
			{
				return executionError;
			}
			if (String.IsNullOrEmpty(executionError))
			{
				return errStr;
			}
			return errStr.EndsWith(Environment.NewLine)
				? errStr + executionError
				: errStr + Environment.NewLine + executionError;
		}

		private static Exception UnwrapExecutionException(Exception exception)
		{
			while (true)
			{
				switch (exception)
				{
					case TargetInvocationException tie when tie.InnerException != null:
						exception = tie.InnerException;
						continue;
					case AggregateException aggregate when aggregate.InnerExceptions.Count == 1:
						exception = aggregate.InnerExceptions[0];
						continue;
					default:
						return exception;
				}
			}
		}

		private sealed class NamespaceIndexDocument
		{
			public string[] Assemblies { get; set; }
			public Dictionary<string, string[]> Namespaces { get; set; }
		}

		public sealed class NamespaceIncludeResult
		{
			public NamespaceIncludeResult(
				string namespaceName,
				IReadOnlyCollection<string> addedAssemblies,
				IReadOnlyCollection<string> matchedAssemblies,
				bool success,
				string message)
			{
				NamespaceName = namespaceName;
				AddedAssemblies = addedAssemblies.ToArray();
				MatchedAssemblies = matchedAssemblies.ToArray();
				Success = success;
				Message = message;
			}

			public string NamespaceName { get; }
			public string[] AddedAssemblies { get; }
			public string[] MatchedAssemblies { get; }
			public bool Success { get; }
			public string Message { get; }
		}
	}
}
