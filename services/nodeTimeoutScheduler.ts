import { TaskRecord } from '../entities/taskRecord';
import { createTrace } from '../helpers/traceFactory';
import { BotEventType, TypedEventEmitter } from '../types/events';
import { ILogger } from '../types/logger';
import { IScheduler } from '../types/scheduler';
import { Milliseconds } from '../types/timeValues';

export class NodeTimeoutScheduler implements IScheduler {
    readonly activeTasks: TaskRecord[] = [];

    constructor(
        readonly logger: ILogger,
        readonly eventEmitter: TypedEventEmitter
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
        const taskId = setInterval(() => {
            action();
            this.eventEmitter.emit(BotEventType.taskRun, {
                name,
                ownerName,
                interval
            });
        }, interval);
        const task = new TaskRecord(name, taskId, interval);

        if (executeRightAway) {
            setImmediate(action);
        }

        this.logger.logWithTraceId(
            ownerName,
            createTrace(this, ownerName, name),
            'System',
            `Created task ${name}, that will run every ${interval}ms.`
        );
        this.eventEmitter.emit(BotEventType.taskCreated, {
            name,
            ownerName,
            interval
        });

        this.activeTasks.push(task);
    }

    createOnetimeTask(
        name: string,
        action: () => unknown,
        delay: Milliseconds,
        ownerName: string
    ) {
        const actionWrapper = () => {
            this.logger.logWithTraceId(
                ownerName,
                createTrace(this, ownerName, name),
                'System',
                `Executing delayed oneshot ${name}`
            );
            this.eventEmitter.emit(BotEventType.taskRun, {
                name,
                ownerName,
                delay
            });
            action();
        };
        setTimeout(actionWrapper, delay);

        this.logger.logWithTraceId(
            ownerName,
            createTrace(this, ownerName, name),
            'System',
            `Created oneshot task ${name}, that will run in ${delay}ms.`
        );
        this.eventEmitter.emit(BotEventType.taskCreated, {
            name,
            ownerName,
            delay
        });
    }
}
