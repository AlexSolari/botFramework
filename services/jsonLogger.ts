/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ILogger, IScopedLogger } from '../types/logger';
import { TraceId } from '../types/trace';

export class JsonLogger implements ILogger {
    private serializeError(error: any) {
        const plainObject: Record<string, unknown> = {};
        Object.getOwnPropertyNames(error).forEach(function (key) {
            plainObject[key] = error[key];
        });
        return JSON.stringify(plainObject);
    }

    createScope(botName: string, traceId: TraceId, chatName: string) {
        return {
            logObjectWithTraceId: (data: any) => {
                this.logObjectWithTraceId(botName, traceId, chatName, data);
            },
            logWithTraceId: (text: string) => {
                this.logWithTraceId(botName, traceId, chatName, text);
            },
            errorWithTraceId: (errorObj: unknown, extraData?: unknown) => {
                this.errorWithTraceId(
                    botName,
                    traceId,
                    chatName,
                    errorObj,
                    extraData
                );
            }
        } as IScopedLogger;
    }

    logObjectWithTraceId(
        botName: string,
        traceId: TraceId,
        chatName: string,
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

    errorWithTraceId(
        botName: string,
        traceId: TraceId,
        chatName: string,
        errorObj: unknown,
        extraData?: unknown
    ) {
        const dataString = extraData
            ? `,"extraData":${JSON.stringify(extraData)}`
            : '';

        console.error(
            `{"botName":"${botName}","traceId":"${traceId}","chatName":"${chatName}","error":${this.serializeError(
                errorObj
            )}${dataString}}`
        );
    }
}
