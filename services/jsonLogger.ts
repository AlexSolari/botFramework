import { ILogger, IScopedLogger } from '../types/logger';
import { TraceId } from '../types/trace';

export class JsonLogger implements ILogger {
    private serializeError(error: unknown): string {
        if (error instanceof Error) {
            const plainObject: Record<string, unknown> = {
                name: error.name,
                message: error.message,
                stack: error.stack
            };

            for (const [key, value] of Object.entries(error)) {
                plainObject[key] = value;
            }

            return JSON.stringify(plainObject);
        }

        return JSON.stringify({ error });
    }

    private getCircularReplacer() {
        const cache = new Set();
        return <T>(_: string, value: T) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value)) {
                    return;
                }

                cache.add(value);
            }
            return value;
        };
    }

    createScope(botName: string, traceId: TraceId, chatName: string) {
        return {
            logObjectWithTraceId: (data: unknown) => {
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
        data: unknown
    ) {
        const enrichedData =
            typeof data == 'object'
                ? {
                      ...data,
                      botName,
                      traceId,
                      chatName
                  }
                : {
                      botName,
                      traceId,
                      chatName,
                      data
                  };

        console.log(enrichedData);
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
            ? `,"extraData":${JSON.stringify(
                  extraData,
                  this.getCircularReplacer()
              )}`
            : '';

        console.error(
            `{"botName":"${botName}","traceId":"${traceId}","chatName":"${chatName}","error":${this.serializeError(
                errorObj
            )}${dataString}}`
        );
    }
}
