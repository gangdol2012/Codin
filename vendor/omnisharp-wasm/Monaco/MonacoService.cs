using System.Collections.Immutable;
using System.Reflection;
using System.Composition.Hosting;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CodeActions;
using Microsoft.CodeAnalysis.CodeFixes;
using Microsoft.CodeAnalysis.CodeRefactorings;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Formatting;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;
using OmniSharp.Models;
using OmniSharp.Models.SignatureHelp;
using OmniSharp.Models.v1.Completion;
using OmniSharp.Options;

public class MonacoService
{
    // JS retains six exact + six reusable normal lists. Speculative completion can also
    // retain four not-yet-replayed predictive lists. Three safety slots cover a popup
    // outside those maps, a just-returned list awaiting browser-cache publication, and
    // the new in-flight key created after live-key reconciliation.
    const int NormalCompletionListCacheLimit = 15;
    const int SpeculativeCompletionListCacheLimit = 19;
    #region Fields

    OmniSharpProject _completionProject = null!;
    OmniSharpProject _speculativeCompletionProject = null!;
    OmniSharpProject _diagnosticProject = null!;
    OmniSharpCompletionService _completionService = null!;
    OmniSharpCompletionService _speculativeCompletionService = null!;
    OmniSharpSignatureHelpService _signatureService = null!;
    OmniSharpQuickInfoProvider _quickInfoProvider = null!;
    CodeActionProviderSet? _codeActionProviderSet;
    readonly SemaphoreSlim _completionGate = new(1, 1);
    readonly SemaphoreSlim _speculativeCompletionGate = new(1, 1);
    readonly SemaphoreSlim _diagnosticGate = new(1, 1);
    CancellationTokenSource? _backgroundDiagnosticCancellation;
    int _interactiveRequestEpoch;
    string _completionProjectRevision = string.Empty;
    string _speculativeProjectRevision = string.Empty;

    readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    readonly JsonSerializerOptions inputJsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    static readonly Regex MissingSymbolRegex = new Regex("'([^']+)'", RegexOptions.Compiled);

    static readonly HashSet<string> ControlKeywords = new(StringComparer.Ordinal)
    {
        "break", "case", "catch", "continue", "default", "do", "else", "finally", "for", "foreach", "goto", "if",
        "lock", "return", "switch", "throw", "try", "while", "yield", "when"
    };

    static readonly HashSet<string> CSharpKeywords = new(StringComparer.Ordinal)
    {
        "abstract", "add", "alias", "and", "args", "as", "ascending", "async", "await", "base", "bool", "break",
        "by", "byte", "case", "catch", "char", "checked", "class", "const", "continue", "decimal", "default",
        "delegate", "descending", "do", "double", "dynamic", "else", "enum", "equals", "event", "explicit",
        "extern", "false", "file", "finally", "fixed", "float", "for", "foreach", "from", "get", "global", "goto",
        "group", "if", "implicit", "in", "init", "int", "interface", "internal", "into", "is", "join", "let",
        "lock", "long", "managed", "nameof", "namespace", "new", "nint", "not", "notnull", "nuint", "null",
        "object", "on", "operator", "or", "orderby", "out", "override", "params", "partial", "private",
        "protected", "public", "readonly", "record", "ref", "remove", "required", "return", "sbyte", "scoped",
        "sealed", "select", "set", "short", "sizeof", "stackalloc", "static", "string", "struct", "switch",
        "this", "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unmanaged", "unsafe", "ushort",
        "using", "value", "var", "virtual", "void", "volatile", "when", "where", "while", "with", "yield"
    };

    #endregion

    #region Records

    public record DiagnosticDto()
    {
        public LinePosition Start { get; init; }
        public LinePosition End { get; init; }
        public string Message { get; init; } = "";
        public int Severity { get; init; }
        public string Id { get; init; } = "";
    }

    public record PositionDto(int Line, int Character);
    public record TextRange(PositionDto Start, PositionDto End);
    public record PositionRequest(int Line, int Column);
    public record RangeRequest(PositionDto Start, PositionDto End);
    public record DiagnosticProjectFileDto(string Path, string Content);
    public record DiagnosticProjectRequest(string? CurrentPath, DiagnosticProjectFileDto[]? Files);
    public record MonacoLocation(TextRange Range, string? Path = null, string? Name = null, string? Kind = null, string? Detail = null);
    public record MonacoTextEdit(TextRange Range, string Text, string? Path = null);
    public record RenameInfo(bool CanRename, TextRange? Range, string? Text, string? RejectReason);
    public record CodeActionDto(string Title, string Kind, MonacoTextEdit[] Edits, bool IsPreferred);
    public record DocumentSymbolDto(string Name, string Detail, string Kind, TextRange Range, TextRange SelectionRange, DocumentSymbolDto[] Children);
    public record SemanticTokenDto(int StartLine, int StartColumn, int Length, string Type, string[] Modifiers);
    public record InlayHintDto(string Kind, string Label, PositionDto Position, bool PaddingLeft, bool PaddingRight);
    public record FoldingRangeDto(int Start, int End, string? Kind);
    internal record ResponsePayload(object? Payload, string? Type, int MetadataVersion);
    public record MetadataStateResponse(
        int Version,
        bool FullyHydrated,
        bool HydrationRunning);
    public record ProjectSyncResponse(string ProjectStateKey, long PrimaryDocumentVersion, int PrimaryDocumentTextLength);
    public record CompletionTextSyncRequest(
        bool FullSync,
        long ExpectedVersion,
        int ExpectedOldTextLength,
        int ExpectedNewTextLength,
        string ProjectRevision,
        OmniSharpProject.IncrementalTextChange[]? Changes);
    public record CompletionTextSyncAck(
        bool Success,
        bool RequiresFullSync,
        long Version,
        int TextLength,
        string? ProjectRevision,
        string? Message);
    public record SynchronizedCompletionResponse(
        [property: JsonPropertyName("s")] CompletionTextSyncAck Sync,
        [property: JsonPropertyName("p")] OmniSharpCompletionService.CompactCompletionResponse? Completion,
        [property: JsonPropertyName("c")] bool Cancelled = false);
    public record SpeculativeCancellationResponse(bool Cancelled);
    public record BackgroundDiagnosticCancellationResponse(bool Cancelled);
    record CompletionTextSyncApplication(CompletionTextSyncAck Acknowledgement, Document? Document);
    record CodeActionProviderSet(CodeFixProvider[] CodeFixProviders, CodeRefactoringProvider[] RefactoringProviders, IDisposable? Container);

    #endregion

    #region Constructors

    public MonacoService()
    {
        DefaultCode =
$@"using System; 
    class Filter 
    {{               
        public Filter() 
        {{ 
            
        }}
    }} 
";
    }

    #endregion

    #region Properties

    public string DefaultCode { get; init; }

    #endregion

    #region Methods

    public async Task Init(string uri)
    {
        await InitializeProjectsAsync(uri);
        InitializeServices();
        await WarmUpCompletionAsync();
    }

    public async Task InitializeProjectsAsync(string uri)
    {
        CreateProjects(uri);
        await InitializeStaticMetadataAsync();
        await Task.WhenAll(
            InitializeCompletionProjectAsync(),
            InitializeSpeculativeCompletionProjectAsync(),
            InitializeDiagnosticProjectAsync());
    }

    public void CreateProjects(string uri)
    {
        _completionProject = new OmniSharpProject(uri);
        _speculativeCompletionProject = new OmniSharpProject(uri);
        _diagnosticProject = new OmniSharpProject(uri);
    }

    public async Task<bool> InitializeStaticMetadataAsync()
    {
        // BlazorWorker's result-bearing async route is materially more reliable for a
        // browser task that crosses many JS Promise continuations than its void-Task
        // route. Returning an explicit acknowledgement also prevents the host from
        // advancing until the atomically published metadata generation is observable.
        await _completionProject.InitializeStaticMetadataAsync();
        return true;
    }

    public async Task<bool> InitializeStaticAssetsAsync()
    {
        await _completionProject.InitializeStaticAssetsAsync();
        return true;
    }

    public Task ValidateStaticAssetsAsync()
    {
        return _completionProject.ValidateStaticAssetsAsync();
    }

    public Task InitializeCompletionProjectAsync()
    {
        return _completionProject.Init();
    }

    public Task InitializeSpeculativeCompletionProjectAsync()
    {
        return _speculativeCompletionProject.Init();
    }

    public Task InitializeDiagnosticProjectAsync()
    {
        return _diagnosticProject.Init();
    }

    public void InitializeServices()
    {
        var loggerFactory = LoggerFactory.Create(configure => { });
        var formattingOptions = new OmniSharp.Options.FormattingOptions();

        _completionService = new OmniSharpCompletionService(
            _completionProject.Workspace,
            formattingOptions,
            loggerFactory,
            NormalCompletionListCacheLimit);
        _speculativeCompletionService = new OmniSharpCompletionService(
            _speculativeCompletionProject.Workspace,
            formattingOptions,
            loggerFactory,
            SpeculativeCompletionListCacheLimit);
        _signatureService = new OmniSharpSignatureHelpService(_completionProject.Workspace);
        _quickInfoProvider = new OmniSharpQuickInfoProvider(_diagnosticProject.Workspace, formattingOptions, loggerFactory);
    }

    static async Task WarmUpCompletionProjectAsync(
        OmniSharpProject project,
        OmniSharpCompletionService service,
        string label)
    {
        try
        {
            var warmUpDocument = project.Workspace.CurrentSolution
                .GetDocument(project.DocumentId)!;
            await service.WarmUpAsync(warmUpDocument);
        }
        catch (Exception e)
        {
            // Warm-up is an optimization only; an unusual provider failure must never
            // make the full language service unavailable.
            Console.WriteLine(
                $"Could not warm {label} C# completion providers: {e.Message}");
        }
    }

    public async Task WarmUpCompletionAsync()
    {
        // Normal and predictive completion have deliberately isolated Roslyn workspaces.
        // Warm both against the final full-reference generation before registration so
        // `C` and an immediately predicted `Console.` share the same no-JIT/no-index floor.
        await WarmUpCompletionProjectAsync(
            _completionProject,
            _completionService,
            "interactive");
        await WarmUpCompletionProjectAsync(
            _speculativeCompletionProject,
            _speculativeCompletionService,
            "speculative");
    }

