using System.Runtime.InteropServices.JavaScript;

namespace CodeCraft.OmniSharpWasm.Interop;

/// <summary>
/// Transfers large immutable static assets through the WebAssembly runtime's native
/// typed-array marshaller. BlazorWorker's managed HttpClient bridge can indefinitely
/// stall while handing a multi-megabyte response body to managed code; this path keeps
/// the fetch and buffering in JavaScript and performs one binary copy into the worker.
/// </summary>
internal static partial class BrowserStaticAssetLoader
{
    [JSImport("globalThis.codecraftLoadStaticAsset")]
    [return: JSMarshalAs<JSType.Promise<JSType.Object>>]
    private static partial Task<JSObject> LoadStaticAssetAsync(
        [JSMarshalAs<JSType.String>] string url,
        [JSMarshalAs<JSType.Number>] int timeoutMilliseconds,
        [JSMarshalAs<JSType.Number>] int maximumLength);

    [JSImport("globalThis.codecraftCopyStaticAssetBytes")]
    private static partial void CopyStaticAssetBytes(
        JSObject source,
        [JSMarshalAs<JSType.MemoryView>] Span<byte> destination);

    [JSImport("globalThis.codecraftReportStaticAssetPhase")]
    private static partial void ReportStaticAssetPhase(
        [JSMarshalAs<JSType.String>] string phase);

    [JSImport("globalThis.codecraftYieldToBrowser")]
    [return: JSMarshalAs<JSType.Promise<JSType.Boolean>>]
    private static partial Task<bool> YieldToBrowserNativeAsync();

    internal static async Task<byte[]?> LoadBytesAsync(
        string url,
        int timeoutMilliseconds,
        int maximumLength)
    {
        if (!OperatingSystem.IsBrowser())
        {
            return null;
        }

        ReportPhase("managed-await-started");
        byte[] result;
        using (var source = await LoadStaticAssetAsync(
                   url,
                   timeoutMilliseconds,
                   maximumLength))
        {
            ReportPhase("managed-result-received");

            var length = source.GetPropertyAsInt32("length");
            if (length <= 0 || length > maximumLength)
            {
                throw new InvalidOperationException(
                    $"Static asset length {length} is outside the allowed range.");
            }

            result = GC.AllocateUninitializedArray<byte>(length);
            CopyToManagedArray(source, result);
            ReportPhase("managed-bytes-copied");
        }

        ReportPhase("managed-source-released");
        return result;
    }

    internal static void ReportPhase(string phase)
    {
        try
        {
            ReportStaticAssetPhase(phase);
        }
        catch
        {
            // Advisory instrumentation must never enter the correctness path.
        }
    }

    internal static async Task YieldToBrowserAsync()
    {
        if (OperatingSystem.IsBrowser())
        {
            _ = await YieldToBrowserNativeAsync();
            return;
        }

        await Task.Yield();
    }

    // Span cannot be captured by an async state machine. Keeping this synchronous also
    // guarantees that the runtime releases the pinned MemoryView before returning.
    private static void CopyToManagedArray(JSObject source, byte[] destination)
    {
        CopyStaticAssetBytes(source, destination.AsSpan());
    }
}
