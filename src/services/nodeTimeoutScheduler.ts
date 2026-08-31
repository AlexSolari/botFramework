import { TaskRecord } from '../entities/taskRecord';
import { createTrace } from '../helpers/traceFactory';
import { BotEventType, TypedEventEmitter } from '../types/events';
import { IScheduler } from '../types/scheduler';
import { Milliseconds } from '../types/timeValues';

export class NodeTimeoutScheduler implements IScheduler {
    readonly activeTasks: TaskRecord[] = [];

    constructor(
        readonly eventEmitter: TypedEventEmitter,
        readonly botName: string
    ) {}

    stopAll() {
        for (const task of this.activeTasks) {
            clearInterval(task.taskId);
        }

        this.activeTasks.length = 0;
    }

    createTask(
        name: string,
        action: () => unknown,
        interval: Milliseconds,
        executeRightAway: boolean,
        ownerName: string
    ) {
        const traceId = createTrace(this, this.botName, name);
        const runAndEmit = () => {
            action();
            this.eventEmitter.emit(BotEventType.taskRun, {
                name,
                ownerName,
                interval,
                traceId
            });
        };

        const taskId = setInterval(runAndEmit, interval);
        const task = new TaskRecord(name, taskId, interval, traceId);

        if (executeRightAway) {
            setImmediate(runAndEmit);
        }

        this.eventEmitter.emit(BotEventType.taskCreated, {
            name,
            ownerName,
            interval,
            traceId
        });

        this.activeTasks.push(task);
    }

    createOnetimeTask(
        name: string,
        action: () => unknown,
        delay: Milliseconds,
        ownerName: string
    ) {
        const traceId = createTrace(this, this.botName, name);
        const actionWrapper = () => {
            this.eventEmitter.emit(BotEventType.taskRun, {
                name,
                ownerName,
                delay,
                traceId
            });
            action();
        };

        const handle = setTimeout(() => {
            this.activeTasks.splice(this.activeTasks.indexOf(task), 1);
            actionWrapper();
        }, delay);
        const task = new TaskRecord(name, handle, delay, traceId);
        this.activeTasks.push(task);

        this.eventEmitter.emit(BotEventType.taskCreated, {
            name,
            ownerName,
            delay,
            traceId
        });
    }
}
