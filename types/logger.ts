import { TraceId } from './trace';

export interface IScopedLogger {
    logObjectWithTraceId(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any
    ): void;

    logWithTraceId(text: string): void;

    errorWithTraceId<TData>(
        errorObj: unknown,
        extraData?: TData | undefined
    ): void;
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any
    ): void;

    logWithTraceId(
        botName: string,
        traceId: TraceId,
        chatName: string,
        text: string
    ): void;

    errorWithTraceId<TData>(
        botName: string,
        traceId: TraceId,
        chatName: string,
        errorObj: unknown,
        extraData?: TData | undefined
    ): void;
}