    public async Task<byte[]> WarmUpCurrentCompletionProjectAsync()
    {
        return await RunCompletionAsync(async () =>
        {
            // This endpoint follows the synchronized interactive project contract. The
            // speculative lane is warmed once at startup and owns a separate gate/state;
            // touching it here could race predictive work and compile stale source.
            await WarmUpCompletionProjectAsync(
                _completionProject,
                _completionService,
                "current interactive");
            return Payload(true, "WarmUpCurrentCompletionProjectAsync");
        });
    }

    public Task<byte[]> BeginMetadataHydrationAsync()
    {
        return BeginMetadataHydrationAsync("BeginMetadataHydrationAsync");
    }

    public Task<byte[]> BeginMetadataHydrationAsync(string responseType)
    {
        _completionProject.BeginBackgroundMetadataHydration(
            CommitAndWarmHydratedMetadataAsync);
        return GetMetadataStateAsync(ValidatedMetadataResponseType(
            responseType,
            "BeginMetadataHydrationAsync"));
    }

    public Task<byte[]> GetMetadataStateAsync()
    {
        return GetMetadataStateAsync("GetMetadataStateAsync");
    }

    public Task<byte[]> GetMetadataStateAsync(string responseType)
    {
        var validatedResponseType = ValidatedMetadataResponseType(
            responseType,
            "GetMetadataStateAsync");
        var state = _completionProject.GetMetadataHydrationState();
        return Task.FromResult(Payload(
            new MetadataStateResponse(
                state.Version,
                state.FullyHydrated,
                state.HydrationRunning),
            validatedResponseType));
    }

    static string ValidatedMetadataResponseType(string? responseType, string method)
    {
        if (string.Equals(responseType, method, StringComparison.Ordinal))
        {
            return method;
        }

        var prefix = method + ":";
        if (responseType == null ||
            !responseType.StartsWith(prefix, StringComparison.Ordinal) ||
            responseType.Length > prefix.Length + 32 ||
            responseType.AsSpan(prefix.Length).IsEmpty ||
            !responseType.AsSpan(prefix.Length).ToString().All(char.IsAsciiDigit))
        {
            return method;
        }
        return responseType;
    }

    private async Task<OmniSharpProject.MetadataHydrationCommitResult>
        CommitAndWarmHydratedMetadataAsync(
        Func<Task<bool>> commitMetadataAsync,
        Func<bool> interactivePriorityRequested)
    {
        var committed = false;
        if (interactivePriorityRequested())
        {
            return new OmniSharpProject.MetadataHydrationCommitResult(false, false);
        }
        await _completionGate.WaitAsync();
        try
        {
            if (interactivePriorityRequested())
            {
                return new OmniSharpProject.MetadataHydrationCommitResult(false, false);
            }
            await _speculativeCompletionGate.WaitAsync();
            try
            {
                if (interactivePriorityRequested())
                {
                    return new OmniSharpProject.MetadataHydrationCommitResult(false, false);
                }
                await _diagnosticGate.WaitAsync();
                try
                {
                    if (interactivePriorityRequested())
                    {
                        return new OmniSharpProject.MetadataHydrationCommitResult(false, false);
                    }
                    committed = await commitMetadataAsync();
                    if (!committed)
                    {
                        return new OmniSharpProject.MetadataHydrationCommitResult(false, false);
                    }

                    // The startup warm already initialized Roslyn's completion providers.
                    // Compiling two full-reference snapshots here would monopolize the
                    // single browser worker after readiness. Metadata is now atomically
                    // visible to all projects; interactive demand will compile only the
                    // snapshot it actually needs.
                    return new OmniSharpProject.MetadataHydrationCommitResult(true, true);
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Could not commit the fully hydrated C# metadata snapshot: {e.Message}");
                    return new OmniSharpProject.MetadataHydrationCommitResult(committed, false);
                }
                finally
                {
                    _diagnosticGate.Release();
                }
            }
            finally
            {
                _speculativeCompletionGate.Release();
            }
        }
        finally
        {
            _completionGate.Release();
        }
    }

    public async Task<byte[]> GetCompletionAsync(string code, string completionRequestString)
    {
        return await GetCompletionAsync(code, completionRequestString, string.Empty);
    }

    public async Task<byte[]> SyncCompletionProjectAsync(
        string code,
        string projectRequestString,
        string projectStateKey)
    {
        CancelCompletionProjectWarmUp();
        return await RunCompletionAsync(async () =>
        {
            _ = await UpdateCompletionDocumentAsync(code, projectRequestString);
            _completionProjectRevision = projectStateKey;
            var response = Payload(
                new ProjectSyncResponse(
                    projectStateKey,
                    _completionProject.PrimaryDocumentVersion,
                    _completionProject.PrimaryDocumentTextLength),
                "SyncCompletionProjectAsync");
            ScheduleCompletionProjectWarmUp(projectStateKey);
            return response;
        });
    }

    public async Task<byte[]> SyncDiagnosticProjectAsync(
        string code,
        string projectRequestString,
        string projectStateKey)
    {
        return await RunDiagnosticAsync(async () =>
        {
            _ = await UpdateDiagnosticDocumentAsync(code, projectRequestString);
            return Payload(
                new ProjectSyncResponse(
                    projectStateKey,
                    _diagnosticProject.PrimaryDocumentVersion,
                    _diagnosticProject.PrimaryDocumentTextLength),
                "SyncDiagnosticProjectAsync");
        });
    }

    public async Task<byte[]> GetCompletionAsync(string code, string completionRequestString, string projectRequestString)
    {
        return await GetCompletionAsync(code, completionRequestString, projectRequestString, string.Empty);
    }

    public async Task<byte[]> GetCompletionAsync(
        string code,
        string completionRequestString,
        string projectRequestString,
        string completionListKey)
    {
        CancelCompletionProjectWarmUp();
        return await RunCompletionAsync(async () =>
        {
            var completionRequest = DeserializeRequest<CompletionRequest>(completionRequestString);
            var hasUnversionedProjectSnapshot =
                !string.IsNullOrWhiteSpace(projectRequestString);
            if (hasUnversionedProjectSnapshot)
            {
                // This legacy overload has no revision parameter. Never retain an opaque
                // revision that described the project before this full snapshot arrived.
                _completionProjectRevision = string.Empty;
            }

            var document = await UpdateCompletionDocumentAsync(code, projectRequestString);
            var completionResponse = await _completionService.Handle(
                completionRequest,
                document,
                string.IsNullOrWhiteSpace(completionListKey) ? null : completionListKey);

            var response = Payload(_completionService.Compact(completionResponse), "GetCompletionAsync");
            if (!hasUnversionedProjectSnapshot)
            {
                ScheduleCurrentCompletionProjectWarmUp();
            }

            return response;
        });
    }

    public async Task<byte[]> GetCompletionAsync(
        string code,
        string textSyncRequestString,
        string completionRequestString,
        string projectRequestString,
        string completionListKey)
    {
        return await GetCompletionAsync(
            code,
            textSyncRequestString,
            completionRequestString,
            projectRequestString,
            completionListKey,
            string.Empty);
    }

    public async Task<byte[]> GetCompletionAsync(
        string code,
        string textSyncRequestString,
        string completionRequestString,
        string projectRequestString,
        string completionListKey,
        string retainedCompletionListKeysString)
    {
        CancelCompletionProjectWarmUp();
        return await RunCompletionAsync(async () =>
        {
            ReconcileCompletionLists(
                _completionService,
                retainedCompletionListKeysString);
            var textSyncRequest = DeserializeRequest<CompletionTextSyncRequest>(textSyncRequestString);
            var synchronization = await ApplyCompletionTextSyncAsync(
                _completionProject,
                textSyncRequest,
                code,
                projectRequestString,
                _completionProjectRevision,
                "completion");
            if (!synchronization.Acknowledgement.Success || synchronization.Document == null)
            {
                return Payload(
                    new SynchronizedCompletionResponse(synchronization.Acknowledgement, null),
                    "GetCompletionAsync");
            }

            _completionProjectRevision = textSyncRequest.ProjectRevision;
            var completionRequest = DeserializeRequest<CompletionRequest>(completionRequestString);
            var completionResponse = await _completionService.Handle(
                completionRequest,
                synchronization.Document,
                string.IsNullOrWhiteSpace(completionListKey) ? null : completionListKey);
            var response = Payload(
                new SynchronizedCompletionResponse(
                    synchronization.Acknowledgement,
                    _completionService.Compact(completionResponse)),
                "GetCompletionAsync");
            ScheduleCompletionProjectWarmUp(textSyncRequest.ProjectRevision);
            return response;
        });
    }

    public async Task<byte[]> GetCompletionResolveAsync(string completionResolveRequestString)
    {
        return await GetCompletionResolveAsync(completionResolveRequestString, string.Empty);
    }

    public async Task<byte[]> GetCompletionResolveAsync(string completionResolveRequestString, string completionListKey)
    {
        CancelCompletionProjectWarmUp();
        return await RunCompletionAsync(async () =>
        {
            var completionResolveRequest = DeserializeRequest<CompletionResolveRequest>(completionResolveRequestString);
            var document = _completionProject.Workspace.CurrentSolution.GetDocument(_completionProject.DocumentId)!;
            var completionResponse = await _completionService.Handle(
                completionResolveRequest,
                document,
                string.IsNullOrWhiteSpace(completionListKey) ? null : completionListKey);

            var response = Payload(completionResponse, "GetCompletionResolveAsync");
            ScheduleCurrentCompletionProjectWarmUp();
            return response;
        });
    }

    public async Task<byte[]> GetCompletionRefilterAsync(string filterText, string completionListKey)
    {
        CancelCompletionProjectWarmUp();
        return await RunCompletionAsync(() =>
        {
            var response = Payload(
                _completionService.Refilter(completionListKey, filterText),
                "GetCompletionRefilterAsync");
            ScheduleCurrentCompletionProjectWarmUp();
            return Task.FromResult(response);
        });
    }

    public async Task<byte[]> GetSpeculativeCompletionAsync(string code, string completionRequestString, string projectRequestString, string completionListKey)
    {
        return await RunSpeculativeCompletionAsync(
            "GetSpeculativeCompletionAsync",
            () => Payload(null, "GetSpeculativeCompletionAsync"),
            async interactiveSuperseded =>
        {
            var completionRequest = DeserializeRequest<CompletionRequest>(completionRequestString);
            if (!string.IsNullOrWhiteSpace(projectRequestString))
            {
                // As above, force the next synchronized speculative request to provide a
                // full snapshot instead of accepting deltas under a stale revision marker.
                _speculativeProjectRevision = string.Empty;
            }

            var document = await UpdateSpeculativeCompletionDocumentAsync(code, projectRequestString);
            if (interactiveSuperseded())
            {
                return SpeculativeCancellationPayload("GetSpeculativeCompletionAsync");
            }
            var completionResponse = await _speculativeCompletionService.Handle(completionRequest, document, completionListKey);

            return Payload(_speculativeCompletionService.Compact(completionResponse), "GetSpeculativeCompletionAsync");
        });
    }

