#nullable enable

using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace CodeCraft.CSharp
{
    /// <summary>
    /// The browser-safe subset of evaluated C# project settings shared by authoring and
    /// execution. The static application evaluates these values from the nearest .csproj
    /// and sends the same JSON object to both Roslyn hosts.
    /// </summary>
    public sealed class CSharpProjectConfiguration
    {
        public string BuildConfiguration { get; set; } = "Release";
        public string Platform { get; set; } = "AnyCPU";
        public string? TargetFramework { get; set; }
        public string LanguageVersion { get; set; } = "preview";
        public string Nullable { get; set; } = "Disable";
        public bool AllowUnsafeBlocks { get; set; }
        public bool CheckForOverflowUnderflow { get; set; }
        public string OptimizationLevel { get; set; } = "Release";
        public string[] DefineConstants { get; set; } = Array.Empty<string>();
        public int WarningLevel { get; set; } = 4;
        public bool TreatWarningsAsErrors { get; set; }
        public string[] NoWarn { get; set; } = Array.Empty<string>();
        public string[] WarningsAsErrors { get; set; } = Array.Empty<string>();
        public string[] WarningsNotAsErrors { get; set; } = Array.Empty<string>();
        public string OutputKind { get; set; } = "ConsoleApplication";
        public string? MainTypeName { get; set; }
        public string[] GlobalUsings { get; set; } = Array.Empty<string>();
    }

    public static class CSharpCompilerSettings
    {
        public static CSharpParseOptions CreateParseOptions(
            CSharpProjectConfiguration? configuration,
            SourceCodeKind kind = SourceCodeKind.Regular)
        {
            configuration = configuration ?? new CSharpProjectConfiguration();
            return CSharpParseOptions.Default
                .WithKind(kind)
                .WithLanguageVersion(ParseLanguageVersion(configuration.LanguageVersion))
                .WithPreprocessorSymbols(
                    NormalizeValues(configuration.DefineConstants, StringComparer.Ordinal));
        }

        public static CSharpCompilationOptions CreateCompilationOptions(
            CSharpProjectConfiguration? configuration,
            OutputKind? outputKindOverride = null)
        {
            configuration = configuration ?? new CSharpProjectConfiguration();
            var options = new CSharpCompilationOptions(
                    outputKindOverride ?? ParseOutputKind(configuration.OutputKind),
                    mainTypeName: NullIfWhiteSpace(configuration.MainTypeName),
                    optimizationLevel: ParseOptimizationLevel(configuration.OptimizationLevel),
                    checkOverflow: configuration.CheckForOverflowUnderflow,
                    allowUnsafe: configuration.AllowUnsafeBlocks,
                    platform: ParsePlatform(configuration.Platform),
                    generalDiagnosticOption: configuration.TreatWarningsAsErrors
                        ? ReportDiagnostic.Error
                        : ReportDiagnostic.Default,
                    warningLevel: Math.Max(0, configuration.WarningLevel),
                    concurrentBuild: false)
                .WithNullableContextOptions(ParseNullableContext(configuration.Nullable));

            var diagnostics = new Dictionary<string, ReportDiagnostic>(StringComparer.OrdinalIgnoreCase);
            foreach (var id in NormalizeDiagnosticIds(configuration.WarningsAsErrors))
            {
                diagnostics[id] = ReportDiagnostic.Error;
            }
            foreach (var id in NormalizeDiagnosticIds(configuration.WarningsNotAsErrors))
            {
                diagnostics[id] = ReportDiagnostic.Warn;
            }
            foreach (var id in NormalizeDiagnosticIds(configuration.NoWarn))
            {
                diagnostics[id] = ReportDiagnostic.Suppress;
            }

            return diagnostics.Count == 0
                ? options
                : options.WithSpecificDiagnosticOptions(
                    diagnostics.ToImmutableDictionary(StringComparer.OrdinalIgnoreCase));
        }

        public static LanguageVersion ParseLanguageVersion(string? value)
        {
            var normalized = NullIfWhiteSpace(value);
            if (normalized != null && LanguageVersionFacts.TryParse(normalized, out var version))
            {
                return version;
            }
            return LanguageVersion.Preview;
        }

        private static IEnumerable<string> NormalizeDiagnosticIds(IEnumerable<string>? values)
        {
            return NormalizeValues(values, StringComparer.OrdinalIgnoreCase);
        }

        private static IEnumerable<string> NormalizeValues(
            IEnumerable<string>? values,
            StringComparer comparer)
        {
            var seen = new HashSet<string>(comparer);
            foreach (var value in values ?? Enumerable.Empty<string>())
            {
                var normalized = value?.Trim();
                if (!String.IsNullOrWhiteSpace(normalized) && seen.Add(normalized))
                {
                    yield return normalized;
                }
            }
        }

        private static string? NullIfWhiteSpace(string? value)
        {
            return String.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static OutputKind ParseOutputKind(string? value)
        {
            return Enum.TryParse(value, true, out OutputKind parsed)
                ? parsed
                : OutputKind.ConsoleApplication;
        }

        private static OptimizationLevel ParseOptimizationLevel(string? value)
        {
            return String.Equals(value, "Debug", StringComparison.OrdinalIgnoreCase)
                ? OptimizationLevel.Debug
                : OptimizationLevel.Release;
        }

        private static Platform ParsePlatform(string? value)
        {
            var normalized = (value ?? String.Empty).Replace(" ", String.Empty);
            if (String.Equals(normalized, "AnyCPU32BitPreferred", StringComparison.OrdinalIgnoreCase)
                || String.Equals(normalized, "AnyCPUPrefer32Bit", StringComparison.OrdinalIgnoreCase))
            {
                return Platform.AnyCpu32BitPreferred;
            }
            if (String.Equals(normalized, "x86", StringComparison.OrdinalIgnoreCase)) return Platform.X86;
            if (String.Equals(normalized, "x64", StringComparison.OrdinalIgnoreCase)) return Platform.X64;
            if (String.Equals(normalized, "arm", StringComparison.OrdinalIgnoreCase)) return Platform.Arm;
            if (String.Equals(normalized, "arm64", StringComparison.OrdinalIgnoreCase)) return Platform.Arm64;
            return Platform.AnyCpu;
        }

        private static NullableContextOptions ParseNullableContext(string? value)
        {
            if (String.Equals(value, "Enable", StringComparison.OrdinalIgnoreCase))
            {
                return NullableContextOptions.Enable;
            }
            if (String.Equals(value, "Warnings", StringComparison.OrdinalIgnoreCase))
            {
                return NullableContextOptions.Warnings;
            }
            if (String.Equals(value, "Annotations", StringComparison.OrdinalIgnoreCase))
            {
                return NullableContextOptions.Annotations;
            }
            return NullableContextOptions.Disable;
        }
    }
}
