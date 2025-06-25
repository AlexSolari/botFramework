import { Noop } from '../../helpers/noop';
import { ActionKey, IAction } from '../../types/action';
import { InlineQueryContext } from '../context/inlineQueryContext';
import { InlineQueryHandler } from '../../types/handlers';

export class InlineQueryAction implements IAction {
    readonly key: ActionKey;
    readonly active: boolean;
    readonly handler: InlineQueryHandler;
    readonly name: string;
    readonly pattern: RegExp;

    constructor(
        handler: InlineQueryHandler,
        name: string,
        active: boolean,
        pattern: RegExp
    ) {
        this.handler = handler;
        this.name = name;
        this.active = active;
        this.pattern = pattern;

        this.key = `inline:${this.name.replace('.', '-')}` as ActionKey;
    }

    async exec(ctx: InlineQueryContext) {
        if (!ctx.isInitialized)
            throw new Error(
                `Context for ${this.key} is not initialized or already consumed`
            );

        if (!this.active) return Noop.NoResponse;

        const matchResults: RegExpExecArray[] = [];

        this.pattern.lastIndex = 0;

        const execResult = this.pattern.exec(ctx.queryText);
        if (execResult != null) {
            matchResults.push(execResult);

            if (this.pattern.global) {
                while (true) {
                    const nextResult = this.pattern.exec(ctx.queryText);
                    if (nextResult == null) break;
                    matchResults.push(nextResult);
                }
            }
        }

        if (matchResults.length == 0) return Noop.NoResponse;

        ctx.matchResults = matchResults;

        ctx.logger.logWithTraceId(` - Executing [${this.name}]`);

        await this.handler(ctx);

        return ctx.responses;
    }
}
