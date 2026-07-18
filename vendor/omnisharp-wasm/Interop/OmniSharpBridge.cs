
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using BlazorWorker.Core;
using BlazorWorker.BackgroundServiceFactory;
using BlazorWorker.WorkerBackgroundService;
using System.Text;

namespace CodeCraft.OmniSharpWasm;

public class MonacoServiceWrapper {
    [JSInvokable]
    public async Task<byte[]?> RunAsync(string name, string[] args) {
        var worker = OmniSharpWasm.MonacoWorkerWrapper
            ?? throw new InvalidOperationException("The C# Monaco worker has not been initialized.");

        switch (name) {
            case "BeginMetadataHydrationAsync":
                return args.Length > 0
                    ? await worker.RunAsync(a => a.BeginMetadataHydrationAsync(args[0]))
                    : await worker.RunAsync(a => a.BeginMetadataHydrationAsync());
            case "GetMetadataStateAsync":
                return args.Length > 0
                    ? await worker.RunAsync(a => a.GetMetadataStateAsync(args[0]))
                    : await worker.RunAsync(a => a.GetMetadataStateAsync());
            case "SyncCompletionProjectAsync":
                return await worker.RunAsync(a => a.SyncCompletionProjectAsync(args[0], args[1], args[2]));
            case "WarmUpCurrentCompletionProjectAsync":
                return await worker.RunAsync(a => a.WarmUpCurrentCompletionProjectAsync());
            case "SyncDiagnosticProjectAsync":
                return await worker.RunAsync(a => a.SyncDiagnosticProjectAsync(args[0], args[1], args[2]));
            case "GetCompletionAsync":
                return args.Length > 5
                    ? await worker.RunAsync(a => a.GetCompletionAsync(args[0], args[1], args[2], args[3], args[4], args[5]))
                    : args.Length > 4
                    ? await worker.RunAsync(a => a.GetCompletionAsync(args[0], args[1], args[2], args[3], args[4]))
                    : args.Length > 3
                    ? await worker.RunAsync(a => a.GetCompletionAsync(args[0], args[1], args[2], args[3]))
                    : args.Length > 2
                    ? await worker.RunAsync(a => a.GetCompletionAsync(args[0], args[1], args[2]))
                    : await worker.RunAsync(a => a.GetCompletionAsync(args[0], args[1]));
            case "GetCompletionResolveAsync":
                return args.Length > 1
                    ? await worker.RunAsync(a => a.GetCompletionResolveAsync(args[0], args[1]))
                    : await worker.RunAsync(a => a.GetCompletionResolveAsync(args[0]));
            case "GetCompletionRefilterAsync":
                return await worker.RunAsync(a => a.GetCompletionRefilterAsync(args[0], args[1]));
            case "GetSpeculativeCompletionAsync":
                return args.Length > 5
                    ? await worker.RunAsync(a => a.GetSpeculativeCompletionAsync(args[0], args[1], args[2], args[3], args[4], args[5]))
                    : args.Length > 4
                    ? await worker.RunAsync(a => a.GetSpeculativeCompletionAsync(args[0], args[1], args[2], args[3], args[4]))
                    : await worker.RunAsync(a => a.GetSpeculativeCompletionAsync(args[0], args[1], args[2], args[3]));
            case "GetSpeculativeCompletionResolveAsync":
                return await worker.RunAsync(a => a.GetSpeculativeCompletionResolveAsync(args[0], args[1]));
            case "GetSpeculativeCompletionRefilterAsync":
                return await worker.RunAsync(a => a.GetSpeculativeCompletionRefilterAsync(args[0], args[1]));
            case "GetSignatureHelpAsync":
                return await worker.RunAsync(a => a.GetSignatureHelpAsync(args[0], args[1]));
            case "GetQuickInfoAsync":
                if (args.Length > 2)
                {
                    return await worker.RunAsync(a => a.GetQuickInfoAsync(args[0], args[1], args[2]));
                }
                return args.Length > 1
                    ? await worker.RunAsync(a => a.GetQuickInfoAsync(args[0], args[1]))
                    : await worker.RunAsync(a => a.GetQuickInfoAsync(args[0]));
            case "GetDiagnosticsAsync":
                return args.Length > 1
                    ? await worker.RunAsync(a => a.GetDiagnosticsAsync(args[0], args[1]))
                    : await worker.RunAsync(a => a.GetDiagnosticsAsync(args[0]));
            case "GetSemanticTokensAsync":
                return await worker.RunAsync(a => a.GetSemanticTokensAsync(args[0]));
            case "GetDefinitionAsync":
                return args.Length > 2
                    ? await worker.RunAsync(a => a.GetDefinitionAsync(args[0], args[1], args[2]))
                    : await worker.RunAsync(a => a.GetDefinitionAsync(args[0], args[1]));
            case "GetReferencesAsync":
                return await worker.RunAsync(a => a.GetReferencesAsync(args[0], args[1], args[2]));
            case "GetRenameInfoAsync":
                return await worker.RunAsync(a => a.GetRenameInfoAsync(args[0], args[1]));
            case "GetRenameEditsAsync":
                return await worker.RunAsync(a => a.GetRenameEditsAsync(args[0], args[1], args[2]));
            case "GetDocumentSymbolsAsync":
                return await worker.RunAsync(a => a.GetDocumentSymbolsAsync(args[0]));
            case "GetFormattingAsync":
                return await worker.RunAsync(a => a.GetFormattingAsync(args[0]));
            case "GetRangeFormattingAsync":
                return await worker.RunAsync(a => a.GetRangeFormattingAsync(args[0], args[1]));
            case "GetCodeActionsAsync":
                return args.Length > 2
                    ? await worker.RunAsync(a => a.GetCodeActionsAsync(args[0], args[1], args[2]))
                    : await worker.RunAsync(a => a.GetCodeActionsAsync(args[0], args[1]));
            case "GetInlayHintsAsync":
                return await worker.RunAsync(a => a.GetInlayHintsAsync(args[0], args[1]));
            case "GetFoldingRangesAsync":
                return await worker.RunAsync(a => a.GetFoldingRangesAsync(args[0]));
            case "IncludeNamespaceAsync":
                return await worker.RunAsync(a => a.IncludeNamespaceAsync(args[0]));
        }
       return Encoding.UTF8.GetBytes("{}");
    }
}

