import { Milliseconds } from '../types/timeValues';

export class TaskRecord {
    readonly name: string;
    readonly taskId: NodeJS.Timeout;
    readonly interval: Milliseconds;

    constructor(name: string, taskId: NodeJS.Timeout, interval: Milliseconds) {
        this.name = name;
        this.taskId = taskId;
        this.interval = interval;
    }
}
