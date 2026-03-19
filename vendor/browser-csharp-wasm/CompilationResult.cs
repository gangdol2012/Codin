using System.Collections.Generic;
using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace BrowserCSharp
{
	readonly struct CompilationResult
	{
		public Assembly Assembly { get; }
		public CSharpCompilation Compilation { get; }
		public IEnumerable<Diagnostic> Errors { get; }
		public bool Success { get; }

		public CompilationResult(Assembly assembly, CSharpCompilation compilation)
		{
			Assembly = assembly;
			Compilation = compilation;
			Errors = null;
			Success = true;
		}
		public CompilationResult(IEnumerable<Diagnostic> errors)
		{
			Assembly = null;
			Compilation = null;
			Errors = errors;
			Success = false;
		}
	}
}