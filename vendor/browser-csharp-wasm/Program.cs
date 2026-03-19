using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;
using Microsoft.JSInterop;

namespace BrowserCSharp
{
	public static class Program
	{
		private const string frameworkBinUri = "_framework/_bin";
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
				CompilationResult compilationResult = await CompileRegularProgram(code).ConfigureAwait(false);

				if (compilationResult.Success)
				{
					return await RunRegularProgram(compilationResult.Assembly).ConfigureAwait(false);
				}

				return new ExecutionResult(null, null, String.Join('\n', compilationResult.Errors.Select(x => x.GetMessage())));
			}

			return Task.Run(execute);
		}

		private static async Task<CompilationResult> CompileRegularProgram(string code)
		{
			PortableExecutableReference[] refs = await loadedReferences.ConfigureAwait(false);
			CompilationResult first = TryCompileRegular(code, refs);
			if (first.Success && first.Compilation.GetEntryPoint(CancellationToken.None) != null)
			{
				return first;
			}

			return TryCompileRegular(WrapAsConsoleProgram(code), refs);
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

		private static CompilationResult TryCompileRegular(string code, PortableExecutableReference[] refs)
		{
			CSharpParseOptions parseOptions = CSharpParseOptions.Default
				.WithKind(SourceCodeKind.Regular)
				.WithLanguageVersion(LanguageVersion.Preview);
			SyntaxTree syntaxTree = CSharpSyntaxTree.ParseText(code, parseOptions);
			CSharpCompilation compilation = CSharpCompilation.Create(
				Path.GetRandomFileName(),
				new[] { syntaxTree },
				refs,
				new CSharpCompilationOptions(OutputKind.ConsoleApplication)
					.WithPlatform(Platform.AnyCpu)
					.WithOptimizationLevel(OptimizationLevel.Release));

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

		private static async Task<ExecutionResult> RunRegularProgram(Assembly assembly)
		{
			MethodInfo entry = assembly.EntryPoint;
			if (entry == null)
			{
				return new ExecutionResult(null, null, "No entry point (Main) found.");
			}

			TextWriter ogOut = Console.Out;
			try
			{
				using StringWriter sw = new StringWriter();
				Console.SetOut(sw);
				object[] mainArgs = new object[] { Array.Empty<string>() };
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

				string stdOut = sw.ToString();
				string outStr = stdOut.Length > 0 ? stdOut : null;
				if (exitOrResult != null && !(exitOrResult is Task))
				{
					return new ExecutionResult(exitOrResult, outStr, null);
				}

				return new ExecutionResult(null, outStr, null);
			}
			catch (Exception ex)
			{
				return new ExecutionResult(null, null, $"{ex.GetType()}: {ex.Message}");
			}
			finally
			{
				Console.SetOut(ogOut);
			}
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
			return RunScript(assembly, compilation, new object[] { null, null });
		}
		private static async Task<ExecutionResult> RunScript(Assembly assembly, Compilation compilation, object[] states)
		{
			IMethodSymbol entryPoint = compilation.GetEntryPoint(CancellationToken.None);
			Type type = assembly.GetType($"{entryPoint.ContainingNamespace.MetadataName}.{entryPoint.ContainingType.MetadataName}"); ;
			MethodInfo entryPointMethod = type.GetMethod(entryPoint.MetadataName);

			TextWriter ogOut = Console.Out;
			try
			{
				using StringWriter sw = new StringWriter();
				Console.SetOut(sw);

				Func<object[], Task<object>> submission = (Func<object[], Task<object>>)entryPointMethod.CreateDelegate(typeof(Func<object[], Task<object>>));
				object result = await submission.Invoke(states).ConfigureAwait(false);

				string stdOut = sw.ToString();
				return new ExecutionResult(result, stdOut.Length > 0 ? stdOut : null, null);
			}
			catch (Exception ex)
			{
				return new ExecutionResult(null, null, $"{ex.GetType()}: {ex.Message}");
			}
			finally
			{
				Console.SetOut(ogOut);
			}
		}
	}
}