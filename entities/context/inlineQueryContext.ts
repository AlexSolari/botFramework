import { InlineQueryResult } from 'telegraf/types';
import { IScopedLogger } from '../../types/logger';
import { BotResponse } from '../../types/response';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { TraceId } from '../../types/trace';
import { InlineQueryAction } from '../actions/inlineQueryAction';
import { InlineQueryResponse } from '../../dtos/responses/inlineQueryResponse';

export class InlineQueryContext {
    action!: InlineQueryAction;
    queryResults: InlineQueryResult[] = [];

    /** Storage client instance for the bot executing this action. */
    readonly storage: IStorageClient;
    /** Scheduler instance for the bot executing this action */
    readonly scheduler: IScheduler;

    /** Logger instance for the bot executing this action */
    logger!: IScopedLogger;
    /** Trace id of a action execution. */
    traceId!: TraceId;
    /** Name of a bot that executes this action. */
    botName!: string;
    /**
     * Abort signal to be utilized in query handler.
     * Signal will be aborted if new query comes from the same user.
     */
    abortSignal!: AbortSignal;

    /** Ordered collection of responses to be processed  */
    get responses(): BotResponse[] {
        return [
            new InlineQueryResponse(
                this.queryResults,
                this.queryId,
                this.traceId,
                this.action
            )
        ];
    }
    /** Inline query text */
    queryText!: string;
    /** Internal query id */
    queryId!: string;
    /** Collection of Regexp match results on a message that triggered this action. Will be empty if trigger is not a Regexp. */
    matchResults: RegExpMatchArray[] = [];

    isInitialized = false;

    constructor(storage: IStorageClient, scheduler: IScheduler) {
        this.storage = storage;
        this.scheduler = scheduler;
    }

    /**
     * This result will be shown to user as a response to inline query.
     * @param queryResult Inline query result to be shown to user.
     */
    showInlineQueryResult(queryResult: InlineQueryResult) {
        this.queryResults.push(queryResult);
    }
}
