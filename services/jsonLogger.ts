import { ILogger } from '../types/logger';
import { TraceId } from '../types/trace';

export class JsonLogger implements ILogger {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private serializeError(error: any) {
        const plainObject: Record<string, unknown> = {};
        Object.getOwnPropertyNames(error).forEach(function (key) {
            plainObject[key] = error[key];
        });
        return JSON.stringify(plainObject);
    }

    logObjectWithTraceId(
        botName: string,
        traceId: TraceId,
        chatName: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any
    ) {
        data.botName = botName;
        data.traceId = traceId;
        data.chatName = chatName;
        console.log(data);
    }

    logWithTraceId(
        botName: string,
        traceId: TraceId,
        chatName: string,
        text: string
    ) {
        console.log(
            `{"botName":"${botName}","traceId":"${traceId}","chatName":"${chatName}","text":"${text}"}`
        );
    }

    errorWithTraceId<TData>(
        botName: string,
        traceId: TraceId,
        chatName: string,
        errorObj: unknown,
        extraData?: TData | undefined
    ) {
        console.error(
            `{"botName":"${botName}","traceId":"${traceId}","chatName":"${chatName}","error":${this.serializeError(
                errorObj
            )}${extraData ? `,"extraData":${JSON.stringify(extraData)}` : ''}}`
        );
    }
}
