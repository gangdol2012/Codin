// wwwroot/message-service.js
const orig = monacoService.__proto__.invokeMethod;

monacoService.__proto__.invokeMethod = function (...args) {
    try {
        const lastArg = args[args.length - 1];
        if (typeof lastArg !== "string") {
            return orig.call(this, ...args);
        }

        const parsed = JSON.parse(lastArg);
        const resultPayload = parsed?.ResultPayload;

        // .NET threw, or payload isn't the expected marshalled string
        if (typeof resultPayload !== "string" || resultPayload.length < 2) {
            return orig.call(this, ...args);
        }

        const parsedResult = JSON.parse(
            atob(resultPayload.slice(1, resultPayload.length - 1))
        );

        if (parsedResult?.type && typeof methods[parsedResult.type] === "function") {
            methods[parsedResult.type](parsedResult.payload);
            parsed.ResultPayload = JSON.stringify(JSON.stringify("{}"));
            return orig.call(this, args[0], null);
        }
    } catch (e) {
        console.warn("invokeMethod passthrough:", e);
    }

    return orig.call(this, ...args);
};