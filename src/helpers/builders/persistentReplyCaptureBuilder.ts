import { PersistentReplyCapture } from '../../entities/persistentReplyCapture';
import { CommandTrigger } from '../../types/commandTrigger';
import { PersistentReplyHandler } from '../../types/handlers';
import { Milliseconds } from '../../types/timeValues';
import { Noop } from '../noop';
import { toArray } from '../toArray';

/**
 * Builder for `PersistentReplyCapture` with capture data represented by `TData`.
 * Data must be JSON-serializable, since it is saved to storage and restored after a restart.
 */
export class PersistentReplyCaptureBuilder<TData extends object> {
    private readonly name: string;
    private trigger: CommandTrigger | CommandTrigger[] = [];
    private handler: PersistentReplyHandler<TData> = Noop.call;
    private expiresAfterValue: Milliseconds | undefined;
    private maxAllowedSimultaniousExecutions: number = 0;

    /**
     * Builder for `PersistentReplyCapture` with capture data represented by `TData`.
     * @param name Capture name, will be used for logging and storage. Must be unique within a bot.
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * Defines replies that activate the handler. Works like command triggers, including message types.
     * @param trigger Trigger or triggers to match replies against.
     */
    on(trigger: CommandTrigger | CommandTrigger[]) {
        this.trigger = trigger;

        return this;
    }

    /** Defines capture logic, executed on every matching reply.
     * @param handler Callback that will be called on a matching reply. Call `stopCapture()` on its context to stop the capture.
     */
    do(handler: PersistentReplyHandler<TData>) {
        this.handler = handler;

        return this;
    }

    /**
     * Stops captures automatically once they are older than the given time.
     * @param timeout Time in milliseconds since the capture was started.
     */
    expiresAfter(timeout: Milliseconds) {
        this.expiresAfterValue = timeout;

        return this;
    }

    /** Sets maximum number of simultaniously executing handlers per capture. 0 is treated as unlimited. */
    withRatelimit(maxAllowedSimultaniousExecutions: number) {
        this.maxAllowedSimultaniousExecutions =
            maxAllowedSimultaniousExecutions;

        return this;
    }

    /** Builds capture */
    build() {
        return new PersistentReplyCapture<TData>(
            this.name,
            toArray(this.trigger),
            this.handler,
            this.expiresAfterValue,
            this.maxAllowedSimultaniousExecutions
        );
    }
}
