using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Formatting;
using Microsoft.CodeAnalysis.Text;
using OmniSharp.Models;
using OmniSharp.Models.SignatureHelp;
using OmniSharp.Models.v1.Completion;
using OmniSharp.Options;

public class MonacoService
{
    #region Fields

    RoslynProject _completionProject = null!;
    RoslynProject _diagnosticProject = null!;
    OmniSharpCompletionService _completionService = null!;
    OmniSharpSignatureHelpService _signatureService = null!;
    OmniSharpQuickInfoProvider _quickInfoProvider = null!;

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
    public record MonacoLocation(TextRange Range, string? Name = null, string? Kind = null, string? Detail = null, string? Path = null);
    public record MonacoTextEdit(TextRange Range, string Text, string? Path = null);
    public record RenameInfo(bool CanRename, TextRange? Range, string? Text, string? RejectReason);
    public record CodeActionDto(string Title, string Kind, MonacoTextEdit[] Edits, bool IsPreferred);
    public record DocumentSymbolDto(string Name, string Detail, string Kind, TextRange Range, TextRange SelectionRange, DocumentSymbolDto[] Children);
    public record SemanticTokenDto(int StartLine, int StartColumn, int Length, string Type, string[] Modifiers);
    public record InlayHintDto(string Kind, string Label, PositionDto Position, bool PaddingLeft, bool PaddingRight);
    public record FoldingRangeDto(int Start, int End, string? Kind);
    internal record ResponsePayload(object? Payload, string? Type);

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

    public async void Init(string uri)
    {
        _completionProject = new RoslynProject(uri);
        await _completionProject.Init();
        _diagnosticProject = new RoslynProject(uri);
        await _diagnosticProject.Init();

        var loggerFactory = LoggerFactory.Create(configure => { });
        var formattingOptions = new OmniSharp.Options.FormattingOptions();

        _completionService = new OmniSharpCompletionService(_completionProject.Workspace, formattingOptions, loggerFactory);
        _signatureService = new OmniSharpSignatureHelpService(_completionProject.Workspace);
        _quickInfoProvider = new OmniSharpQuickInfoProvider(_diagnosticProject.Workspace, formattingOptions, loggerFactory);
    }

    public async Task<byte[]> GetCompletionAsync(string code, string completionRequestString)
    {
        var completionRequest = DeserializeRequest<CompletionRequest>(completionRequestString);
        var document = await UpdateDocumentAsync(_completionProject, code);
        var completionResponse = await _completionService.Handle(completionRequest, document);

        return Payload(completionResponse, "GetCompletionAsync");
    }

    public async Task<byte[]> GetCompletionResolveAsync(string completionResolveRequestString)
    {
        var completionResolveRequest = DeserializeRequest<CompletionResolveRequest>(completionResolveRequestString);
        var document = _completionProject.Workspace.CurrentSolution.GetDocument(_completionProject.DocumentId)!;
        var completionResponse = await _completionService.Handle(completionResolveRequest, document);

        return Payload(completionResponse, "GetCompletionResolveAsync");
    }

    public async Task<byte[]> GetSignatureHelpAsync(string code, string signatureHelpRequestString)
    {
        var signatureHelpRequest = DeserializeRequest<SignatureHelpRequest>(signatureHelpRequestString);
        var document = await UpdateDocumentAsync(_completionProject, code);
        var signatureHelpResponse = await _signatureService.Handle(signatureHelpRequest, document);

        return Payload(signatureHelpResponse, "GetSignatureHelpAsync");
    }

    public async Task<byte[]> GetQuickInfoAsync(string quickInfoRequestString)
    {
        var document = _diagnosticProject.Workspace.CurrentSolution.GetDocument(_diagnosticProject.DocumentId)!;
        var quickInfoRequest = DeserializeRequest<QuickInfoRequest>(quickInfoRequestString);
        var quickInfoResponse = await _quickInfoProvider.Handle(quickInfoRequest, document);

        return Payload(quickInfoResponse, "GetQuickInfoAsync");
    }

    public async Task<byte[]> GetQuickInfoAsync(string code, string quickInfoRequestString, string diagnosticRequestString = "")
    {
        var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
        var quickInfoRequest = DeserializeRequest<QuickInfoRequest>(quickInfoRequestString);
        var quickInfoResponse = await _quickInfoProvider.Handle(quickInfoRequest, document);

        return Payload(quickInfoResponse, "GetQuickInfoAsync");
    }

    public async Task<byte[]> GetDiagnosticsAsync(string code)
    {
        return await GetDiagnosticsAsync(code, string.Empty);
    }

