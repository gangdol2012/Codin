/* MIT License
 * 
 * Copyright (c) .NET Foundation and Contributors All Rights Reserved
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.Options;
using System.Reflection;
using CompletionItem = Microsoft.CodeAnalysis.Completion.CompletionItem;


internal static class CompletionItemExtensions
{
    private const string InsertionText = nameof(InsertionText);
    private const string ObjectCreationCompletionProvider = "Microsoft.CodeAnalysis.CSharp.Completion.Providers.ObjectCreationCompletionProvider";
    internal const string OverrideCompletionProvider = "Microsoft.CodeAnalysis.CSharp.Completion.Providers.OverrideCompletionProvider";
    internal const string PartialMethodCompletionProvider = "Microsoft.CodeAnalysis.CSharp.Completion.Providers.PartialMethodCompletionProvider";
    internal const string InternalsVisibleToCompletionProvider = "Microsoft.CodeAnalysis.CSharp.Completion.Providers.InternalsVisibleToCompletionProvider";
    internal const string XmlDocCommentCompletionProvider = "Microsoft.CodeAnalysis.CSharp.Completion.Providers.XmlDocCommentCompletionProvider";
    internal const string TypeImportCompletionProvider = "Microsoft.CodeAnalysis.CSharp.Completion.Providers.TypeImportCompletionProvider";
    internal const string ExtensionMethodImportCompletionProvider = "Microsoft.CodeAnalysis.CSharp.Completion.Providers.ExtensionMethodImportCompletionProvider";
    internal const string EmeddedLanguageCompletionProvider = "Microsoft.CodeAnalysis.CSharp.Completion.Providers.EmbeddedLanguageCompletionProvider";
    private const string ProviderName = nameof(ProviderName);
    private static readonly PropertyInfo _getProviderName;
    internal static readonly PerLanguageOption<bool?> ShowItemsFromUnimportedNamespaces = new PerLanguageOption<bool?>("CompletionOptions", "ShowItemsFromUnimportedNamespaces", defaultValue: null);

    static CompletionItemExtensions()
    {
        _getProviderName = typeof(CompletionItem).GetProperty(
            ProviderName,
            BindingFlags.NonPublic | BindingFlags.Instance)
            ?? throw new MissingMemberException(typeof(CompletionItem).FullName, ProviderName);
    }

    internal static string GetProviderName(this CompletionItem item) =>
        _getProviderName.GetValue(item) as string ?? string.Empty;

    public static bool IsObjectCreationCompletionItem(this CompletionItem item) => GetProviderName(item) == ObjectCreationCompletionProvider;

    public static bool TryGetInsertionText(this CompletionItem completionItem, out string insertionText)
    {
        if (completionItem.Properties.TryGetValue(InsertionText, out var value))
        {
            insertionText = value;
            return true;
        }

        insertionText = string.Empty;
        return false;
    }
}
