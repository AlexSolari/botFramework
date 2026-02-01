import { Milliseconds } from '../types/timeValues';
import { TraceId } from '../types/trace';

export class TaskRecord {
    constructor(
        readonly name: string,
        readonly taskId: NodeJS.Timeout,
        readonly interval: Milliseconds,
        readonly traceId: TraceId
    ) {}
}
