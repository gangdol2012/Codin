import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CSHARP_PROJECT_CONFIGURATION,
  inferCSharpLanguageVersion,
  renderCSharpGlobalUsings,
  resolveCSharpProjectContext,
} from '../src/csharp-project.ts';

test('unmanaged C# keeps the legacy defaults and includes every C# source', () => {
  const context = resolveCSharpProjectContext([
    { path: 'other/App.csproj', content: '<Project />' },
    { path: 'other/Library.cs', content: 'public class Library {}' },
    { path: './loose\\Program.cs', content: 'Console.WriteLine("hello");' },
    { path: 'README.md', content: '# ignored' },
    { path: 'loose/helper.CS', content: 'class Helper {}' },
  ], 'loose/./Program.cs');

  assert.equal(context.mode, 'unmanaged');
  assert.equal(context.projectPath, null);
  assert.equal(context.projectDirectory, '');
  assert.equal(context.currentPath, 'loose/Program.cs');
  assert.deepEqual(
    context.sourceFiles.map(file => file.path),
    ['loose/Program.cs', 'loose/helper.CS', 'other/Library.cs']
  );
  assert.deepEqual(context.configuration, {
    ...DEFAULT_CSHARP_PROJECT_CONFIGURATION,
    defineConstants: [],
    noWarn: [],
    warningsAsErrors: [],
    warningsNotAsErrors: [],
    globalUsings: [],
  });
  assert.equal(context.generatedGlobalUsingsSource, '');
  assert.match(context.fingerprint, /^csharp-[0-9a-f]{16}$/);
  assert.deepEqual(JSON.parse(JSON.stringify(context)), context);
});

