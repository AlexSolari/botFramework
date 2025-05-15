import { TraceId } from './trace';

export interface ILogger {
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
