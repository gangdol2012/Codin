# Third-party notices

CodeCraft is licensed under the [MIT License](LICENSE). Third-party software
and hosted services used by CodeCraft remain subject to their own terms. The
same notices are shipped with the web application in
[`public/THIRD_PARTY_NOTICES.txt`](public/THIRD_PARTY_NOTICES.txt).

The principal redistributed or runtime-provided components are:

- **Pyodide 0.29.3**, including its CPython runtime and standard library:
  [MPL-2.0](https://www.mozilla.org/MPL/2.0/). Source is available from the
  [Pyodide 0.29.3 source tree](https://github.com/pyodide/pyodide/tree/0.29.3).
  CPython components retain the
  [Python Software Foundation License](https://docs.python.org/3/license.html).
- **Eclipse Compiler for Java (ECJ)
  3.12.3.v20170228-1205**: [EPL-1.0](https://www.eclipse.org/legal/epl-v10.html).
  Source is available from the
  [Eclipse JDT Core R4_6_maintenance source tree](https://github.com/eclipse-jdt/eclipse.jdt.core/tree/R4_6_maintenance).
- **Janino and Commons Compiler 3.1.12**: BSD-3-Clause. Copyright (c)
  2001-2016 Arno Unkrig and copyright (c) 2015-2016 TIBCO Software Inc.
  Source is available from the
  [Janino 3.1.12 source tree](https://github.com/janino-compiler/janino/tree/v3.1.12).
- **browser-csharp** and the CodeCraft browser C# bridge: MIT. Copyright (c)
  2020 Mårten Åsberg; copyright (c) 2024 Paul Johnson.
- **OmniSharp, Roslyn, the .NET runtime, and related .NET libraries**: MIT.
  Copyright the .NET Foundation and contributors. Source is available from
  the [OmniSharp](https://github.com/OmniSharp/omnisharp-roslyn),
  [Roslyn](https://github.com/dotnet/roslyn), and
  [.NET runtime](https://github.com/dotnet/runtime) repositories.
- **Typeshed data**: predominantly Apache-2.0, with separately marked files
  retaining their original licenses. Source is available from
  [python/typeshed](https://github.com/python/typeshed).
- **Monaco Editor and Pyright-related integrations**: MIT. Copyright Microsoft
  Corporation and the respective integration authors.
- **Wasmer JavaScript SDK**: MIT. Copyright (c) 2019-present Wasmer, Inc. and
  its affiliates.
- **browser_wasi_shim**: MIT OR Apache-2.0.
- **CheerpJ 4.3** is not redistributed by this repository. Java execution
  loads the hosted CheerpJ runtime from `cjrtnc.leaningtech.com` and is subject
  to the [CheerpJ Community License](https://cheerpj.com/docs/licensing).
  Java execution is powered by CheerpJ by Leaning Technologies.

JavaScript dependencies not individually listed above retain the licenses
declared by their packages and recorded in `package-lock.json`.

## MIT-licensed third-party software

Unless a component carries a more specific notice, the MIT-licensed
components listed above are provided under these terms:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The applicable copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Janino BSD-3-Clause notice

Copyright (c) 2001-2016, Arno Unkrig  
Copyright (c) 2015-2016 TIBCO Software Inc.  
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of JANINO nor the names of its contributors may be used
   to endorse or promote products derived from this software without specific
   prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
