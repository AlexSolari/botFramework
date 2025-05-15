declare const traceSymbol: unique symbol;

export type TraceId = `${string}:${string}-${string}` & { [traceSymbol]: void };
