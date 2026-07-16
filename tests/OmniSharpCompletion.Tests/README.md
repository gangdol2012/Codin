# OmniSharp completion regression harness

This is a terminal-only console harness. It composes Roslyn in-process and calls the vendored
`OmniSharpCompletionService` directly; it does not start Vite, a browser, an HTTP server, or the
Blazor application.

Run deterministic regressions:

```sh
npm run test:csharp-completion
```

Run the opt-in timing and payload-size report:

```sh
npm run benchmark:csharp-completion -- --iterations 30
```

Benchmark timings are diagnostic, not pass/fail thresholds. Correctness assertions remain in the
default command so normal test results are deterministic across machines.
