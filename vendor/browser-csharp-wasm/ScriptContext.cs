using System;
using Microsoft.CodeAnalysis.CSharp;

namespace BrowserCSharp
{
	readonly struct ScriptContext
	{
		public static ScriptContext Empty { get; } = new ScriptContext(null, 0, new object[] { null, null });

		public CSharpCompilation Compilation { get; }
		public int CompilationCount { get; }
		public object[] States { get; }

		private ScriptContext(CSharpCompilation compilation, int compilationCount, object[] states)
		{
			Compilation = compilation;
			CompilationCount = compilationCount;
			States = states;
		}

		public ScriptContext AddCompilation(CSharpCompilation compilation)
		{
			int compilationCount = CompilationCount + 1;
			object[] states = compilationCount >= States.Length ? new object[Math.Max(compilationCount, States.Length * 2)] : new object[States.Length];
			Array.Copy(States, states, States.Length);
			return new ScriptContext(compilation, compilationCount, states);
		}
	}
}