    public async Task<byte[]> GetSpeculativeCompletionAsync(
        string code,
        string textSyncRequestString,
        string completionRequestString,
        string projectRequestString,
        string completionListKey)
    {
        return await GetSpeculativeCompletionAsync(
            code,
            textSyncRequestString,
            completionRequestString,
            projectRequestString,
            completionListKey,
            string.Empty);
    }

    public async Task<byte[]> GetSpeculativeCompletionAsync(
        string code,
        string textSyncRequestString,
        string completionRequestString,
        string projectRequestString,
        string completionListKey,
        string retainedCompletionListKeysString)
    {
        return await RunSpeculativeCompletionAsync(
            "GetSpeculativeCompletionAsync",
            () => SpeculativeCancellationPayload("GetSpeculativeCompletionAsync"),
            async interactiveSuperseded =>
        {
            ReconcileCompletionLists(
                _speculativeCompletionService,
                retainedCompletionListKeysString);
            var textSyncRequest = DeserializeRequest<CompletionTextSyncRequest>(textSyncRequestString);
            var synchronization = await ApplyCompletionTextSyncAsync(
                _speculativeCompletionProject,
                textSyncRequest,
                code,
                projectRequestString,
                _speculativeProjectRevision,
                "speculative completion");
            if (!synchronization.Acknowledgement.Success || synchronization.Document == null)
            {
                return Payload(
                    new SynchronizedCompletionResponse(synchronization.Acknowledgement, null),
                    "GetSpeculativeCompletionAsync");
            }

            _speculativeProjectRevision = textSyncRequest.ProjectRevision;
            if (interactiveSuperseded())
            {
                return SpeculativeCancellationPayload(
                    "GetSpeculativeCompletionAsync",
                    synchronization.Acknowledgement);
            }
            var completionRequest = DeserializeRequest<CompletionRequest>(completionRequestString);
            var completionResponse = await _speculativeCompletionService.Handle(
                completionRequest,
                synchronization.Document,
                completionListKey);
            return Payload(
                new SynchronizedCompletionResponse(
                    synchronization.Acknowledgement,
                    _speculativeCompletionService.Compact(completionResponse)),
                "GetSpeculativeCompletionAsync");
        });
    }

    void ReconcileCompletionLists(
        OmniSharpCompletionService service,
        string retainedCompletionListKeysString)
    {
        if (string.IsNullOrWhiteSpace(retainedCompletionListKeysString))
        {
            return;
        }

        var retainedKeys = DeserializeRequest<string[]>(retainedCompletionListKeysString)
            .Where(key => !string.IsNullOrWhiteSpace(key) && key.Length <= 2048)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        service.ReconcileCompletionLists(retainedKeys);
    }

    public async Task<byte[]> GetSpeculativeCompletionResolveAsync(string completionResolveRequestString, string completionListKey)
    {
        return await RunSpeculativeCompletionAsync(
            "GetSpeculativeCompletionResolveAsync",
            () => SpeculativeCancellationPayload("GetSpeculativeCompletionResolveAsync"),
            async interactiveSuperseded =>
        {
            var completionResolveRequest = DeserializeRequest<CompletionResolveRequest>(completionResolveRequestString);
            var document = _speculativeCompletionProject.Workspace.CurrentSolution.GetDocument(_speculativeCompletionProject.DocumentId)!;
            if (interactiveSuperseded())
            {
                return SpeculativeCancellationPayload("GetSpeculativeCompletionResolveAsync");
            }
            var completionResponse = await _speculativeCompletionService.Handle(completionResolveRequest, document, completionListKey);

            return Payload(completionResponse, "GetSpeculativeCompletionResolveAsync");
        });
    }

    public async Task<byte[]> GetSpeculativeCompletionRefilterAsync(string filterText, string completionListKey)
    {
        return await RunSpeculativeCompletionAsync(
            "GetSpeculativeCompletionRefilterAsync",
            () => SpeculativeCancellationPayload("GetSpeculativeCompletionRefilterAsync"),
            interactiveSuperseded =>
            Task.FromResult(interactiveSuperseded()
                ? SpeculativeCancellationPayload("GetSpeculativeCompletionRefilterAsync")
                : Payload(
                    _speculativeCompletionService.Refilter(completionListKey, filterText),
                    "GetSpeculativeCompletionRefilterAsync")));
    }

    public Task<byte[]> CancelSpeculativeCompletionAsync()
    {
        SignalInteractiveRequest();
        return Task.FromResult(Payload(true, "CancelSpeculativeCompletionAsync"));
    }

    public async Task<byte[]> GetSignatureHelpAsync(string code, string signatureHelpRequestString)
    {
        CancelCompletionProjectWarmUp();
        return await RunCompletionAsync(async () =>
        {
            var signatureHelpRequest = DeserializeRequest<SignatureHelpRequest>(signatureHelpRequestString);
            var document = await UpdateDocumentAsync(_completionProject, code);
            var signatureHelpResponse = await _signatureService.Handle(signatureHelpRequest, document);

            var response = Payload(signatureHelpResponse, "GetSignatureHelpAsync");
            ScheduleCurrentCompletionProjectWarmUp();
            return response;
        });
    }

    public async Task<byte[]> GetQuickInfoAsync(string quickInfoRequestString)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = _diagnosticProject.Workspace.CurrentSolution.GetDocument(_diagnosticProject.DocumentId)!;
            var quickInfoRequest = DeserializeRequest<QuickInfoRequest>(quickInfoRequestString);
            var quickInfoResponse = await _quickInfoProvider.Handle(quickInfoRequest, document);

