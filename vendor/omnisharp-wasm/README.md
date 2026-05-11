# OmniSharp

## What is OmniSharp?

OmniSharp is a standalone Blazor API served through an iframe as a purely clientside solution for intellisense in the Monaco editor.

## How does it work?
The Blazor app is compiled as a standalone website running WASM--no backend involved. In CodeCraft it is served from the bundled `/omnisharp/` runtime.
The web app's main work is done in a WebWorker with some further optimizations around JS <-> WASM marshalling to provide non-blocking behavior for the consumer while working in the Monaco editor.

## Demo
A demo site with a Monaco editor can be found here: https://omnisharp-demo.vercel.app/
The demo's repo can be found here: https://github.com/knervous/omnisharp-demo

## How do I use it in the client?
If you want to use this in an existing JS client that uses Monaco, integration is simple. Look at the example listed under `Examples/client`. The interface itself is all in `monaco.js` which is framework-independent, i.e. works in React, Angular, Vue, vanilla js. The pattern is as follows:

```js
import { MonacoService } from "./monaco";
const monacoService = new MonacoService();


// Somewhere later in the code when we have a reference to `monaco` whose language is `csharp`
await monacoService.initialize(monaco, /** optional param for another URL other than the bundled /omnisharp/ runtime */)

// monaco instance is now wired up to csharp intellisense!
```

## Acknowledgements
Much of this project was bootstrapped with existing projects, notably https://github.com/Apollo3zehn/MonacoBlazorSample which laid the foundation for interacting with OmniSharp-backed C# services.
