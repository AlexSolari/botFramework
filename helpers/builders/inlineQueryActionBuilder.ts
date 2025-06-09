import { InlineQueryHandler } from '../../types/handlers';
import { Seconds } from '../../types/timeValues';
import { Noop } from '../noop';
import { InlineQueryAction } from '../../entities/actions/inlineQueryAction';

/**
 * Builder for `InlineQueryAction`
 */
export class InlineQueryActionBuilder {
    name: string;
    pattern: RegExp = /.+/gi;

    active = true;
    cooldownSeconds: Seconds = 0 as Seconds;
    blacklist: number[] = [];
    allowedUsers: number[] = [];
    handler: InlineQueryHandler = Noop.call;

    /**
     * Builder for `InlineQueryAction`
     * @param name Action name, will be used for logging and storage
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * Defines action pattern to check if action should be executed, if not setup, check will default to true
     * @param trigger RegExp to check
     */
    on(pattern: RegExp) {
        this.pattern = pattern;

        return this;
    }

    /** Defines action logic itself, will be executed.
     * @param handler Callback that will be called
     */
    do(handler: InlineQueryHandler) {
        this.handler = handler;

        return this;
    }

    /** If called during building, action is marked as disabled and never checked. */
    disabled() {
        this.active = false;

        return this;
    }

    /** Builds action */
    build() {
        return new InlineQueryAction(
            this.handler,
            this.name,
            this.active,
            this.pattern
        );
    }
}