    public async Task<byte[]> GetDiagnosticsAsync(string code, string diagnosticRequestString)
    {
        var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
        var semanticModel = await document.GetSemanticModelAsync();
        if (semanticModel == null)
        {
            return Payload(Array.Empty<DiagnosticDto>(), "GetDiagnosticsAsync");
        }

        var diagnostics = semanticModel
            .GetDiagnostics()
            .Select(ToDiagnosticDto)
            .Where(current => current != null)
            .Cast<DiagnosticDto>()
            .ToList();

        return Payload(diagnostics, "GetDiagnosticsAsync");
    }

    public async Task<byte[]> GetSemanticTokensAsync(string code)
    {
        var document = await UpdateDocumentAsync(_diagnosticProject, code);
        var tokens = await BuildSemanticTokensAsync(document);
        return Payload(tokens, "GetSemanticTokensAsync");
    }

    public async Task<byte[]> GetDefinitionAsync(string code, string positionRequestString, string diagnosticRequestString = "")
    {
        var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
        var symbol = await FindSymbolAsync(document, positionRequestString);
        if (symbol == null)
        {
            return Payload(Array.Empty<MonacoLocation>(), "GetDefinitionAsync");
        }

        var solution = document.Project.Solution;
        var sourceSymbol = await ResolveSourceNavigationSymbolAsync(symbol, solution);
        var locations = sourceSymbol.Locations
            .Where(location => location.IsInSource)
            .Select(location => ToLocation(location, _diagnosticProject, sourceSymbol))
            .Where(location => location != null)
            .Cast<MonacoLocation>()
            .ToArray();

        return Payload(locations, "GetDefinitionAsync");
    }

    public async Task<byte[]> GetReferencesAsync(string code, string positionRequestString, string includeDeclarationString, string diagnosticRequestString = "")
    {
        var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
        var symbol = await FindSymbolAsync(document, positionRequestString);
        if (symbol == null)
        {
            return Payload(Array.Empty<MonacoLocation>(), "GetReferencesAsync");
        }

        var includeDeclaration = bool.TryParse(includeDeclarationString, out var parsed) && parsed;
        var solution = document.Project.Solution;
        var sourceSymbol = await ResolveSourceNavigationSymbolAsync(symbol, solution);
        var references = new List<MonacoLocation>();

        if (includeDeclaration)
        {
            references.AddRange(sourceSymbol.Locations
                .Where(location => location.IsInSource)
                .Select(location => ToLocation(location, _diagnosticProject, sourceSymbol))
                .Where(location => location != null)
                .Cast<MonacoLocation>());
        }

        foreach (var referencedSymbol in await SymbolFinder.FindReferencesAsync(sourceSymbol, solution))
        {
            foreach (var location in referencedSymbol.Locations)
            {
                if (!location.Location.IsInSource)
                {
                    continue;
                }

                var monacoLocation = ToLocation(location.Location, _diagnosticProject, referencedSymbol.Definition);
                if (monacoLocation != null)
                {
                    references.Add(monacoLocation);
                }
            }
        }

        var distinct = references
            .GroupBy(location => $"{location.Path}:{location.Range.Start.Line}:{location.Range.Start.Character}:{location.Range.End.Line}:{location.Range.End.Character}")
            .Select(group => group.First())
            .OrderBy(location => location.Path, StringComparer.Ordinal)
            .ThenBy(location => location.Range.Start.Line)
            .ThenBy(location => location.Range.Start.Character)
            .ToArray();

        return Payload(distinct, "GetReferencesAsync");
    }

    public async Task<byte[]> GetRenameInfoAsync(string code, string positionRequestString, string diagnosticRequestString = "")
    {
        var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
        var symbol = await FindSymbolAsync(document, positionRequestString);
        if (symbol == null || IsReservedSymbol(symbol))
        {
            return Payload(new RenameInfo(false, null, null, "This C# token cannot be renamed."), "GetRenameInfoAsync");
        }

        var tokenRange = await GetIdentifierRangeAtRequestAsync(document, positionRequestString);
        return Payload(new RenameInfo(true, tokenRange, symbol.Name, null), "GetRenameInfoAsync");
    }

