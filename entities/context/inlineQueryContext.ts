import { InlineQueryResult } from 'telegraf/types';
import { ILogger } from '../../types/logger';
import { BotResponse } from '../../types/response';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { TraceId } from '../../types/trace';
import { InlineQueryAction } from '../actions/inlineQueryAction';
import { InlineQueryResponse } from '../../dtos/responses/inlineQueryResponse';

export class InlineQueryContext {
    private action!: InlineQueryAction;
    private queryResults: InlineQueryResult[] = [];

    /** Storage client instance for the bot executing this action. */
    readonly storage: IStorageClient;
    /** Logger instance for the bot executing this action */
    readonly logger: ILogger;
    /** Scheduler instance for the bot executing this action */
    readonly scheduler: IScheduler;

    /** Trace id of a action execution. */
    traceId!: TraceId;
    /** Name of a bot that executes this action. */
    botName!: string;

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

    constructor(
        storage: IStorageClient,
        logger: ILogger,
        scheduler: IScheduler
    ) {
        this.storage = storage;
        this.logger = logger;
        this.scheduler = scheduler;
    }

    initializeContext(
        queryText: string,
        queryId: string,
        botName: string,
        action: InlineQueryAction,
        traceId: TraceId
    ) {
        this.queryText = queryText;
        this.queryId = queryId;
        this.botName = botName;
        this.action = action;
        this.traceId = traceId;

        this.isInitialized = true;
        this.queryResults = [];
        this.matchResults = [];

        return this;
    }

    /**
     * This result will be shown to user as a response to inline query.
     * @param queryResult Inline query result to be shown to user.
     */
    showInlineQueryResult(queryResult: InlineQueryResult) {
        this.queryResults.push(queryResult);
    }
}
