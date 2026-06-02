namespace BrowserCSharp
{
	public readonly struct ProjectExecutionResult
	{
		public object Result { get; }
		public string StdOut { get; }
		public string StdErr { get; }
		public FileSnapshot[] Files { get; }

		public ProjectExecutionResult(object result, string stdOut, string stdErr, FileSnapshot[] files)
		{
			Result = result;
			StdOut = stdOut;
			StdErr = stdErr;
			Files = files;
		}
	}
}
