# OmniSharp completion regression and benchmark harness

This terminal-only executable composes Roslyn in-process and exercises the vendored
`OmniSharpCompletionService` and `OmniSharpProject` directly. It does not start Vite, a browser,
an HTTP server, or the Blazor application.

Run deterministic functional and serialization regressions:

```sh
dotnet run --project tests/OmniSharpCompletion.Tests/OmniSharpCompletion.Tests.csproj
```

Run the opt-in timing and payload-size report:

```sh
dotnet run --project tests/OmniSharpCompletion.Tests/OmniSharpCompletion.Tests.csproj \
  -- --benchmark --iterations 30
```

Benchmark timings are diagnostic rather than pass/fail thresholds because browser, CPU, and
runtime startup costs vary. Correctness assertions remain in the default command.
