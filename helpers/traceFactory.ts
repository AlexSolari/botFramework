import { TraceId } from '../types/trace';

export function createTrace(
    traceOwner: object | string,
    botName: string,
    traceName: string
) {
    return `${
        typeof traceOwner == 'string' ? traceOwner : traceOwner.constructor.name
    }:${botName}-${traceName}` as TraceId;
}
