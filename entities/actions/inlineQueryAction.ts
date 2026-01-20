import { Noop } from '../../helpers/noop';
import { ActionKey, IAction } from '../../types/action';
import { InlineQueryContextInternal } from '../context/inlineQueryContext';
import { InlineQueryHandler } from '../../types/handlers';
import { InlineActionPropertyProvider } from '../../types/propertyProvider';
import { BotEventType } from '../../types/events';

export class InlineQueryAction implements IAction {
    readonly key: ActionKey;
    readonly isActiveProvider: InlineActionPropertyProvider<boolean>;
    readonly handler: InlineQueryHandler;
    readonly name: string;
    readonly pattern: RegExp;

    constructor(
        handler: InlineQueryHandler,
        name: string,
        activeProvider: InlineActionPropertyProvider<boolean>,
        pattern: RegExp
    ) {
        this.handler = handler;
        this.name = name;
        this.isActiveProvider = activeProvider;
        this.pattern = pattern;

        this.key = `inline:${this.name.replace('.', '-')}` as ActionKey;
    }

    async exec(ctx: InlineQueryContextInternal) {
        if (!ctx.isInitialized)
            throw new Error(
                `Context for ${this.key} is not initialized or already consumed`
            );

        if (!this.isActiveProvider(ctx)) return Noop.NoResponse;

        const matchResults: RegExpExecArray[] = [];

        this.pattern.lastIndex = 0;

        const execResult = this.pattern.exec(ctx.queryText);
        if (execResult != null) {
            let regexMatchLimit = 100;
            matchResults.push(execResult);

            if (this.pattern.global) {
                while (regexMatchLimit > 0) {
                    const nextResult = this.pattern.exec(ctx.queryText);

                    if (nextResult == null) break;

                    matchResults.push(nextResult);
                    regexMatchLimit -= 1;
                }
            }
        }

        if (matchResults.length == 0) return Noop.NoResponse;

        ctx.matchResults = matchResults;

        ctx.eventEmitter.emit(BotEventType.inlineActionExecuting, {
            action: this,
            ctx
        });

        await this.handler(ctx);

        ctx.eventEmitter.emit(BotEventType.inlineActionExecuted, {
            action: this,
            ctx
        });
        return ctx.responses;
    }
}