            return Payload(quickInfoResponse, "GetQuickInfoAsync");
        });
    }

    public async Task<byte[]> GetQuickInfoAsync(string code, string quickInfoRequestString)
    {
        return await GetQuickInfoAsync(code, quickInfoRequestString, string.Empty);
    }

    public async Task<byte[]> GetQuickInfoAsync(string code, string quickInfoRequestString, string diagnosticRequestString)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
            var quickInfoRequest = DeserializeRequest<QuickInfoRequest>(quickInfoRequestString);
            var quickInfoResponse = await _quickInfoProvider.Handle(quickInfoRequest, document);

            return Payload(quickInfoResponse, "GetQuickInfoAsync");
        });
    }

    public async Task<byte[]> GetDiagnosticsAsync(string code)
    {
        return await GetDiagnosticsAsync(code, string.Empty);
    }

    public async Task<byte[]> GetDiagnosticsAsync(string code, string diagnosticRequestString)
    {
        return await RunBackgroundDiagnosticAsync("GetDiagnosticsAsync", async cancellationToken =>
        {
            var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
            cancellationToken.ThrowIfCancellationRequested();
            var semanticModel = await document.GetSemanticModelAsync(cancellationToken);
            if (semanticModel == null)
            {
                return Payload(Array.Empty<DiagnosticDto>(), "GetDiagnosticsAsync");
            }

            var diagnostics = semanticModel
                .GetDiagnostics(cancellationToken: cancellationToken)
                .Select(ToDiagnosticDto)
                .Where(current => current != null)
                .Cast<DiagnosticDto>()
                .ToList();

            return Payload(diagnostics, "GetDiagnosticsAsync");
        });
    }

    public async Task<byte[]> GetSemanticTokensAsync(string code)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var tokens = await BuildSemanticTokensAsync(document);
            return Payload(tokens, "GetSemanticTokensAsync");
        });
    }

    public async Task<byte[]> GetDefinitionAsync(string code, string positionRequestString)
    {
        return await GetDefinitionAsync(code, positionRequestString, string.Empty);
    }

    public async Task<byte[]> GetDefinitionAsync(string code, string positionRequestString, string diagnosticRequestString)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var currentPath = TryReadCurrentPath(diagnosticRequestString);
            var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
            var symbol = await FindSymbolAsync(document, positionRequestString);
            if (symbol == null)
            {
                return Payload(Array.Empty<MonacoLocation>(), "GetDefinitionAsync");
            }

            var solution = document.Project.Solution;
            var sourceSymbol = await SymbolFinder.FindSourceDefinitionAsync(symbol, solution) ?? symbol;
            var locations = sourceSymbol.Locations
                .Where(location => location.IsInSource)
                .Select(location => ToLocation(location, document, sourceSymbol, currentPath))
                .Where(location => location != null)
                .Cast<MonacoLocation>()
                .ToArray();

            return Payload(locations, "GetDefinitionAsync");
        });
    }

    public async Task<byte[]> GetReferencesAsync(string code, string positionRequestString, string includeDeclarationString)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var symbol = await FindSymbolAsync(document, positionRequestString);
            if (symbol == null)
            {
                return Payload(Array.Empty<MonacoLocation>(), "GetReferencesAsync");
            }

            var includeDeclaration = bool.TryParse(includeDeclarationString, out var parsed) && parsed;
            var solution = document.Project.Solution;
            var references = new List<MonacoLocation>();

            if (includeDeclaration)
            {
                references.AddRange(symbol.Locations
                    .Where(location => location.IsInSource)
                    .Select(location => ToLocation(location, document, symbol))
                    .Where(location => location != null)
                    .Cast<MonacoLocation>());
            }

            foreach (var referencedSymbol in await SymbolFinder.FindReferencesAsync(symbol, solution))
            {
                foreach (var location in referencedSymbol.Locations)
                {
                    if (!location.Location.IsInSource)
                    {
                        continue;
                    }

                    var monacoLocation = ToLocation(location.Location, document, referencedSymbol.Definition);
                    if (monacoLocation != null)
                    {
                        references.Add(monacoLocation);
                    }
                }
            }

            var distinct = references
                .GroupBy(location => (
                    location.Path,
                    location.Range.Start.Line,
                    location.Range.Start.Character,
                    location.Range.End.Line,
                    location.Range.End.Character))
                .Select(group => group.First())
                .OrderBy(location => location.Path, StringComparer.Ordinal)
                .ThenBy(location => location.Range.Start.Line)
                .ThenBy(location => location.Range.Start.Character)
                .ToArray();

            return Payload(distinct, "GetReferencesAsync");
        });
    }

    public async Task<byte[]> GetRenameInfoAsync(string code, string positionRequestString)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var symbol = await FindSymbolAsync(document, positionRequestString);
            if (symbol == null || IsReservedSymbol(symbol))
            {
                return Payload(new RenameInfo(false, null, null, "This C# token cannot be renamed."), "GetRenameInfoAsync");
            }

            var tokenRange = await GetIdentifierRangeAtRequestAsync(document, positionRequestString);
            return Payload(new RenameInfo(true, tokenRange, symbol.Name, null), "GetRenameInfoAsync");
        });
    }

    public async Task<byte[]> GetRenameEditsAsync(string code, string positionRequestString, string newName)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var sanitizedName = newName.Trim();
            var rawIdentifier = sanitizedName.StartsWith("@", StringComparison.Ordinal) ? sanitizedName[1..] : sanitizedName;
            if (string.IsNullOrWhiteSpace(rawIdentifier) || !SyntaxFacts.IsValidIdentifier(rawIdentifier))
            {
                return Payload(new { edits = Array.Empty<MonacoTextEdit>(), rejectReason = "Enter a valid C# identifier." }, "GetRenameEditsAsync");
            }

            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var symbol = await FindSymbolAsync(document, positionRequestString);
            if (symbol == null || IsReservedSymbol(symbol))
            {
                return Payload(new { edits = Array.Empty<MonacoTextEdit>(), rejectReason = "This C# token cannot be renamed." }, "GetRenameEditsAsync");
            }

            var solution = document.Project.Solution;
            var edits = new List<MonacoTextEdit>();

            foreach (var declaration in symbol.Locations.Where(location => location.IsInSource))
            {
                var edit = ToRenameEdit(declaration, document, sanitizedName);
                if (edit != null)
                {
                    edits.Add(edit);
                }
            }

            foreach (var referencedSymbol in await SymbolFinder.FindReferencesAsync(symbol, solution))
            {
                foreach (var reference in referencedSymbol.Locations)
                {
                    if (!reference.Location.IsInSource)
                    {
                        continue;
                    }

                    var edit = ToRenameEdit(reference.Location, document, sanitizedName);
                    if (edit != null)
                    {
                        edits.Add(edit);
                    }
                }
            }

            var distinct = edits
                .GroupBy(edit => (
                    edit.Path,
                    edit.Range.Start.Line,
                    edit.Range.Start.Character,
                    edit.Range.End.Line,
                    edit.Range.End.Character))
                .Select(group => group.First())
                .OrderBy(edit => edit.Path, StringComparer.Ordinal)
                .ThenByDescending(edit => edit.Range.Start.Line)
                .ThenByDescending(edit => edit.Range.Start.Character)
                .ToArray();

            return Payload(new { edits = distinct, rejectReason = (string?)null }, "GetRenameEditsAsync");
        });
    }

    public async Task<byte[]> GetDocumentSymbolsAsync(string code)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var symbols = await BuildDocumentSymbolsAsync(document);
            return Payload(symbols, "GetDocumentSymbolsAsync");
        });
    }

    public async Task<byte[]> GetFormattingAsync(string code)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var formattedDocument = await Formatter.FormatAsync(document);
            var text = await formattedDocument.GetTextAsync();
            return Payload(text.ToString(), "GetFormattingAsync");
        });
    }

    public async Task<byte[]> GetRangeFormattingAsync(string code, string rangeRequestString)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var text = await document.GetTextAsync();
            var range = DeserializeRequest<RangeRequest>(rangeRequestString);
            var span = ToTextSpan(text, range);
            var formattedDocument = await Formatter.FormatAsync(document, span);
            var formattedText = await formattedDocument.GetTextAsync();
            return Payload(formattedText.ToString(), "GetRangeFormattingAsync");
        });
    }

    public async Task<byte[]> GetCodeActionsAsync(string code, string rangeRequestString)
    {
        return await GetCodeActionsAsync(code, rangeRequestString, string.Empty);
    }

    public async Task<byte[]> GetCodeActionsAsync(string code, string rangeRequestString, string diagnosticRequestString)
    {
        return await RunDiagnosticAsync(async () =>
        {
            try
            {
                var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
                var text = await document.GetTextAsync();
                var source = text.ToString();
                var actions = new List<CodeActionDto>();
                var range = DeserializeRequest<RangeRequest>(rangeRequestString);
                var requestSpan = ToTextSpan(text, range);
                var diagnostics = await GetCompilerDiagnosticsAsync(document);

                foreach (var diagnostic in diagnostics.Where(d => d.Location.SourceSpan.IntersectsWith(requestSpan) || requestSpan.Length == 0))
                {
                    var missingName = TryGetMissingSymbolName(diagnostic);
                    if (string.IsNullOrWhiteSpace(missingName))
                    {
                        continue;
                    }

                    var namespaceName = await FindNamespaceForMissingSymbolAsync(document.Project, missingName);
                    if (string.IsNullOrWhiteSpace(namespaceName) || HasUsing(source, namespaceName))
                    {
                        continue;
                    }

                    actions.Add(new CodeActionDto(
                        $"Add using {namespaceName}",
                        "quickfix",
                        new[] { new MonacoTextEdit(new TextRange(new PositionDto(0, 0), new PositionDto(0, 0)), $"using {namespaceName};\n") },
                        true));
                }

                var organized = OrganizeUsings(source);
                if (!string.Equals(organized, source, StringComparison.Ordinal))
                {
                    actions.Add(new CodeActionDto(
                        "Organize C# usings",
                        "source.organizeImports",
                        new[] { new MonacoTextEdit(ToRange(text, TextSpan.FromBounds(0, text.Length)), organized) },
                        false));
                }

                await AddRoslynCodeActionsAsync(document, requestSpan, diagnostics, actions);

                return Payload(actions
                    .GroupBy(action => action.Title)
                    .Select(group => group.First())
                    .ToArray(), "GetCodeActionsAsync");
            }
            catch (Exception e)
            {
                Console.WriteLine($"GetCodeActionsAsync failed: {e}");
                return Payload(Array.Empty<CodeActionDto>(), "GetCodeActionsAsync");
            }
        });
    }

    public async Task<byte[]> GetInlayHintsAsync(string code, string rangeRequestString)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var text = await document.GetTextAsync();
            var range = DeserializeRequest<RangeRequest>(rangeRequestString);
            var span = ToTextSpan(text, range);
            var hints = await BuildInlayHintsAsync(document, span);
            return Payload(hints, "GetInlayHintsAsync");
        });
    }

    public async Task<byte[]> GetFoldingRangesAsync(string code)
    {
        return await RunDiagnosticAsync(async () =>
        {
            var document = await UpdateDocumentAsync(_diagnosticProject, code);
            var text = await document.GetTextAsync();
            var root = await document.GetSyntaxRootAsync();
            if (root == null)
            {
                return Payload(Array.Empty<FoldingRangeDto>(), "GetFoldingRangesAsync");
            }

            var ranges = root.DescendantNodesAndSelf()
                .Select(node => ToFoldingRange(text, node))
                .Where(range => range != null)
                .Cast<FoldingRangeDto>()
                .GroupBy(range => $"{range.Start}:{range.End}:{range.Kind}")
                .Select(group => group.First())
                .OrderBy(range => range.Start)
                .ThenBy(range => range.End)
                .ToArray();

            return Payload(ranges, "GetFoldingRangesAsync");
        });
    }

    public async Task<byte[]> IncludeNamespaceAsync(string namespaceName)
    {
        CancelCompletionProjectWarmUp();
        SignalInteractiveRequest();
        await _completionGate.WaitAsync();
        CancelCompletionProjectWarmUp();
        await _speculativeCompletionGate.WaitAsync();
        await _diagnosticGate.WaitAsync();
        try
        {
            var completionResult = await _completionProject.IncludeNamespaceAsync(namespaceName);
            var speculativeCompletionResult = await _speculativeCompletionProject.IncludeNamespaceAsync(namespaceName);
            var diagnosticResult = await _diagnosticProject.IncludeNamespaceAsync(namespaceName);

            var response = new
            {
                namespaceName = completionResult.NamespaceName,
                success = completionResult.Success || speculativeCompletionResult.Success || diagnosticResult.Success,
                addedAssemblies = completionResult.AddedAssemblies
                    .Concat(speculativeCompletionResult.AddedAssemblies)
                    .Concat(diagnosticResult.AddedAssemblies)
                    .Distinct(StringComparer.Ordinal)
                    .ToArray(),
                matchedAssemblies = completionResult.MatchedAssemblies
                    .Concat(speculativeCompletionResult.MatchedAssemblies)
                    .Concat(diagnosticResult.MatchedAssemblies)
                    .Distinct(StringComparer.Ordinal)
                    .ToArray(),
                message = completionResult.AddedAssemblies.Count > 0
                    ? completionResult.Message
                    : diagnosticResult.Message
            };

            var payload = Payload(response, "IncludeNamespaceAsync");
            ScheduleCurrentCompletionProjectWarmUp();
            return payload;
        }
        finally
        {
            _diagnosticGate.Release();
            _speculativeCompletionGate.Release();
            _completionGate.Release();
        }
    }

    async Task<byte[]> RunCompletionAsync(Func<Task<byte[]>> action)
    {
        SignalInteractiveRequest();
        await _completionGate.WaitAsync();
        try
        {
            // Close the race where the prior gate owner schedules an idle warm after this
            // request's pre-gate cancellation but before this request acquires the gate.
            CancelCompletionProjectWarmUp();
            return await action();
        }
        finally
        {
            _completionGate.Release();
        }
    }

    void ScheduleCurrentCompletionProjectWarmUp()
    {
        var projectRevision = _completionProjectRevision;
        if (!string.IsNullOrWhiteSpace(projectRevision))
        {
            ScheduleCompletionProjectWarmUp(projectRevision);
        }
    }

    void ScheduleCompletionProjectWarmUp(string projectRevision)
    {
        // Browser WASM is single-threaded. Once Roslyn starts a CPU-heavy project warm,
        // the worker cannot even receive the keystroke that would cancel it. Provider and
        // framework caches are warmed before readiness; project compilation stays strictly
        // demand-driven so optional work can never sit ahead of an interactive request.
    }

    void CancelCompletionProjectWarmUp()
    {
        // See ScheduleCompletionProjectWarmUp. Kept as a no-op at call sites so request
        // ordering remains explicit if a truly preemptible worker is introduced later.
    }

    async Task<byte[]> RunSpeculativeCompletionAsync(
        string responseType,
        Func<byte[]> cancelledResponse,
        Func<Func<bool>, Task<byte[]>> action)
    {
        var acceptedInteractiveEpoch = Volatile.Read(ref _interactiveRequestEpoch);
        _completionProject.RequestInteractivePriority();
        await _speculativeCompletionGate.WaitAsync();
        try
        {
            bool InteractiveSuperseded() =>
                acceptedInteractiveEpoch != Volatile.Read(ref _interactiveRequestEpoch);
            // A normal completion/diagnostic accepted after this speculative call was
            // queued wins permanently. Do not enter Handle(), which would create a fresh
            // CTS and accidentally resurrect the already-cancelled Roslyn preload.
            if (InteractiveSuperseded())
            {
                return cancelledResponse();
            }
            return await action(InteractiveSuperseded);
        }
        finally
        {
            _speculativeCompletionGate.Release();
        }
    }

    byte[] SpeculativeCancellationPayload(
        string responseType,
        CompletionTextSyncAck? synchronization = null)
    {
        if (responseType.Equals("GetSpeculativeCompletionAsync", StringComparison.Ordinal))
        {
            synchronization ??= new CompletionTextSyncAck(
                false,
                false,
                _speculativeCompletionProject.PrimaryDocumentVersion,
                _speculativeCompletionProject.PrimaryDocumentTextLength,
                _speculativeProjectRevision,
                "Speculative completion was superseded by interactive authoring work.");
            return Payload(
                new SynchronizedCompletionResponse(synchronization, null, true),
                responseType);
        }

        return Payload(new SpeculativeCancellationResponse(true), responseType);
    }

    async Task<byte[]> RunDiagnosticAsync(Func<Task<byte[]>> action)
    {
        SignalInteractiveRequest();
        await _diagnosticGate.WaitAsync();
        try
        {
            return await action();
        }
        finally
        {
            _diagnosticGate.Release();
        }
    }

    async Task<byte[]> RunBackgroundDiagnosticAsync(
        string responseType,
        Func<CancellationToken, Task<byte[]>> action)
    {
        var acceptedInteractiveEpoch = Volatile.Read(ref _interactiveRequestEpoch);
        await _diagnosticGate.WaitAsync();
        if (acceptedInteractiveEpoch != Volatile.Read(ref _interactiveRequestEpoch))
        {
            _diagnosticGate.Release();
            return Payload(new BackgroundDiagnosticCancellationResponse(true), responseType);
        }

        var cancellation = new CancellationTokenSource();
        Interlocked.Exchange(ref _backgroundDiagnosticCancellation, cancellation)?.Dispose();
        try
        {
            return await action(cancellation.Token);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            return Payload(new BackgroundDiagnosticCancellationResponse(true), responseType);
        }
        finally
        {
            Interlocked.CompareExchange(
                ref _backgroundDiagnosticCancellation,
                null,
                cancellation);
            cancellation.Dispose();
            _diagnosticGate.Release();
        }
    }

    void SignalInteractiveRequest()
    {
        Interlocked.Increment(ref _interactiveRequestEpoch);
        _completionProject.RequestInteractivePriority();
        _speculativeCompletionService?.CancelPendingRequest();
        try
        {
            Volatile.Read(ref _backgroundDiagnosticCancellation)?.Cancel();
        }
        catch (ObjectDisposedException)
        {
            // The diagnostic continuation may have completed on this synchronization context.
        }
    }

    async Task<CompletionTextSyncApplication> ApplyCompletionTextSyncAsync(
        OmniSharpProject project,
        CompletionTextSyncRequest request,
        string code,
        string projectRequestString,
        string currentProjectRevision,
        string label)
    {
        CompletionTextSyncApplication Failure(string message, bool requiresFullSync = true)
        {
            return new CompletionTextSyncApplication(
                new CompletionTextSyncAck(
                    false,
                    requiresFullSync,
                    project.PrimaryDocumentVersion,
                    project.PrimaryDocumentTextLength,
                    currentProjectRevision,
                    message),
                null);
        }

        if (string.IsNullOrWhiteSpace(request.ProjectRevision))
        {
            return Failure("A project revision is required for synchronized completion.", false);
        }

        if (request.ExpectedNewTextLength < 0)
        {
            return Failure("The synchronized completion target length is invalid.", false);
        }

        if (request.FullSync)
        {
            if (code.Length != request.ExpectedNewTextLength)
            {
                return Failure(
                    $"The full {label} text length did not match its synchronization request.",
                    false);
            }

            Document document;
            if (!string.IsNullOrWhiteSpace(projectRequestString))
            {
                document = await UpdateCompletionDocumentAsync(
                    project,
                    code,
                    projectRequestString,
                    label);
            }
            else
            {
                if (!string.Equals(
                        currentProjectRevision,
                        request.ProjectRevision,
                        StringComparison.Ordinal))
                {
                    return Failure(
                        $"The {label} project revision changed; resend the full project snapshot.");
                }

                document = await project.UpdateDocumentAsync(code);
                await project.EnsureReferencesForDocumentAsync(document, scanAll: true);
                document = project.Workspace.CurrentSolution.GetDocument(project.DocumentId)
                    ?? throw new InvalidOperationException($"The {label} document disappeared after reference promotion.");
            }

            return new CompletionTextSyncApplication(
                new CompletionTextSyncAck(
                    true,
                    false,
                    project.PrimaryDocumentVersion,
                    project.PrimaryDocumentTextLength,
                    request.ProjectRevision,
                    null),
                document);
        }

        if (!string.IsNullOrEmpty(code) || !string.IsNullOrWhiteSpace(projectRequestString))
        {
            return Failure(
                $"Incremental {label} synchronization must not include full text or a project snapshot.",
                false);
        }

        if (!string.Equals(currentProjectRevision, request.ProjectRevision, StringComparison.Ordinal))
        {
            return Failure($"The {label} project revision changed.");
        }

        if (request.Changes == null)
        {
            return Failure($"Incremental {label} synchronization requires text changes.");
        }

        long proposedLength = request.ExpectedOldTextLength;
        foreach (var change in request.Changes)
        {
            if (change == null || change.NewText == null)
            {
                return Failure($"Incremental {label} synchronization contains a null text change.");
            }

            proposedLength += (long)change.NewText.Length - change.Length;
            if (proposedLength is < 0 or > int.MaxValue)
            {
                return Failure($"Incremental {label} synchronization would create an invalid text length.");
            }
        }

        if (proposedLength != request.ExpectedNewTextLength)
        {
            return Failure($"Incremental {label} synchronization predicted the wrong target length.");
        }

        var update = await project.TryUpdatePrimaryDocumentAsync(
            request.ExpectedVersion,
            request.ExpectedOldTextLength,
            request.Changes);
        if (!update.Success || update.Document == null)
        {
            return new CompletionTextSyncApplication(
                new CompletionTextSyncAck(
                    false,
                    update.RequiresFullSync,
                    update.Version,
                    update.TextLength,
                    currentProjectRevision,
                    update.Message),
                null);
        }

        if (update.TextLength != request.ExpectedNewTextLength)
        {
            throw new InvalidOperationException(
                $"Incremental {label} synchronization produced an unexpected text length.");
        }

        await project.EnsureReferencesForDocumentAsync(update.Document);
        var synchronizedDocument = project.Workspace.CurrentSolution.GetDocument(project.DocumentId)
            ?? throw new InvalidOperationException($"The {label} document disappeared after reference promotion.");

        return new CompletionTextSyncApplication(
            new CompletionTextSyncAck(
                true,
                false,
                update.Version,
                update.TextLength,
                request.ProjectRevision,
                null),
            synchronizedDocument);
    }

    async Task<Document> UpdateDocumentAsync(OmniSharpProject project, string code)
    {
        var document = await project.UpdateDocumentAsync(code);
        await project.EnsureReferencesForDocumentAsync(document);
        return project.Workspace.CurrentSolution.GetDocument(project.DocumentId)
            ?? throw new InvalidOperationException("The OmniSharp document disappeared after reference promotion.");
    }

    Task<Document> UpdateCompletionDocumentAsync(string code, string projectRequestString)
    {
        return UpdateCompletionDocumentAsync(_completionProject, code, projectRequestString, "completion");
    }

    Task<Document> UpdateSpeculativeCompletionDocumentAsync(string code, string projectRequestString)
    {
        return UpdateCompletionDocumentAsync(_speculativeCompletionProject, code, projectRequestString, "speculative completion");
    }

    async Task<Document> UpdateCompletionDocumentAsync(OmniSharpProject project, string code, string projectRequestString, string label)
    {
        if (string.IsNullOrWhiteSpace(projectRequestString))
        {
            return await UpdateDocumentAsync(project, code);
        }

        try
        {
            var request = DeserializeRequest<DiagnosticProjectRequest>(projectRequestString);
            var files = (request.Files ?? Array.Empty<DiagnosticProjectFileDto>())
                .Where(file => !string.IsNullOrWhiteSpace(file.Path))
                .Select(file => new OmniSharpProject.SourceFileSnapshot(file.Path, file.Content ?? string.Empty))
                .ToArray();
            var document = await project.UpdateProjectDocumentsAsync(code, request.CurrentPath, files);
            await project.EnsureReferencesForProjectAsync(document.Project);
            return project.Workspace.CurrentSolution.GetDocument(project.DocumentId)
                ?? throw new InvalidOperationException($"The {label} document disappeared after reference promotion.");
        }
        catch (Exception e)
        {
            throw new InvalidOperationException($"Could not apply the {label} project snapshot.", e);
        }
    }

    async Task<Document> UpdateDiagnosticDocumentAsync(string code, string diagnosticRequestString)
    {
        if (string.IsNullOrWhiteSpace(diagnosticRequestString))
        {
            return await UpdateDocumentAsync(_diagnosticProject, code);
        }

        try
        {
            var request = DeserializeRequest<DiagnosticProjectRequest>(diagnosticRequestString);
            var files = (request.Files ?? Array.Empty<DiagnosticProjectFileDto>())
                .Where(file => !string.IsNullOrWhiteSpace(file.Path))
                .Select(file => new OmniSharpProject.SourceFileSnapshot(file.Path, file.Content ?? string.Empty))
                .ToArray();
            var document = await _diagnosticProject.UpdateProjectDocumentsAsync(
                code,
                request.CurrentPath,
                files);
            await _diagnosticProject.EnsureReferencesForProjectAsync(document.Project);
            return _diagnosticProject.Workspace.CurrentSolution.GetDocument(_diagnosticProject.DocumentId)
                ?? throw new InvalidOperationException(
                    "The diagnostic document disappeared after reference promotion.");
        }
        catch (Exception e)
        {
            throw new InvalidOperationException("Could not apply the diagnostic project snapshot.", e);
        }
    }

    string? TryReadCurrentPath(string diagnosticRequestString)
    {
        if (string.IsNullOrWhiteSpace(diagnosticRequestString))
        {
            return null;
        }

        try
        {
            var request = DeserializeRequest<DiagnosticProjectRequest>(diagnosticRequestString);
            return NormalizeLocationPath(request.CurrentPath);
        }
        catch
        {
            return null;
        }
    }

    T DeserializeRequest<T>(string requestString)
        where T : class
    {
        return JsonSerializer.Deserialize<T>(requestString, inputJsonOptions)
            ?? throw new JsonException($"Could not deserialize {typeof(T).Name}.");
    }

    async Task<ISymbol?> FindSymbolAsync(Document document, string positionRequestString)
    {
        var request = DeserializeRequest<PositionRequest>(positionRequestString);
        var text = await document.GetTextAsync();
        var position = ToOffset(text, request);
        var semanticModel = await document.GetSemanticModelAsync();
        if (semanticModel == null)
        {
            return null;
        }

        return await SymbolFinder.FindSymbolAtPositionAsync(semanticModel, position, document.Project.Solution.Workspace);
    }

    async Task<TextRange?> GetIdentifierRangeAtRequestAsync(Document document, string positionRequestString)
    {
        var request = DeserializeRequest<PositionRequest>(positionRequestString);
        var text = await document.GetTextAsync();
        var offset = ToOffset(text, request);
        var root = await document.GetSyntaxRootAsync();
        var token = root?.FindToken(Math.Max(0, Math.Min(offset, text.Length)));
        if (token == null || !token.Value.IsKind(SyntaxKind.IdentifierToken))
        {
            return null;
        }

        return ToRange(text, token.Value.Span);
    }

    async Task<List<Microsoft.CodeAnalysis.Diagnostic>> GetCompilerDiagnosticsAsync(Document document)
    {
        var semanticModel = await document.GetSemanticModelAsync();
        if (semanticModel == null)
        {
            return new List<Microsoft.CodeAnalysis.Diagnostic>();
        }

        return semanticModel.GetDiagnostics().ToList();
    }

    async Task AddRoslynCodeActionsAsync(
        Document document,
        TextSpan requestSpan,
        List<Microsoft.CodeAnalysis.Diagnostic> diagnostics,
        List<CodeActionDto> actions)
    {
        var providers = GetCodeActionProviderSet();
        var matchingDiagnostics = diagnostics
            .Where(diagnostic => DiagnosticAppliesToSpan(diagnostic, requestSpan))
            .ToArray();

        foreach (var provider in providers.CodeFixProviders)
        {
            var providerDiagnostics = matchingDiagnostics
                .Where(diagnostic => provider.FixableDiagnosticIds.Contains(diagnostic.Id))
                .ToImmutableArray();

            if (providerDiagnostics.IsDefaultOrEmpty)
            {
                continue;
            }

            var registered = new List<CodeAction>();
            var context = new CodeFixContext(
                document,
                requestSpan,
                providerDiagnostics,
                (action, _) => registered.Add(action),
                CancellationToken.None);

            try
            {
                await provider.RegisterCodeFixesAsync(context);
                await AddConcreteCodeActionsAsync(document, registered, "quickfix", actions);
            }
            catch (Exception e)
            {
                Console.WriteLine($"Code fix provider {provider.GetType().Name} failed: {e.Message}");
            }
        }

        foreach (var provider in providers.RefactoringProviders)
        {
            var registered = new List<CodeAction>();
            var context = new CodeRefactoringContext(
                document,
                requestSpan,
                action => registered.Add(action),
                CancellationToken.None);

            try
            {
                await provider.ComputeRefactoringsAsync(context);
                await AddConcreteCodeActionsAsync(document, registered, "refactor", actions);
            }
            catch (Exception e)
            {
                Console.WriteLine($"Refactoring provider {provider.GetType().Name} failed: {e.Message}");
            }
        }
    }

    async Task AddConcreteCodeActionsAsync(
        Document document,
        IEnumerable<CodeAction> sourceActions,
        string kind,
        List<CodeActionDto> actions)
    {
        foreach (var action in sourceActions.SelectMany(FlattenCodeAction))
        {
            try
            {
                var edits = await GetCodeActionEditsAsync(document, action);
                if (edits.Length == 0)
                {
                    continue;
                }

                actions.Add(new CodeActionDto(action.Title, kind, edits, false));
            }
            catch (Exception e)
            {
                Console.WriteLine($"Code action {action.Title} failed: {e.Message}");
            }
        }
    }

    async Task<MonacoTextEdit[]> GetCodeActionEditsAsync(Document document, CodeAction action)
    {
        var operations = await action.GetOperationsAsync(CancellationToken.None);
        var applyChanges = operations.OfType<ApplyChangesOperation>().FirstOrDefault();
        if (applyChanges == null)
        {
            return Array.Empty<MonacoTextEdit>();
        }

        return await ToMonacoTextEditsAsync(document, applyChanges.ChangedSolution);
    }

    async Task<MonacoTextEdit[]> ToMonacoTextEditsAsync(Document currentDocument, Solution changedSolution)
    {
        var edits = new List<MonacoTextEdit>();
        var solutionChanges = changedSolution.GetChanges(currentDocument.Project.Solution);

        foreach (var projectChanges in solutionChanges.GetProjectChanges())
        {
            foreach (var documentId in projectChanges.GetChangedDocuments())
            {
                var oldDocument = projectChanges.OldProject.GetDocument(documentId);
                var newDocument = projectChanges.NewProject.GetDocument(documentId);
                if (oldDocument == null || newDocument == null)
                {
                    continue;
                }

                var oldText = await oldDocument.GetTextAsync();
                var changes = await newDocument.GetTextChangesAsync(oldDocument, CancellationToken.None);
                var path = oldDocument.Id == currentDocument.Id ? null : NormalizeLocationPath(oldDocument.FilePath);
                edits.AddRange(changes.Select(change => new MonacoTextEdit(ToRange(oldText, change.Span), change.NewText ?? string.Empty, path)));
            }

            foreach (var documentId in projectChanges.GetAddedDocuments())
            {
                var newDocument = projectChanges.NewProject.GetDocument(documentId);
                if (newDocument == null)
                {
                    continue;
                }

                var newText = await newDocument.GetTextAsync();
                var path = NormalizeLocationPath(newDocument.FilePath);
                if (!string.IsNullOrWhiteSpace(path))
                {
                    edits.Add(new MonacoTextEdit(
                        new TextRange(new PositionDto(0, 0), new PositionDto(0, 0)),
                        newText.ToString(),
                        path));
                }
            }
        }

        return edits
            .GroupBy(edit => $"{edit.Path}:{edit.Range.Start.Line}:{edit.Range.Start.Character}:{edit.Range.End.Line}:{edit.Range.End.Character}:{edit.Text}")
            .Select(group => group.First())
            .ToArray();
    }

    IEnumerable<CodeAction> FlattenCodeAction(CodeAction action)
    {
        if (!action.NestedActions.IsDefaultOrEmpty)
        {
            foreach (var nested in action.NestedActions.SelectMany(FlattenCodeAction))
            {
                yield return nested;
            }
            yield break;
        }

        yield return action;
    }

    static bool DiagnosticAppliesToSpan(Microsoft.CodeAnalysis.Diagnostic diagnostic, TextSpan span)
    {
        return span.Length == 0
            || diagnostic.Location == Location.None
            || diagnostic.Location.SourceTree == null
            || diagnostic.Location.SourceSpan.IntersectsWith(span);
    }

    CodeActionProviderSet GetCodeActionProviderSet()
    {
        if (_codeActionProviderSet != null)
        {
            return _codeActionProviderSet;
        }

        try
        {
            var assemblies = MefHostServices.DefaultAssemblies
                .Concat(new[]
                {
                    typeof(CodeAction).Assembly,
                    typeof(CodeFixProvider).Assembly,
                    Assembly.Load("Microsoft.CodeAnalysis.Features"),
                    Assembly.Load("Microsoft.CodeAnalysis.CSharp.Features")
                })
                .Distinct()
                .ToArray();
            var container = new ContainerConfiguration()
                .WithAssemblies(assemblies)
                .CreateContainer();
            _codeActionProviderSet = new CodeActionProviderSet(
                container.GetExports<CodeFixProvider>().ToArray(),
                container.GetExports<CodeRefactoringProvider>().ToArray(),
                container);
        }
        catch (Exception e)
        {
            Console.WriteLine($"Could not initialize Roslyn code action providers: {e.Message}");
            _codeActionProviderSet = new CodeActionProviderSet(Array.Empty<CodeFixProvider>(), Array.Empty<CodeRefactoringProvider>(), null);
        }

        return _codeActionProviderSet;
    }

    async Task<SemanticTokenDto[]> BuildSemanticTokensAsync(Document document)
    {
        var text = await document.GetTextAsync();
        var root = await document.GetSyntaxRootAsync();
        var semanticModel = await document.GetSemanticModelAsync();
        if (root == null || semanticModel == null)
        {
            return Array.Empty<SemanticTokenDto>();
        }

        var tokens = new List<SemanticTokenDto>();

        foreach (var token in root.DescendantTokens(descendIntoTrivia: false))
        {
            if (token.Span.Length <= 0)
            {
                continue;
            }

            if (token.IsKind(SyntaxKind.IdentifierToken))
            {
                var symbol = GetSymbolForToken(semanticModel, token);
                var tokenType = SemanticTokenTypeForSymbol(symbol, token);
                var modifiers = SemanticTokenModifiersForSymbol(symbol, token).ToArray();
                tokens.Add(ToSemanticToken(text, token.Span, tokenType, modifiers));
            }
            else if (CSharpKeywords.Contains(token.Text))
            {
                var tokenType = ControlKeywords.Contains(token.Text) ? "csharpControlKeyword" : "csharpKeyword";
                tokens.Add(ToSemanticToken(text, token.Span, tokenType, Array.Empty<string>()));
            }
        }

        foreach (var trivia in root.DescendantTrivia(descendIntoTrivia: true))
        {
            if (trivia.IsDirective && trivia.Span.Length > 0)
            {
                tokens.Add(ToSemanticToken(text, trivia.Span, "csharpPreprocessor", Array.Empty<string>()));
            }
        }

        return tokens
            .Where(token => token.Length > 0)
            .GroupBy(token => $"{token.StartLine}:{token.StartColumn}:{token.Length}")
            .Select(group => group.First())
            .OrderBy(token => token.StartLine)
            .ThenBy(token => token.StartColumn)
            .ToArray();
    }

    async Task<DocumentSymbolDto[]> BuildDocumentSymbolsAsync(Document document)
    {
        var text = await document.GetTextAsync();
        var root = await document.GetSyntaxRootAsync();
        if (root == null)
        {
            return Array.Empty<DocumentSymbolDto>();
        }

        return BuildChildDocumentSymbols(text, root).ToArray();
    }

    List<DocumentSymbolDto> BuildChildDocumentSymbols(SourceText text, SyntaxNode node)
    {
        var symbols = new List<DocumentSymbolDto>();
        foreach (var child in node.ChildNodes())
        {
            var symbol = TryCreateDocumentSymbol(text, child);
            if (symbol != null)
            {
                symbols.Add(symbol with { Children = BuildChildDocumentSymbols(text, child).ToArray() });
            }
            else
            {
                symbols.AddRange(BuildChildDocumentSymbols(text, child));
            }
        }
        return symbols;
    }

    async Task<InlayHintDto[]> BuildInlayHintsAsync(Document document, TextSpan range)
    {
        var text = await document.GetTextAsync();
        var root = await document.GetSyntaxRootAsync();
        var semanticModel = await document.GetSemanticModelAsync();
        if (root == null || semanticModel == null)
        {
            return Array.Empty<InlayHintDto>();
        }

        var hints = new List<InlayHintDto>();

        foreach (var declaration in root.DescendantNodes().OfType<VariableDeclarationSyntax>())
        {
            if (!declaration.Type.IsVar)
            {
                continue;
            }

            foreach (var variable in declaration.Variables)
            {
                if (variable.Initializer?.Value == null || !range.IntersectsWith(variable.Span))
                {
                    continue;
                }

                var type = semanticModel.GetTypeInfo(variable.Initializer.Value).ConvertedType;
                if (type == null || type.TypeKind == TypeKind.Error)
                {
                    continue;
                }

                hints.Add(new InlayHintDto(
                    "type",
                    $": {type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)}",
                    ToPosition(text, variable.Identifier.Span.End),
                    true,
                    false));
            }
        }

        foreach (var invocation in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            var method = semanticModel.GetSymbolInfo(invocation).Symbol as IMethodSymbol;
            AddParameterHints(text, range, hints, invocation.ArgumentList.Arguments, method?.Parameters);
        }

        foreach (var creation in root.DescendantNodes().OfType<ObjectCreationExpressionSyntax>())
        {
            var method = semanticModel.GetSymbolInfo(creation).Symbol as IMethodSymbol;
            AddParameterHints(text, range, hints, creation.ArgumentList?.Arguments, method?.Parameters);
        }

        return hints
            .GroupBy(hint => $"{hint.Position.Line}:{hint.Position.Character}:{hint.Label}")
            .Select(group => group.First())
            .OrderBy(hint => hint.Position.Line)
            .ThenBy(hint => hint.Position.Character)
            .ToArray();
    }

    void AddParameterHints(
        SourceText text,
        TextSpan range,
        List<InlayHintDto> hints,
        SeparatedSyntaxList<ArgumentSyntax>? arguments,
        IReadOnlyList<IParameterSymbol>? parameters)
    {
        if (arguments == null || parameters == null || parameters.Count == 0)
        {
            return;
        }

        for (var i = 0; i < Math.Min(arguments.Value.Count, parameters.Count); i++)
        {
            var argument = arguments.Value[i];
            if (argument.NameColon != null || !range.IntersectsWith(argument.Span))
            {
                continue;
            }

            var parameter = parameters[i];
            if (string.IsNullOrWhiteSpace(parameter.Name))
            {
                continue;
            }

            hints.Add(new InlayHintDto(
                "parameter",
                $"{parameter.Name}:",
                ToPosition(text, argument.SpanStart),
                false,
                true));
        }
    }

    ISymbol? GetSymbolForToken(SemanticModel semanticModel, SyntaxToken token)
    {
        return token.Parent switch
        {
            BaseNamespaceDeclarationSyntax node when NodeOwnsIdentifier(node.Name, token) => semanticModel.GetDeclaredSymbol(node),
            TypeDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            EnumDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            DelegateDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            EnumMemberDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            MethodDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            ConstructorDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            DestructorDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            PropertyDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            EventDeclarationSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            VariableDeclaratorSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            ParameterSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            TypeParameterSyntax node when node.Identifier == token => semanticModel.GetDeclaredSymbol(node),
            IdentifierNameSyntax node => semanticModel.GetSymbolInfo(node).Symbol ?? semanticModel.GetSymbolInfo(node).CandidateSymbols.FirstOrDefault(),
            GenericNameSyntax node => semanticModel.GetSymbolInfo(node).Symbol ?? semanticModel.GetSymbolInfo(node).CandidateSymbols.FirstOrDefault(),
            _ => null
        };
    }

    static bool NodeOwnsIdentifier(NameSyntax name, SyntaxToken token)
    {
        return name.Span.Contains(token.SpanStart);
    }

    string SemanticTokenTypeForSymbol(ISymbol? symbol, SyntaxToken token)
    {
        if (symbol == null)
        {
            if (char.IsUpper(token.Text.TrimStart('@').FirstOrDefault()))
            {
                return "csharpClass";
            }
            return "csharpLocal";
        }

        return symbol switch
        {
            INamespaceSymbol => "csharpNamespace",
            INamedTypeSymbol type => type.TypeKind switch
            {
                TypeKind.Class when type.IsRecord => "csharpRecord",
                TypeKind.Class => "csharpClass",
                TypeKind.Struct when type.IsRecord => "csharpRecord",
                TypeKind.Struct => "csharpStruct",
                TypeKind.Interface => "csharpInterface",
                TypeKind.Enum => "csharpEnum",
                TypeKind.Delegate => "csharpDelegate",
                _ => "csharpClass"
            },
            ITypeParameterSymbol => "csharpTypeParameter",
            IMethodSymbol method => method.MethodKind == MethodKind.Constructor || method.MethodKind == MethodKind.StaticConstructor
                ? "csharpConstructor"
                : method.IsExtensionMethod || method.ReducedFrom != null
                    ? "csharpExtensionMethod"
                    : "csharpMethod",
            IPropertySymbol => "csharpProperty",
            IFieldSymbol field => field.ContainingType?.TypeKind == TypeKind.Enum
                ? "csharpEnumMember"
                : field.IsConst
                    ? "csharpConstant"
                    : "csharpField",
            IEventSymbol => "csharpEvent",
            IParameterSymbol => "csharpParameter",
            ILocalSymbol local => local.IsConst ? "csharpConstant" : "csharpLocal",
            ILabelSymbol => "csharpLabel",
            _ => "csharpLocal"
        };
    }

    IEnumerable<string> SemanticTokenModifiersForSymbol(ISymbol? symbol, SyntaxToken token)
    {
        var modifiers = new List<string>();

        if (IsDeclarationToken(token))
        {
            modifiers.Add("declaration");
        }

        if (symbol != null)
        {
            if (symbol.IsStatic) modifiers.Add("static");
            if (symbol.IsAbstract) modifiers.Add("abstract");
            if (symbol.IsVirtual) modifiers.Add("virtual");
            if (symbol.IsOverride) modifiers.Add("override");
            if (!symbol.Locations.Any(location => location.IsInSource)) modifiers.Add("defaultLibrary");
            if (symbol.GetAttributes().Any(attribute => attribute.AttributeClass?.ToDisplayString() == "System.ObsoleteAttribute")) modifiers.Add("obsolete");
        }

        if (symbol is IMethodSymbol method)
        {
            if (method.IsAsync) modifiers.Add("async");
            if (method.IsExtensionMethod || method.ReducedFrom != null) modifiers.Add("extension");
        }

        if (symbol is IFieldSymbol field && (field.IsReadOnly || field.IsConst))
        {
            modifiers.Add("readonly");
        }

        return modifiers.Distinct(StringComparer.Ordinal);
    }

    static bool IsDeclarationToken(SyntaxToken token)
    {
        return token.Parent switch
        {
            TypeDeclarationSyntax node when node.Identifier == token => true,
            EnumDeclarationSyntax node when node.Identifier == token => true,
            DelegateDeclarationSyntax node when node.Identifier == token => true,
            EnumMemberDeclarationSyntax node when node.Identifier == token => true,
            MethodDeclarationSyntax node when node.Identifier == token => true,
            ConstructorDeclarationSyntax node when node.Identifier == token => true,
            DestructorDeclarationSyntax node when node.Identifier == token => true,
            PropertyDeclarationSyntax node when node.Identifier == token => true,
            EventDeclarationSyntax node when node.Identifier == token => true,
            VariableDeclaratorSyntax node when node.Identifier == token => true,
            ParameterSyntax node when node.Identifier == token => true,
            TypeParameterSyntax node when node.Identifier == token => true,
            _ => false
        };
    }

    DocumentSymbolDto? TryCreateDocumentSymbol(SourceText text, SyntaxNode node)
    {
        return node switch
        {
            BaseNamespaceDeclarationSyntax ns => CreateSymbol(text, ns.Name.ToString(), "", "namespace", ns.Span, ns.Name.Span),
            TypeDeclarationSyntax type => CreateSymbol(text, type.Identifier.Text, "", KindForTypeDeclaration(type), type.Span, type.Identifier.Span),
            EnumDeclarationSyntax en => CreateSymbol(text, en.Identifier.Text, "", "enum", en.Span, en.Identifier.Span),
            DelegateDeclarationSyntax del => CreateSymbol(text, del.Identifier.Text, del.ReturnType.ToString(), "delegate", del.Span, del.Identifier.Span),
            MethodDeclarationSyntax method => CreateSymbol(text, method.Identifier.Text, method.ReturnType.ToString(), "method", method.Span, method.Identifier.Span),
            ConstructorDeclarationSyntax ctor => CreateSymbol(text, ctor.Identifier.Text, "", "constructor", ctor.Span, ctor.Identifier.Span),
            DestructorDeclarationSyntax dtor => CreateSymbol(text, $"~{dtor.Identifier.Text}", "", "method", dtor.Span, dtor.Identifier.Span),
            PropertyDeclarationSyntax property => CreateSymbol(text, property.Identifier.Text, property.Type.ToString(), "property", property.Span, property.Identifier.Span),
            IndexerDeclarationSyntax indexer => CreateSymbol(text, "this[]", indexer.Type.ToString(), "property", indexer.Span, indexer.ThisKeyword.Span),
            EventDeclarationSyntax ev => CreateSymbol(text, ev.Identifier.Text, ev.Type.ToString(), "event", ev.Span, ev.Identifier.Span),
            EnumMemberDeclarationSyntax member => CreateSymbol(text, member.Identifier.Text, "", "enumMember", member.Span, member.Identifier.Span),
            LocalFunctionStatementSyntax localFunction => CreateSymbol(text, localFunction.Identifier.Text, localFunction.ReturnType.ToString(), "method", localFunction.Span, localFunction.Identifier.Span),
            VariableDeclaratorSyntax variable when variable.Parent?.Parent is FieldDeclarationSyntax field
                => CreateSymbol(text, variable.Identifier.Text, field.Declaration.Type.ToString(), "field", variable.Span, variable.Identifier.Span),
            VariableDeclaratorSyntax variable when variable.Parent?.Parent is EventFieldDeclarationSyntax field
                => CreateSymbol(text, variable.Identifier.Text, field.Declaration.Type.ToString(), "event", variable.Span, variable.Identifier.Span),
            _ => null
        };
    }

    static string KindForTypeDeclaration(TypeDeclarationSyntax type)
    {
        return type.Kind() switch
        {
            SyntaxKind.InterfaceDeclaration => "interface",
            SyntaxKind.StructDeclaration => "struct",
            SyntaxKind.RecordDeclaration or SyntaxKind.RecordStructDeclaration => "record",
            _ => "class"
        };
    }

    DocumentSymbolDto CreateSymbol(SourceText text, string name, string detail, string kind, TextSpan range, TextSpan selectionRange)
    {
        return new DocumentSymbolDto(
            name,
            detail,
            kind,
            ToRange(text, range),
            ToRange(text, selectionRange),
            Array.Empty<DocumentSymbolDto>());
    }

    static bool IsReservedSymbol(ISymbol symbol)
    {
        return symbol.Kind == SymbolKind.Namespace || symbol.IsImplicitlyDeclared;
    }

    MonacoLocation? ToLocation(Location location, Document currentDocument, ISymbol? symbol, string? currentPath = null)
    {
        var document = currentDocument.Project.Solution.GetDocument(location.SourceTree);
        if (document == null)
        {
            return null;
        }

        var text = document.GetTextAsync().Result;
        var path = document.Id == currentDocument.Id
            ? NormalizeLocationPath(currentPath)
            : NormalizeLocationPath(document.FilePath);
        return new MonacoLocation(
            ToRange(text, location.SourceSpan),
            path,
            symbol?.Name,
            symbol?.Kind.ToString(),
            symbol?.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat));
    }

    MonacoTextEdit? ToRenameEdit(Location location, Document currentDocument, string newName)
    {
        var document = currentDocument.Project.Solution.GetDocument(location.SourceTree);
        if (document == null)
        {
            return null;
        }

        var text = document.GetTextAsync().Result;
        var path = document.Id == currentDocument.Id
            ? null
            : NormalizeLocationPath(document.FilePath);
        return new MonacoTextEdit(ToRange(text, location.SourceSpan), newName, path);
    }

    async Task<string?> FindNamespaceForMissingSymbolAsync(Project project, string symbolName)
    {
        var symbols = await SymbolFinder.FindDeclarationsAsync(project, symbolName, false, SymbolFilter.TypeAndMember);
        return symbols
            .Select(symbol => symbol.ContainingNamespace)
            .Where(ns => ns != null && !ns.IsGlobalNamespace)
            .Select(ns => ns!.ToDisplayString())
            .FirstOrDefault(ns => !string.IsNullOrWhiteSpace(ns));
    }

    static string? TryGetMissingSymbolName(Microsoft.CodeAnalysis.Diagnostic diagnostic)
    {
        if (diagnostic.Id is not ("CS0246" or "CS0103" or "CS1061" or "CS1929"))
        {
            return null;
        }

        var match = MissingSymbolRegex.Match(diagnostic.GetMessage());
        return match.Success ? match.Groups[1].Value : null;
    }

    static string? NormalizeLocationPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        var parts = path.Replace('\\', '/')
            .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var resolved = new List<string>();

        foreach (var part in parts)
        {
            if (part == ".")
            {
                continue;
            }

            if (part == "..")
            {
                if (resolved.Count > 0)
                {
                    resolved.RemoveAt(resolved.Count - 1);
                }
                continue;
            }

            resolved.Add(part);
        }

        return resolved.Count == 0 ? null : string.Join("/", resolved);
    }

    static bool HasUsing(string source, string namespaceName)
    {
        return Regex.IsMatch(source, $@"^\s*using\s+{Regex.Escape(namespaceName)}\s*;", RegexOptions.Multiline);
    }

    static string OrganizeUsings(string source)
    {
        var newline = source.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
        var lines = source.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None).ToList();
        var leadingUsings = new List<string>();
        var firstNonUsingIndex = 0;

        for (var i = 0; i < lines.Count; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line) && leadingUsings.Count == 0)
            {
                continue;
            }

            if (Regex.IsMatch(line, @"^\s*using\s+[^;]+;\s*$"))
            {
                leadingUsings.Add(line.Trim());
                firstNonUsingIndex = i + 1;
                continue;
            }

            if (!string.IsNullOrWhiteSpace(line))
            {
                firstNonUsingIndex = i;
                break;
            }
        }

        if (leadingUsings.Count <= 1)
        {
            return source;
        }

        var organized = leadingUsings.Distinct(StringComparer.Ordinal).OrderBy(line => line, StringComparer.Ordinal).ToList();
        var rest = lines.Skip(firstNonUsingIndex).SkipWhile(string.IsNullOrWhiteSpace).ToList();
        return string.Join(newline, organized.Concat(new[] { "" }).Concat(rest));
    }

    FoldingRangeDto? ToFoldingRange(SourceText text, SyntaxNode node)
    {
        if (node is CompilationUnitSyntax)
        {
            return null;
        }

        var span = node.Span;
        var lineSpan = text.Lines.GetLinePositionSpan(span);
        var start = lineSpan.Start.Line + 1;
        var end = lineSpan.End.Line + 1;
        if (end <= start)
        {
            return null;
        }

        var kind = node is BaseNamespaceDeclarationSyntax ? "region" : null;
        return new FoldingRangeDto(start, end, kind);
    }

    SemanticTokenDto ToSemanticToken(SourceText text, TextSpan span, string type, string[] modifiers)
    {
        var lineSpan = text.Lines.GetLinePositionSpan(span);
        return new SemanticTokenDto(
            lineSpan.Start.Line,
            lineSpan.Start.Character,
            span.Length,
            type,
            modifiers);
    }

    TextRange ToRange(SourceText text, TextSpan span)
    {
        var lineSpan = text.Lines.GetLinePositionSpan(span);
        return new TextRange(
            new PositionDto(lineSpan.Start.Line, lineSpan.Start.Character),
            new PositionDto(lineSpan.End.Line, lineSpan.End.Character));
    }

    PositionDto ToPosition(SourceText text, int offset)
    {
        var position = text.Lines.GetLinePosition(Math.Max(0, Math.Min(offset, text.Length)));
        return new PositionDto(position.Line, position.Character);
    }

    TextSpan ToTextSpan(SourceText text, RangeRequest? range)
    {
        if (range == null)
        {
            return TextSpan.FromBounds(0, text.Length);
        }

        var start = ToOffset(text, new PositionRequest(range.Start.Line, range.Start.Character));
        var end = ToOffset(text, new PositionRequest(range.End.Line, range.End.Character));
        return TextSpan.FromBounds(Math.Min(start, end), Math.Max(start, end));
    }

    int ToOffset(SourceText text, PositionRequest? request)
    {
        if (request == null || text.Lines.Count == 0)
        {
            return 0;
        }

        var line = Math.Max(0, Math.Min(request.Line, text.Lines.Count - 1));
        var textLine = text.Lines[line];
        var column = Math.Max(0, Math.Min(request.Column, Math.Max(0, textLine.End - textLine.Start)));
        return textLine.Start + column;
    }

    int GetSeverity(DiagnosticSeverity severity)
    {
        return severity switch
        {
            DiagnosticSeverity.Error => 8,
            DiagnosticSeverity.Warning => 4,
            DiagnosticSeverity.Info => 2,
            DiagnosticSeverity.Hidden => 1,
            _ => 1
        };
    }

    DiagnosticDto? ToDiagnosticDto(Microsoft.CodeAnalysis.Diagnostic diagnostic)
    {
        if (!diagnostic.Location.IsInSource)
        {
            return null;
        }

        var lineSpan = diagnostic.Location.GetLineSpan();
        if (!lineSpan.IsValid)
        {
            return null;
        }

        return new DiagnosticDto()
        {
            Start = lineSpan.StartLinePosition,
            End = lineSpan.EndLinePosition,
            Message = diagnostic.GetMessage(),
            Severity = GetSeverity(diagnostic.Severity),
            Id = diagnostic.Id
        };
    }

    byte[] Payload(object? payload, string type)
    {
        return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(
            new ResponsePayload(payload, type, GetResponseMetadataVersion(type)),
            jsonOptions));
    }

    int GetResponseMetadataVersion(string responseType)
    {
        if (responseType.Equals("IncludeNamespaceAsync", StringComparison.Ordinal))
        {
            return Math.Min(
                _completionProject.AppliedMetadataVersion,
                Math.Min(
                    _speculativeCompletionProject.AppliedMetadataVersion,
                    _diagnosticProject.AppliedMetadataVersion));
        }

        if (responseType.StartsWith("GetSpeculativeCompletion", StringComparison.Ordinal))
        {
            return _speculativeCompletionProject.AppliedMetadataVersion;
        }

        if (responseType.StartsWith("GetCompletion", StringComparison.Ordinal) ||
            responseType.Equals("SyncCompletionProjectAsync", StringComparison.Ordinal) ||
            responseType.Equals("WarmUpCurrentCompletionProjectAsync", StringComparison.Ordinal) ||
            responseType.Equals("GetSignatureHelpAsync", StringComparison.Ordinal) ||
            responseType.StartsWith("BeginMetadataHydrationAsync", StringComparison.Ordinal) ||
            responseType.StartsWith("GetMetadataStateAsync", StringComparison.Ordinal))
        {
            return _completionProject.AppliedMetadataVersion;
        }

        return _diagnosticProject.AppliedMetadataVersion;
    }

    #endregion
}
