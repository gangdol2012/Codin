namespace BrowserCSharp
{
	public readonly struct ExecutionResult
	{
		public object Result { get; }
		public string StdOut { get; }
		public string StdErr { get; }

		public ExecutionResult(object result, string stdOut, string stdErr)
		{
			Result = result;
			StdOut = stdOut;
			StdErr = stdErr;
		}
	}
}