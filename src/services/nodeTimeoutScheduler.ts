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
    }

    createTask(
        name: string,
        action: () => unknown,
        interval: Milliseconds,
        executeRightAway: boolean,
        ownerName: string
    ) {
        const traceId = createTrace(this, this.botName, name);
        const taskId = setInterval(() => {
            action();
            this.eventEmitter.emit(BotEventType.taskRun, {
                name,
                ownerName,
                interval,
                traceId
            });
        }, interval);
        const task = new TaskRecord(name, taskId, interval, traceId);

        if (executeRightAway) {
            setImmediate(action);
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
        setTimeout(actionWrapper, delay);

        this.eventEmitter.emit(BotEventType.taskCreated, {
            name,
            ownerName,
            delay,
            traceId
        });
    }
}
