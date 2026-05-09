
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using BlazorWorker.Core;
using BlazorWorker.BackgroundServiceFactory;
using BlazorWorker.WorkerBackgroundService;
using System.Text;

public class MonacoServiceWrapper {
    [JSInvokable]
    public async Task<byte[]?> RunAsync(string name, string[] args) {
        var worker = Intellisage.MonacoWorkerWrapper
            ?? throw new InvalidOperationException("The C# Monaco worker has not been initialized.");

        switch (name) {
            case "GetCompletionAsync":
                return await worker.RunAsync(a => a.GetCompletionAsync(args[0], args[1]));
            case "GetCompletionResolveAsync":
                return await worker.RunAsync(a => a.GetCompletionResolveAsync(args[0]));
            case "GetSignatureHelpAsync":
                return await worker.RunAsync(a => a.GetSignatureHelpAsync(args[0], args[1]));
            case "GetQuickInfoAsync":
                return args.Length > 2
                    ? await worker.RunAsync(a => a.GetQuickInfoAsync(args[0], args[1], args[2]))
                    : args.Length > 1
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
                return args.Length > 3
                    ? await worker.RunAsync(a => a.GetReferencesAsync(args[0], args[1], args[2], args[3]))
                    : await worker.RunAsync(a => a.GetReferencesAsync(args[0], args[1], args[2]));
            case "GetRenameInfoAsync":
                return args.Length > 2
                    ? await worker.RunAsync(a => a.GetRenameInfoAsync(args[0], args[1], args[2]))
                    : await worker.RunAsync(a => a.GetRenameInfoAsync(args[0], args[1]));
            case "GetRenameEditsAsync":
                return args.Length > 3
                    ? await worker.RunAsync(a => a.GetRenameEditsAsync(args[0], args[1], args[2], args[3]))
                    : await worker.RunAsync(a => a.GetRenameEditsAsync(args[0], args[1], args[2]));
            case "GetDocumentSymbolsAsync":
                return await worker.RunAsync(a => a.GetDocumentSymbolsAsync(args[0]));
            case "GetFormattingAsync":
                return await worker.RunAsync(a => a.GetFormattingAsync(args[0]));
            case "GetRangeFormattingAsync":
                return await worker.RunAsync(a => a.GetRangeFormattingAsync(args[0], args[1]));
            case "GetCodeActionsAsync":
                return await worker.RunAsync(a => a.GetCodeActionsAsync(args[0], args[1]));
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

public static class Intellisage
{
    public static NavigationManager? NavigationManager {get;set;}
    public static IWorkerBackgroundService<MonacoService>? MonacoWorkerWrapper {get;set;}
    public static IWorker? Worker {get; set;}

    public static async void Init(IJSRuntime JS, NavigationManager nm, IWorkerFactory wf)
    {
       NavigationManager = nm;
       Worker = await wf.CreateAsync();
       Console.WriteLine("Creating worker");
       MonacoWorkerWrapper = await Worker.CreateBackgroundServiceAsync<MonacoService>();
       await MonacoWorkerWrapper.RunAsync(a => a.Init(nm.BaseUri));
       var _objRef = DotNetObjectReference.Create(new MonacoServiceWrapper());
       await JS.InvokeAsync<string>("registerService", _objRef);
       Console.WriteLine("Registered service");
    }
    
}
