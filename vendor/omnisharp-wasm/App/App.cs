using Microsoft.AspNetCore.Components;
using BlazorWorker.Core;
using Microsoft.JSInterop;

namespace CodeCraft.OmniSharpWasm {
    public class App : ComponentBase
{
    [Inject]
    NavigationManager NavigationManager { get; set; }
    [Inject]
    IJSRuntime JS { get; set; }
    [Inject]
    IWorkerFactory workerFactory { get; set; }
    protected override async Task OnInitializedAsync()
    {
        await OmniSharpWasm.Init(JS, NavigationManager, workerFactory);
    }
}
}
