class JsonLogger {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private serializeError(error: any) {
        const plainObject: Record<string, unknown> = {};
        Object.getOwnPropertyNames(error).forEach(function (key) {
            plainObject[key] = error[key];
        });
        return JSON.stringify(plainObject);
    }

    logWithTraceId(
        botName: string,
        traceId: string | number,
        chatName: string,
        text: string
    ) {
        console.log(JSON.stringify({ botName, traceId, chatName, text }));
    }

    errorWithTraceId<TData>(
        botName: string,
        traceId: string | number,
        chatName: string,
        errorObj: unknown,
        extraData?: TData | undefined
    ) {
        console.error(
            JSON.stringify({
                botName,
                traceId,
                chatName,
                error: this.serializeError(errorObj),
                extraData
            })
        );
    }
}

export const Logger = new JsonLogger();
