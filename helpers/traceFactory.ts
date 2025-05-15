import { TraceId } from '../types/trace';

export function createTrace<T extends object>(
    traceOwner: T,
    botName: string,
    traceName: string
) {
    return `${traceOwner.constructor.name}:${botName}-${traceName}` as TraceId;
}