    public async Task<byte[]> GetRenameEditsAsync(string code, string positionRequestString, string newName, string diagnosticRequestString = "")
    {
        var sanitizedName = newName.Trim();
        var rawIdentifier = sanitizedName.StartsWith("@", StringComparison.Ordinal) ? sanitizedName[1..] : sanitizedName;
        if (string.IsNullOrWhiteSpace(rawIdentifier) || !SyntaxFacts.IsValidIdentifier(rawIdentifier))
        {
            return Payload(new { edits = Array.Empty<MonacoTextEdit>(), rejectReason = "Enter a valid C# identifier." }, "GetRenameEditsAsync");
        }

        var document = await UpdateDiagnosticDocumentAsync(code, diagnosticRequestString);
        var symbol = await FindSymbolAsync(document, positionRequestString);
        if (symbol == null || IsReservedSymbol(symbol))
        {
            return Payload(new { edits = Array.Empty<MonacoTextEdit>(), rejectReason = "This C# token cannot be renamed." }, "GetRenameEditsAsync");
        }

        var solution = document.Project.Solution;
        var sourceSymbol = await ResolveSourceNavigationSymbolAsync(symbol, solution);
        var edits = new List<MonacoTextEdit>();

        foreach (var declaration in sourceSymbol.Locations.Where(location => location.IsInSource))
        {
            var edit = ToRenameEdit(declaration, _diagnosticProject, sanitizedName);
            if (edit != null)
            {
                edits.Add(edit);
            }
        }

        foreach (var referencedSymbol in await SymbolFinder.FindReferencesAsync(sourceSymbol, solution))
        {
            foreach (var reference in referencedSymbol.Locations)
            {
                if (!reference.Location.IsInSource)
                {
                    continue;
                }

                var edit = ToRenameEdit(reference.Location, _diagnosticProject, sanitizedName);
                if (edit != null)
                {
                    edits.Add(edit);
                }
            }
        }

        var distinct = edits
            .GroupBy(edit => $"{edit.Path}:{edit.Range.Start.Line}:{edit.Range.Start.Character}:{edit.Range.End.Line}:{edit.Range.End.Character}")
            .Select(group => group.First())
            .OrderByDescending(edit => edit.Path, StringComparer.Ordinal)
            .ThenByDescending(edit => edit.Range.Start.Line)
            .ThenByDescending(edit => edit.Range.Start.Character)
            .ToArray();

        return Payload(new { edits = distinct, rejectReason = (string?)null }, "GetRenameEditsAsync");
    }

    public async Task<byte[]> GetDocumentSymbolsAsync(string code)
    {
        var document = await UpdateDocumentAsync(_diagnosticProject, code);
        var symbols = await BuildDocumentSymbolsAsync(document);
        return Payload(symbols, "GetDocumentSymbolsAsync");
    }

    public async Task<byte[]> GetFormattingAsync(string code)
    {
        var document = await UpdateDocumentAsync(_diagnosticProject, code);
        var formattedDocument = await Formatter.FormatAsync(document);
        var text = await formattedDocument.GetTextAsync();
        return Payload(text.ToString(), "GetFormattingAsync");
    }

    public async Task<byte[]> GetRangeFormattingAsync(string code, string rangeRequestString)
    {
        var document = await UpdateDocumentAsync(_diagnosticProject, code);
        var text = await document.GetTextAsync();
        var range = DeserializeRequest<RangeRequest>(rangeRequestString);
        var span = ToTextSpan(text, range);
        var formattedDocument = await Formatter.FormatAsync(document, span);
        var formattedText = await formattedDocument.GetTextAsync();
        return Payload(formattedText.ToString(), "GetRangeFormattingAsync");
    }

    public async Task<byte[]> GetCodeActionsAsync(string code, string rangeRequestString)
    {
        var document = await UpdateDocumentAsync(_diagnosticProject, code);
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

        return Payload(actions
            .GroupBy(action => action.Title)
            .Select(group => group.First())
            .ToArray(), "GetCodeActionsAsync");
    }

    public async Task<byte[]> GetInlayHintsAsync(string code, string rangeRequestString)
    {
        var document = await UpdateDocumentAsync(_diagnosticProject, code);
        var text = await document.GetTextAsync();
        var range = DeserializeRequest<RangeRequest>(rangeRequestString);
        var span = ToTextSpan(text, range);
        var hints = await BuildInlayHintsAsync(document, span);
        return Payload(hints, "GetInlayHintsAsync");
    }

