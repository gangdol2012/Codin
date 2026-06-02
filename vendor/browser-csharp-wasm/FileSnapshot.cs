namespace BrowserCSharp
{
	public readonly struct FileSnapshot
	{
		public string Path { get; }
		public string Content { get; }

		public FileSnapshot(string path, string content)
		{
			Path = path;
			Content = content;
		}
	}
}
