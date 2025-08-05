import { TraceId } from './trace';

export interface IScopedLogger {
    logObjectWithTraceId(data: unknown): void;

    logWithTraceId(text: string): void;

    errorWithTraceId(errorObj: unknown, extraData?: unknown): void;
}

export interface ILogger {
    createScope(
        botName: string,
        traceId: TraceId,
        chatName: string
    ): IScopedLogger;

    logObjectWithTraceId(
        botName: string,
        traceId: TraceId,
        chatName: string,
        data: unknown
    ): void;

    logWithTraceId(
        botName: string,
        traceId: TraceId,
        chatName: string,
        text: string
    ): void;

    errorWithTraceId(
        botName: string,
        traceId: TraceId,
        chatName: string,
        errorObj: unknown,
        extraData?: unknown
    ): void;
}