    public async Task<byte[]> GetFoldingRangesAsync(string code)
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
    }

    public async Task<byte[]> IncludeNamespaceAsync(string namespaceName)
    {
        var completionResult = await _completionProject.IncludeNamespaceAsync(namespaceName);
        var diagnosticResult = await _diagnosticProject.IncludeNamespaceAsync(namespaceName);

        var response = new
        {
            namespaceName = completionResult.NamespaceName,
            success = completionResult.Success || diagnosticResult.Success,
            addedAssemblies = completionResult.AddedAssemblies
                .Concat(diagnosticResult.AddedAssemblies)
                .Distinct(StringComparer.Ordinal)
                .ToArray(),
            matchedAssemblies = completionResult.MatchedAssemblies
                .Concat(diagnosticResult.MatchedAssemblies)
                .Distinct(StringComparer.Ordinal)
                .ToArray(),
            message = completionResult.AddedAssemblies.Count > 0
                ? completionResult.Message
                : diagnosticResult.Message
        };

        return Payload(response, "IncludeNamespaceAsync");
    }

    Task<Document> UpdateDocumentAsync(RoslynProject project, string code)
    {
        return project.UpdateDocumentAsync(code);
    }

    Task<Document> UpdateDiagnosticDocumentAsync(string code, string diagnosticRequestString)
    {
        if (string.IsNullOrWhiteSpace(diagnosticRequestString))
        {
            return _diagnosticProject.UpdateDocumentAsync(code);
        }

        try
        {
            var request = DeserializeRequest<DiagnosticProjectRequest>(diagnosticRequestString);
            var files = (request.Files ?? Array.Empty<DiagnosticProjectFileDto>())
                .Where(file => !string.IsNullOrWhiteSpace(file.Path))
                .Select(file => new RoslynProject.SourceFileSnapshot(file.Path, file.Content ?? string.Empty))
                .ToArray();
            return _diagnosticProject.UpdateProjectDocumentsAsync(code, request.CurrentPath, files);
        }
        catch (Exception e)
        {
            Console.WriteLine($"Could not deserialize diagnostic project snapshot: {e.Message}");
            return _diagnosticProject.UpdateDocumentAsync(code);
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

        var symbol = await SymbolFinder.FindSymbolAtPositionAsync(semanticModel, position, document.Project.Solution.Workspace);
        if (symbol != null)
        {
            return symbol;
        }

        var root = await document.GetSyntaxRootAsync();
        var token = FindIdentifierTokenAtOffset(root, text, position);
        return token.HasValue ? GetSymbolForToken(semanticModel, token.Value) : null;
    }

    async Task<ISymbol> ResolveSourceNavigationSymbolAsync(ISymbol symbol, Solution solution)
    {
        var sourceSymbol = await SymbolFinder.FindSourceDefinitionAsync(symbol, solution) ?? symbol;
        if (sourceSymbol.Locations.Any(location => location.IsInSource))
        {
            return sourceSymbol;
        }

        if (sourceSymbol is IMethodSymbol method
            && (method.MethodKind == MethodKind.Constructor || method.MethodKind == MethodKind.StaticConstructor)
            && method.ContainingType != null)
        {
            return await SymbolFinder.FindSourceDefinitionAsync(method.ContainingType, solution) ?? method.ContainingType;
        }

        return sourceSymbol;
    }

    async Task<TextRange?> GetIdentifierRangeAtRequestAsync(Document document, string positionRequestString)
    {
        var request = DeserializeRequest<PositionRequest>(positionRequestString);
        var text = await document.GetTextAsync();
        var offset = ToOffset(text, request);
        var root = await document.GetSyntaxRootAsync();
        var token = FindIdentifierTokenAtOffset(root, text, offset);
        if (!token.HasValue)
        {
            return null;
        }

        return ToRange(text, token.Value.Span);
    }

    static SyntaxToken? FindIdentifierTokenAtOffset(SyntaxNode? root, SourceText text, int offset)
    {
        if (root == null)
        {
            return null;
        }

        foreach (var candidateOffset in new[] { offset, offset - 1 })
        {
            if (candidateOffset < 0)
            {
                continue;
            }

            var clampedOffset = Math.Max(0, Math.Min(candidateOffset, text.Length));
            var token = root.FindToken(clampedOffset);
            if (token.IsKind(SyntaxKind.IdentifierToken))
            {
                return token;
            }
        }

        return null;
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

    MonacoLocation? ToLocation(Location location, RoslynProject project, ISymbol? symbol)
    {
        var document = project.Workspace.CurrentSolution.GetDocument(location.SourceTree);
        if (document == null)
        {
            return null;
        }

        var text = document.GetTextAsync().Result;
        return new MonacoLocation(
            ToRange(text, location.SourceSpan),
            symbol?.Name,
            symbol?.Kind.ToString(),
            symbol?.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            project.GetDocumentPath(document));
    }

    MonacoTextEdit? ToRenameEdit(Location location, RoslynProject project, string newName)
    {
        var document = project.Workspace.CurrentSolution.GetDocument(location.SourceTree);
        if (document == null)
        {
            return null;
        }

        var text = document.GetTextAsync().Result;
        return new MonacoTextEdit(ToRange(text, location.SourceSpan), newName, project.GetDocumentPath(document));
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
        return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new ResponsePayload(payload, type), jsonOptions));
    }

    #endregion
}