test('the nearest ancestor project wins and nested projects and build outputs are excluded', () => {
  const context = resolveCSharpProjectContext([
    { path: 'Root.csproj', content: '<Project Sdk="Microsoft.NET.Sdk" />' },
    { path: 'RootProgram.cs', content: 'class RootProgram {}' },
    { path: 'apps/tool/Z.Tool.csproj', content: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>' },
    { path: 'apps/tool/A.Tool.csproj', content: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>' },
    { path: 'apps/tool/src/Program.cs', content: 'class Program {}' },
    { path: 'apps/tool/Shared.cs', content: 'class Shared {}' },
    { path: 'apps/tool/obj/Generated.cs', content: 'class Generated {}' },
    { path: 'apps/tool/bin/Release/Generated.cs', content: 'class GeneratedAgain {}' },
    { path: 'apps/tool/tests/Tests.csproj', content: '<Project Sdk="Microsoft.NET.Sdk" />' },
    { path: 'apps/tool/tests/Test.cs', content: 'class Test {}' },
    { path: 'apps/sibling/Sibling.cs', content: 'class Sibling {}' },
  ], 'apps/tool/src/Program.cs');

  assert.equal(context.mode, 'project');
  assert.equal(context.projectPath, 'apps/tool/A.Tool.csproj');
  assert.equal(context.projectDirectory, 'apps/tool');
  assert.deepEqual(
    context.sourceFiles.map(file => file.path),
    ['apps/tool/Shared.cs', 'apps/tool/src/Program.cs']
  );
  assert.equal(context.configuration.outputKind, 'ConsoleApplication');
});

test('same-directory projects are selected by C# compile membership before lexical order', () => {
  const context = resolveCSharpProjectContext([
    {
      path: 'A.csproj',
      content: `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
            <LangVersion>7.3</LangVersion>
          </PropertyGroup>
          <ItemGroup><Compile Include="A.cs" /></ItemGroup>
        </Project>`,
    },
    {
      path: 'Z.csproj',
      content: `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
            <LangVersion>preview</LangVersion>
          </PropertyGroup>
          <ItemGroup><Compile Include="Z.cs" /></ItemGroup>
        </Project>`,
    },
    { path: 'A.cs', content: 'class A {}' },
    { path: 'Z.cs', content: 'class Z {}' },
  ], 'Z.cs');

  assert.equal(context.projectPath, 'Z.csproj');
  assert.deepEqual(context.sourceFiles.map(file => file.path), ['Z.cs']);
  assert.equal(context.configuration.languageVersion, 'Preview');
});

test('classic same-directory projects own only their explicit Compile items', () => {
  const files = [
    {
      path: 'Assembly-CSharp-Editor.csproj',
      content: `
        <Project ToolsVersion="Current">
          <ItemGroup><Compile Include="Assets/Editor/EditorTool.cs" /></ItemGroup>
        </Project>`,
    },
    {
      path: 'Assembly-CSharp.csproj',
      content: `
        <Project ToolsVersion="Current">
          <ItemGroup><Compile Include="Assets/Game.cs" /></ItemGroup>
        </Project>`,
    },
    {
      path: 'Assets/Game.cs',
      content: 'public class RuntimeOnly {}',
    },
    {
      path: 'Assets/Editor/EditorTool.cs',
      content: 'public class EditorOnly {}',
    },
  ];

  const runtime = resolveCSharpProjectContext(files, 'Assets/Game.cs');
  assert.equal(runtime.projectPath, 'Assembly-CSharp.csproj');
  assert.deepEqual(runtime.sourceFiles.map(file => file.path), ['Assets/Game.cs']);

  const editor = resolveCSharpProjectContext(files, 'Assets/Editor/EditorTool.cs');
  assert.equal(editor.projectPath, 'Assembly-CSharp-Editor.csproj');
  assert.deepEqual(editor.sourceFiles.map(file => file.path), ['Assets/Editor/EditorTool.cs']);

  const explicitDefaultItems = resolveCSharpProjectContext([
    {
      path: 'Legacy.csproj',
      content: `
        <Project ToolsVersion="Current">
          <PropertyGroup><EnableDefaultCompileItems>true</EnableDefaultCompileItems></PropertyGroup>
        </Project>`,
    },
    { path: 'One.cs', content: 'class One {}' },
    { path: 'Two.cs', content: 'class Two {}' },
  ], 'One.cs');
  assert.deepEqual(
    explicitDefaultItems.sourceFiles.map(file => file.path),
    ['One.cs', 'Two.cs']
  );
});

test('explicit SDK imports retain SDK default Compile items', () => {
  const context = resolveCSharpProjectContext([
    {
      path: 'ImportedSdk.csproj',
      content: `
        <Project>
          <Import Project="Sdk.props" Sdk="Microsoft.NET.Sdk" />
          <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
          <Import Project="Sdk.targets" Sdk="Microsoft.NET.Sdk" />
        </Project>`,
    },
    { path: 'Program.cs', content: 'class Program {}' },
    { path: 'Nested/Helper.cs', content: 'class Helper {}' },
  ], 'Program.cs');

  assert.equal(context.projectPath, 'ImportedSdk.csproj');
  assert.deepEqual(
    context.sourceFiles.map(file => file.path),
    ['Nested/Helper.cs', 'Program.cs']
  );
});

test('an out-of-tree linked source retains its owning project when opened', () => {
  const context = resolveCSharpProjectContext([
    {
      path: 'app/App.csproj',
      content: `
        <Project ToolsVersion="Current">
          <ItemGroup>
            <Compile Include="Program.cs" />
            <Compile Include="../shared/Common.cs" />
          </ItemGroup>
        </Project>`,
    },
    { path: 'app/Program.cs', content: 'class Program { Common Value = new(); }' },
    { path: 'shared/Common.cs', content: 'class Common {}' },
    {
      path: 'other/Other.csproj',
      content: `
        <Project ToolsVersion="Current">
          <ItemGroup><Compile Include="Program.cs" /></ItemGroup>
        </Project>`,
    },
    { path: 'other/Program.cs', content: 'class Program {}' },
  ], 'shared/Common.cs');

  assert.equal(context.mode, 'project');
  assert.equal(context.projectPath, 'app/App.csproj');
  assert.deepEqual(
    context.sourceFiles.map(file => file.path),
    ['app/Program.cs', 'shared/Common.cs']
  );
});

test('unmanaged sources do not absorb files owned by unrelated projects', () => {
  const context = resolveCSharpProjectContext([
    { path: 'loose/Program.cs', content: 'class LooseProgram {}' },
    { path: 'loose/Helper.cs', content: 'class LooseHelper {}' },
    {
      path: 'app/App.csproj',
      content: `
        <Project ToolsVersion="Current">
          <ItemGroup><Compile Include="Program.cs" /></ItemGroup>
        </Project>`,
    },
    { path: 'app/Program.cs', content: 'class Program {}' },
    {
      path: 'library/Library.csproj',
      content: '<Project Sdk="Microsoft.NET.Sdk" />',
    },
    { path: 'library/Library.cs', content: 'class Library {}' },
  ], 'loose/Program.cs');

  assert.equal(context.mode, 'unmanaged');
  assert.equal(context.projectPath, null);
  assert.deepEqual(
    context.sourceFiles.map(file => file.path),
    ['loose/Helper.cs', 'loose/Program.cs']
  );
});

test('Release and AnyCPU properties are evaluated in project order', () => {
  const project = `
    <Project Sdk="Microsoft.NET.Sdk">
      <PropertyGroup>
        <TargetFrameworks>net7.0;net8.0</TargetFrameworks>
        <Nullable>annotations</Nullable>
        <DefineConstants>BaseCase</DefineConstants>
        <OutputType>Library</OutputType>
      </PropertyGroup>
      <PropertyGroup Condition="'$(Configuration)|$(Platform)' == 'Debug|AnyCPU'">
        <LangVersion>7.3</LangVersion>
        <AllowUnsafeBlocks>false</AllowUnsafeBlocks>
      </PropertyGroup>
      <PropertyGroup Condition="('$(Configuration)' == 'Release') And ('$(Platform)' == 'AnyCPU')">
        <LangVersion>preview</LangVersion>
        <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
        <CheckForOverflowUnderflow>true</CheckForOverflowUnderflow>
        <Optimize>false</Optimize>
        <DefineConstants>$(DefineConstants);ReleaseCase;BaseCase</DefineConstants>
        <WarningLevel>7</WarningLevel>
        <PlatformTarget>x64</PlatformTarget>
        <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
        <NoWarn>cs1591;0618;CS1591</NoWarn>
        <WarningsAsErrors>cs8600,nu1605</WarningsAsErrors>
        <WarningsNotAsErrors>cs0618</WarningsNotAsErrors>
        <OutputType>WinExe</OutputType>
        <StartupObject>Example.EntryPoint</StartupObject>
      </PropertyGroup>
      <PropertyGroup Condition="'$(Configuration)' != 'Release'">
        <OutputType>Exe</OutputType>
      </PropertyGroup>
      <PropertyGroup Condition="'$(TargetFramework)' == 'net7.0'">
        <Nullable>warnings</Nullable>
      </PropertyGroup>
    </Project>`;

  const { configuration } = resolveCSharpProjectContext([
    { path: 'sample.csproj', content: project },
    { path: 'Program.cs', content: 'class Program {}' },
  ], 'Program.cs');

  assert.deepEqual(configuration, {
    buildConfiguration: 'Release',
    platform: 'x64',
    targetFramework: 'net7.0',
    languageVersion: 'Preview',
    nullable: 'Warnings',
    allowUnsafeBlocks: true,
    checkForOverflowUnderflow: true,
    optimizationLevel: 'Debug',
    defineConstants: [
      'BaseCase',
      'ReleaseCase',
      'RELEASE',
      'NET',
      'NET7_0',
      'NETCOREAPP',
      'NET5_0_OR_GREATER',
      'NET6_0_OR_GREATER',
      'NET7_0_OR_GREATER',
      'NETCOREAPP1_0_OR_GREATER',
      'NETCOREAPP1_1_OR_GREATER',
      'NETCOREAPP2_0_OR_GREATER',
      'NETCOREAPP2_1_OR_GREATER',
      'NETCOREAPP2_2_OR_GREATER',
      'NETCOREAPP3_0_OR_GREATER',
      'NETCOREAPP3_1_OR_GREATER',
    ],
    warningLevel: 7,
    treatWarningsAsErrors: true,
    noWarn: ['CS1591', 'CS0618'],
    warningsAsErrors: ['CS8600', 'NU1605'],
    warningsNotAsErrors: ['CS0618'],
    outputKind: 'WindowsApplication',
    mainTypeName: 'Example.EntryPoint',
    globalUsings: [],
  });
});

test('SDK compile items honor default-item disable, include, exclude, and remove globs', () => {
  const project = `
    <Project Sdk="Microsoft.NET.Sdk">
      <PropertyGroup>
        <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
      </PropertyGroup>
      <ItemGroup>
        <Compile Include="src/**/*.cs" Exclude="src/**/Skipped*.cs" />
        <Compile Include="../shared/Common.cs" />
        <Compile Remove="src/legacy/**" />
      </ItemGroup>
    </Project>`;
  const context = resolveCSharpProjectContext([
    { path: 'app/App.csproj', content: project },
    { path: 'app/Program.cs', content: 'class NotExplicitlyIncluded {}' },
    { path: 'app/src/Feature.cs', content: 'class Feature {}' },
    { path: 'app/src/deep/Other.cs', content: 'class Other {}' },
    { path: 'app/src/deep/Skipped.g.cs', content: 'class Skipped {}' },
    { path: 'app/src/legacy/Old.cs', content: 'class Old {}' },
    { path: 'shared/Common.cs', content: 'class Common {}' },
  ], 'app/src/Feature.cs');

  assert.deepEqual(
    context.sourceFiles.map(file => file.path),
    ['app/src/Feature.cs', 'app/src/deep/Other.cs', 'shared/Common.cs']
  );
});

test('language and warning defaults are inferred from the selected target framework', () => {
  assert.equal(inferCSharpLanguageVersion('net10.0'), '14.0');
  assert.equal(inferCSharpLanguageVersion('net9.0-windows10.0.22621.0'), '13.0');
  assert.equal(inferCSharpLanguageVersion('netcoreapp3.1'), '8.0');
  assert.equal(inferCSharpLanguageVersion('netstandard2.1'), '8.0');
  assert.equal(inferCSharpLanguageVersion('netstandard2.0'), '7.3');
  assert.equal(inferCSharpLanguageVersion('net48'), '7.3');
  assert.equal(inferCSharpLanguageVersion(null), 'Preview');

  const { configuration } = resolveCSharpProjectContext([
    {
      path: 'Library.csproj',
      content: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
    },
    { path: 'Library.cs', content: 'class Library {}' },
  ], 'Library.cs');
  assert.equal(configuration.languageVersion, '12.0');
  assert.equal(configuration.warningLevel, 8);
  assert.equal(configuration.outputKind, 'DynamicallyLinkedLibrary');
});

test('executable SDK output defaults are applied without evaluating imported props', () => {
  for (const sdk of [
    'Microsoft.NET.Sdk.Web',
    'Microsoft.NET.Sdk.BlazorWebAssembly',
    'Microsoft.NET.Sdk.Worker',
  ]) {
    const context = resolveCSharpProjectContext([
      {
        path: 'App.csproj',
        content: `<Project Sdk="${sdk}"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>`,
      },
      { path: 'Program.cs', content: 'Console.WriteLine("hello");' },
    ], 'Program.cs');
    assert.equal(context.configuration.outputKind, 'ConsoleApplication', sdk);
  }

  const explicitLibrary = resolveCSharpProjectContext([
    {
      path: 'App.csproj',
      content: '<Project Sdk="Microsoft.NET.Sdk.BlazorWebAssembly"><PropertyGroup><OutputType>Library</OutputType></PropertyGroup></Project>',
    },
    { path: 'Program.cs', content: 'class Program {}' },
  ], 'Program.cs');
  assert.equal(explicitLibrary.configuration.outputKind, 'DynamicallyLinkedLibrary');
});

test('SDK configuration and target-framework constants match Release compiler inputs', () => {
  const net8 = resolveCSharpProjectContext([
    {
      path: 'App.csproj',
      content: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
    },
    { path: 'Program.cs', content: 'class Program {}' },
  ], 'Program.cs');
  assert.deepEqual(net8.configuration.defineConstants, [
    'TRACE',
    'RELEASE',
    'NET',
    'NET8_0',
    'NETCOREAPP',
    'NET5_0_OR_GREATER',
    'NET6_0_OR_GREATER',
    'NET7_0_OR_GREATER',
    'NET8_0_OR_GREATER',
    'NETCOREAPP1_0_OR_GREATER',
    'NETCOREAPP1_1_OR_GREATER',
    'NETCOREAPP2_0_OR_GREATER',
    'NETCOREAPP2_1_OR_GREATER',
    'NETCOREAPP2_2_OR_GREATER',
    'NETCOREAPP3_0_OR_GREATER',
    'NETCOREAPP3_1_OR_GREATER',
  ]);

  const explicitAndDisabled = resolveCSharpProjectContext([
    {
      path: 'App.csproj',
      content: `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net8.0-windows10.0.22621.0</TargetFramework>
            <DefineConstants>EXPLICIT</DefineConstants>
            <DisableImplicitConfigurationDefines>true</DisableImplicitConfigurationDefines>
            <DisableImplicitFrameworkDefines>true</DisableImplicitFrameworkDefines>
            <DisableDiagnosticTracing>true</DisableDiagnosticTracing>
          </PropertyGroup>
        </Project>`,
    },
    { path: 'Program.cs', content: 'class Program {}' },
  ], 'Program.cs');
  assert.deepEqual(explicitAndDisabled.configuration.defineConstants, ['EXPLICIT']);

  const windows = resolveCSharpProjectContext([
    {
      path: 'Windows.csproj',
      content: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0-windows10.0.22621.0</TargetFramework></PropertyGroup></Project>',
    },
    { path: 'Program.cs', content: 'class Program {}' },
  ], 'Program.cs');
  assert.ok(windows.configuration.defineConstants.includes('WINDOWS'));
  assert.ok(windows.configuration.defineConstants.includes('WINDOWS10_0_22621_0'));
  assert.ok(windows.configuration.defineConstants.includes('WINDOWS7_0_OR_GREATER'));
  assert.ok(windows.configuration.defineConstants.includes('WINDOWS10_0_20348_0_OR_GREATER'));
  assert.ok(windows.configuration.defineConstants.includes('WINDOWS10_0_22000_0_OR_GREATER'));
  assert.ok(windows.configuration.defineConstants.includes('WINDOWS10_0_22621_0_OR_GREATER'));
  assert.ok(windows.configuration.defineConstants.includes('WINDOWS10_0_19041_0_OR_GREATER'));

  const defaultWindows = resolveCSharpProjectContext([
    {
      path: 'Windows.csproj',
      content: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0-windows</TargetFramework></PropertyGroup></Project>',
    },
    { path: 'Program.cs', content: 'class Program {}' },
  ], 'Program.cs');
  assert.ok(defaultWindows.configuration.defineConstants.includes('WINDOWS7_0'));
  assert.ok(defaultWindows.configuration.defineConstants.includes('WINDOWS7_0_OR_GREATER'));

  const netFramework = resolveCSharpProjectContext([
    {
      path: 'Framework.csproj',
      content: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net48</TargetFramework></PropertyGroup></Project>',
    },
    { path: 'Program.cs', content: 'class Program {}' },
  ], 'Program.cs');
  assert.ok(netFramework.configuration.defineConstants.includes('NETFRAMEWORK'));
  assert.ok(netFramework.configuration.defineConstants.includes('NET48'));
  assert.ok(netFramework.configuration.defineConstants.includes('NET30_OR_GREATER'));
  assert.ok(netFramework.configuration.defineConstants.includes('NET48_OR_GREATER'));
  assert.ok(!netFramework.configuration.defineConstants.includes('NET'));
});

test('implicit and explicit Using items resolve to deterministic global-using source', () => {
  const project = `
    <Project Sdk="Microsoft.NET.Sdk.Web">
      <PropertyGroup>
        <TargetFramework>net8.0</TargetFramework>
        <ImplicitUsings>enable</ImplicitUsings>
      </PropertyGroup>
      <ItemGroup>
        <Using Remove="System.Net.Http" />
        <Using Include="Company.Product" />
        <Using Include="System.Math" Static="true" />
        <Using Include="System.Text.Json">
          <Alias>Json</Alias>
        </Using>
        <Using Include="Ignored.Debug" Condition="'$(Configuration)' == 'Debug'" />
      </ItemGroup>
    </Project>`;
  const context = resolveCSharpProjectContext([
    { path: 'Web.csproj', content: project },
    { path: 'Program.cs', content: 'var app = WebApplication.CreateBuilder();' },
  ], 'Program.cs');

  const usings = context.configuration.globalUsings;
  assert.ok(usings.includes('System'));
  assert.ok(usings.includes('Microsoft.AspNetCore.Builder'));
  assert.ok(usings.includes('System.Net.Http.Json'));
  assert.ok(usings.includes('Company.Product'));
  assert.ok(usings.includes('static System.Math'));
  assert.ok(usings.includes('Json = System.Text.Json'));
  assert.ok(!usings.includes('System.Net.Http'));
  assert.ok(!usings.includes('Ignored.Debug'));
  assert.deepEqual(usings, [...usings].sort());
  assert.equal(
    context.generatedGlobalUsingsSource,
    `${usings.map(value => `global using ${value};`).join('\n')}\n`
  );
  assert.equal(
    renderCSharpGlobalUsings(['System.Linq', 'global using System;', 'System.Linq;']),
    'global using System;\nglobal using System.Linq;\n'
  );
  assert.ok(!context.sourceFiles.some(file => /GlobalUsings/.test(file.path)));
});

test('the fingerprint is order-stable and invalidates for sources, membership, or project text', () => {
  const original = [
    {
      path: 'app/App.csproj',
      content: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
    },
    { path: 'app/Program.cs', content: 'class Program {}' },
    { path: 'app/Feature.cs', content: 'class Feature {}' },
    { path: 'outside/readme.txt', content: 'unrelated' },
  ];
  const baseline = resolveCSharpProjectContext(original, 'app/Program.cs');
  const reordered = resolveCSharpProjectContext([...original].reverse(), 'app/Feature.cs');
  assert.equal(reordered.fingerprint, baseline.fingerprint);

  const unrelatedChange = original.map(file => (
    file.path === 'outside/readme.txt' ? { ...file, content: 'changed but unrelated' } : file
  ));
  assert.equal(
    resolveCSharpProjectContext(unrelatedChange, 'app/Program.cs').fingerprint,
    baseline.fingerprint
  );

  const sourceChange = original.map(file => (
    file.path === 'app/Feature.cs' ? { ...file, content: 'class Feature { int Value; }' } : file
  ));
  assert.notEqual(
    resolveCSharpProjectContext(sourceChange, 'app/Program.cs').fingerprint,
    baseline.fingerprint
  );

  const projectTextChange = original.map(file => (
    file.path === 'app/App.csproj' ? { ...file, content: `${file.content}\n` } : file
  ));
  assert.notEqual(
    resolveCSharpProjectContext(projectTextChange, 'app/Program.cs').fingerprint,
    baseline.fingerprint
  );

  const nestedProject = [
    ...original,
    { path: 'app/nested/Nested.csproj', content: '<Project />' },
    { path: 'app/nested/Nested.cs', content: 'class Nested {}' },
  ];
  const nestedContext = resolveCSharpProjectContext(nestedProject, 'app/Program.cs');
  assert.notEqual(nestedContext.fingerprint, baseline.fingerprint);
  assert.ok(!nestedContext.sourceFiles.some(file => file.path === 'app/nested/Nested.cs'));
});
