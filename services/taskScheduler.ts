import { TaskRecord } from '../entities/taskRecord';
import { secondsToMilliseconds } from '../helpers/timeConvertions';
import { Milliseconds, Seconds } from '../types/timeValues';
import { Logger } from './logger';

class TaskScheduler {
    activeTasks: TaskRecord[] = [];

    stopAll() {
        this.activeTasks.forEach((task) => {
            clearInterval(task.taskId);
        });
    }

    createTask(
        name: string,
        action: () => void,
        interval: Milliseconds,
        executeRightAway: boolean,
        ownerName: string
    ) {
        executeRightAway = executeRightAway ?? false;
        const taskId = setInterval(action, interval);
        const task = new TaskRecord(name, taskId, interval);

        if (executeRightAway) {
            setTimeout(action, secondsToMilliseconds(1 as Seconds));
        }

        Logger.logWithTraceId(
            ownerName,
            `System:TaskScheduler-${ownerName}-${name}`,
            'System',
            `Created task [${taskId}]${name}, that will run every ${interval}ms.`
        );

        this.activeTasks.push(task);
    }

    createOnetimeTask(
        name: string,
        action: () => void,
        delay: Milliseconds,
        ownerName: string
    ) {
        const actionWrapper = () => {
            Logger.logWithTraceId(
                ownerName,
                `System:TaskScheduler-${ownerName}-${name}`,
                'System',
                `Executing delayed oneshot [${taskId}]${name}`
            );
            action();
        };
        const taskId = setTimeout(actionWrapper, delay);

        Logger.logWithTraceId(
            ownerName,
            `System:TaskScheduler-${ownerName}-${name}`,
            'System',
            `Created oneshot task [${taskId}]${name}, that will run in ${delay}ms.`
        );
    }
}

export const Scheduler = new TaskScheduler();
