using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
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
		private const string codecraftWorkspaceRoot = "/workspace";
		private static readonly IImmutableSet<string> references = ImmutableHashSet.Create(
			"mscorlib",
			"netstandard",
			"System",
			"System.Core",
			"System.Collections",
			"System.Net.Http",
			"System.Memory"
		);
		private static readonly IEnumerable<string> defaultUsings = new[]
		{
			"System",
			"System.Collections",
			"System.Collections.Generic",
			"System.Text",
			"System.Linq",
			"System.Net.Http"
		};

		private static Task<PortableExecutableReference[]> loadedReferences;

		private static IJSRuntime jsRuntime;

		private static IDictionary<string, ScriptContext> previousCompilations = new Dictionary<string, ScriptContext>();

		public static void Main()
		{
			WebAssemblyHostBuilder builder = WebAssemblyHostBuilder.CreateDefault();
			WebAssemblyHost host = builder.Build();
			jsRuntime = (IJSRuntime)host.Services.GetService(typeof(IJSRuntime));

			loadedReferences = GetReferences(builder.HostEnvironment.BaseAddress);
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
			static PortableExecutableReference toReference(Task<Stream> completedTask)
			{
				if (completedTask.IsCompletedSuccessfully)
				{
					return MetadataReference.CreateFromStream(completedTask.Result);
				}
				else
				{
					throw new Exception("Could not load a reference required for runtime compilation.", completedTask.Exception);
				}
			}

			HttpClient client = new HttpClient();
			client.BaseAddress = new Uri(baseUri);

			IDictionary<string, Task<PortableExecutableReference>> foundReferences = new Dictionary<string, Task<PortableExecutableReference>>();

			foreach (string assemblyName in references)
			{
				Task<PortableExecutableReference> task = client.GetStreamAsync(Path.Join(frameworkBinUri, $"{assemblyName}.dll")).ContinueWith(toReference);
				foundReferences.Add(assemblyName, task);
			}

			if (references.All(foundReferences.ContainsKey))
			{
				Task<PortableExecutableReference[]> allTask = Task.WhenAll(foundReferences.Values);
				allTask.GetAwaiter().OnCompleted(client.Dispose);
				return allTask;
			}
			else
			{
				client.Dispose();
				return Task.FromException<PortableExecutableReference[]>(
					new Exception("Could not find all required references for runtime compilation. " +
						$"Missing references: {String.Join(", ", references.Except(foundReferences.Keys))}")
				);
			}
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
					return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
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
					return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
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
					return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
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
					return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
				}
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

				return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
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

				return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
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

				return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
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

				return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
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
				return await ExecuteRegularProjectWithFilesCore(paths, contents, entryPath, runtimePaths, runtimeContents, false).ConfigureAwait(false);
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
				return await ExecuteRegularProjectWithFilesCore(paths, contents, entryPath, runtimePaths, runtimeContents, true).ConfigureAwait(false);
			}

			return Task.Run(execute);
		}

		private static async Task<ProjectExecutionResult> ExecuteRegularProjectWithFilesCore(
			string[] paths,
			string[] contents,
			string entryPath,
			string[] runtimePaths,
			string[] runtimeContents,
			bool interactive
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

			CompilationResult compilationResult = await CompileRegularProgram(sourceFiles, normalizedEntryPath).ConfigureAwait(false);

			if (!compilationResult.Success)
			{
				return new ProjectExecutionResult(
					null,
					null,
					String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())),
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

		private static async Task<CompilationResult> CompileRegularProgram(IReadOnlyList<KeyValuePair<string, string>> sourceFiles, string entryPath)
		{
			PortableExecutableReference[] refs = await loadedReferences.ConfigureAwait(false);
			CompilationResult first = TryCompileRegular(sourceFiles, refs, entryPath);
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
			CompilationResult wrapped = TryCompileRegular(wrappedSources, refs, targetEntryPath);
			return wrapped.Success ? wrapped : first;
		}

		private static string WrapAsConsoleProgram(string userCode)
		{
			string[] lines = userCode.Replace("\r\n", "\n").Split('\n');
			string body = String.Join("\n", lines.Select(l => "        " + l));
			return $@"using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Net.Http;
using System.Threading.Tasks;

internal static class __CodeCraftEntry
{{
    private static async Task Main(string[] args)
    {{
{body}
    }}
}}
";
		}

		private static CompilationResult TryCompileRegular(
			IReadOnlyList<KeyValuePair<string, string>> sourceFiles,
			PortableExecutableReference[] refs,
			string entryPath
		)
		{
			CSharpParseOptions parseOptions = CSharpParseOptions.Default
				.WithKind(SourceCodeKind.Regular)
				.WithLanguageVersion(LanguageVersion.Preview);
			SyntaxTree[] syntaxTrees = sourceFiles
				.Select(file => CSharpSyntaxTree.ParseText(file.Value ?? String.Empty, parseOptions, path: file.Key))
				.ToArray();
			CSharpCompilationOptions options = new CSharpCompilationOptions(OutputKind.ConsoleApplication, usings: defaultUsings)
				.WithPlatform(Platform.AnyCpu)
				.WithOptimizationLevel(OptimizationLevel.Release);
			string mainTypeName = InferRegularProjectMainTypeName(syntaxTrees, entryPath);
			if (!String.IsNullOrWhiteSpace(mainTypeName))
			{
				options = options.WithMainTypeName(mainTypeName);
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

		private static async Task<CompilationResult> CompileScript(string code, ScriptContext? context = null)
		{
			CSharpCompilation compilation = CSharpCompilation.CreateScriptCompilation(
				Path.GetRandomFileName(),
				CSharpSyntaxTree.ParseText(code, CSharpParseOptions.Default.WithKind(SourceCodeKind.Script).WithLanguageVersion(LanguageVersion.Preview)),
				await loadedReferences.ConfigureAwait(false),
				new CSharpCompilationOptions(outputKind: OutputKind.DynamicallyLinkedLibrary, usings: defaultUsings),
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
	}
}
