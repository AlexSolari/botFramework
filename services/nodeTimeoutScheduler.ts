import { TaskRecord } from '../entities/taskRecord';
import { createTrace } from '../helpers/traceFactory';
import { ILogger } from '../types/logger';
import { IScheduler } from '../types/scheduler';
import { Milliseconds } from '../types/timeValues';

export class NodeTimeoutScheduler implements IScheduler {
    private readonly logger!: ILogger;
    readonly activeTasks: TaskRecord[] = [];

    constructor(logger: ILogger) {
        this.logger = logger;
    }

    stopAll() {
        this.activeTasks.forEach((task) => {
            clearInterval(task.taskId);
        });
    }

    createTask(
        name: string,
        action: () => unknown,
        interval: Milliseconds,
        executeRightAway: boolean,
        ownerName: string
    ) {
        const taskId = setInterval(action, interval);
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
            action();
        };
        setTimeout(actionWrapper, delay);

        this.logger.logWithTraceId(
            ownerName,
            createTrace(this, ownerName, name),
            'System',
            `Created oneshot task ${name}, that will run in ${delay}ms.`
        );
    }
}
