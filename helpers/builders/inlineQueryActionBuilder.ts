import { InlineQueryHandler } from '../../types/handlers';
import { Noop } from '../noop';
import { InlineQueryAction } from '../../entities/actions/inlineQueryAction';
import { InlineActionPropertyProvider } from '../../types/propertyProvider';

/**
 * Builder for `InlineQueryAction`
 */
export class InlineQueryActionBuilder {
    private readonly name: string;
    private pattern: RegExp = /.+/gi;

    private activeProvider: InlineActionPropertyProvider<boolean> = () => true;
    private handler: InlineQueryHandler = Noop.call;

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
        this.activeProvider = () => false;

        return this;
    }

    /**
     * Configures action to use property value providers instead of static value to allow changes in runtime
     */
    withConfiguration(configuration: {
        isActiveProvider?: InlineActionPropertyProvider<boolean>;
    }) {
        if (configuration.isActiveProvider)
            this.activeProvider = configuration.isActiveProvider;

        return this;
    }

    /** Builds action */
    build() {
        return new InlineQueryAction(
            this.handler,
            this.name,
            this.activeProvider,
            this.pattern
        );
    }
}