public static class OmniSharpWasm
{
    private static readonly SemaphoreSlim InitializationGate = new(1, 1);
    private static DotNetObjectReference<MonacoServiceWrapper>? _serviceReference;

    public static NavigationManager? NavigationManager {get;set;}
    public static IWorkerBackgroundService<MonacoService>? MonacoWorkerWrapper {get;set;}
    public static IWorker? Worker {get; set;}

    public static async Task Init(IJSRuntime JS, NavigationManager nm, IWorkerFactory wf)
    {
       await InitializationGate.WaitAsync();
       var initializationPhase = "starting";
       try
       {
           if (_serviceReference != null)
           {
               return;
           }

           NavigationManager = nm;
           await ReportInitializationProgressAsync(JS, "starting");
           initializationPhase = "worker-creation";
           Worker = await wf.CreateAsync();
           MonacoWorkerWrapper = await Worker.CreateBackgroundServiceAsync<MonacoService>();
           await ReportInitializationProgressAsync(JS, "worker-created");
           initializationPhase = "project-model-creation";
           await MonacoWorkerWrapper.RunAsync(a => a.CreateProjects(nm.BaseUri));
           await ReportInitializationProgressAsync(JS, "project-models-created");
           initializationPhase = "static-asset-loading";
           await MonacoWorkerWrapper.RunAsync(a => a.InitializeStaticAssetsAsync());
           await ReportInitializationProgressAsync(JS, "static-assets-loaded");
           initializationPhase = "static-asset-validation";
           await MonacoWorkerWrapper.RunAsync(a => a.ValidateStaticAssetsAsync());
           await ReportInitializationProgressAsync(JS, "static-assets-validated");
           initializationPhase = "static-metadata-initialization";
           await MonacoWorkerWrapper.RunAsync(a => a.InitializeStaticMetadataAsync());
           await ReportInitializationProgressAsync(JS, "static-metadata-initialized");
           initializationPhase = "completion-project-initialization";
           await MonacoWorkerWrapper.RunAsync(a => a.InitializeCompletionProjectAsync());
           await ReportInitializationProgressAsync(JS, "completion-project-initialized");
           initializationPhase = "speculative-project-initialization";
           await MonacoWorkerWrapper.RunAsync(a => a.InitializeSpeculativeCompletionProjectAsync());
           await ReportInitializationProgressAsync(JS, "speculative-project-initialized");
           initializationPhase = "diagnostic-project-initialization";
           await MonacoWorkerWrapper.RunAsync(a => a.InitializeDiagnosticProjectAsync());
           await ReportInitializationProgressAsync(JS, "projects-initialized");
           initializationPhase = "service-initialization";
           await MonacoWorkerWrapper.RunAsync(a => a.InitializeServices());
           await ReportInitializationProgressAsync(JS, "services-initialized");
           initializationPhase = "completion-warmup";
           await MonacoWorkerWrapper.RunAsync(a => a.WarmUpCompletionAsync());
           await ReportInitializationProgressAsync(JS, "completion-warmed");
           initializationPhase = "service-registration";
           var serviceReference = DotNetObjectReference.Create(new MonacoServiceWrapper());
           try
           {
               await JS.InvokeVoidAsync("registerService", serviceReference);
               _serviceReference = serviceReference;
           }
           catch
           {
               serviceReference.Dispose();
               throw;
           }
       }
       catch (Exception e)
       {
           await ReportInitializationFailureAsync(JS, initializationPhase, e);
           throw;
       }
       finally
       {
           InitializationGate.Release();
       }
    }

    private static async Task ReportInitializationFailureAsync(
        IJSRuntime js,
        string phase,
        Exception exception)
    {
        try
        {
            var message = exception.GetBaseException().Message;
            await js.InvokeVoidAsync(
                "reportOmniSharpInitializationFailure",
                phase,
                string.IsNullOrWhiteSpace(message) ? exception.GetType().Name : message);
        }
        catch
        {
            // A legacy host may not provide the failure helper. Preserve the original
            // exception and let the existing stall watchdog remain the final backstop.
        }
    }

    private static async Task ReportInitializationProgressAsync(IJSRuntime js, string phase)
    {
        try
        {
            await js.InvokeVoidAsync("reportOmniSharpInitializationProgress", phase);
        }
        catch
        {
            // Progress is advisory. A missing/older host helper must never prevent the
            // standalone static worker from reaching its final ready handshake.
        }
    }
    
}
