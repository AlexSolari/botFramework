import { InlineQueryAction } from '../actions/inlineQueryAction';
import {
    BaseContextInternal,
    BaseContextPropertiesToOmit
} from './baseContext';
import { TelegramInlineQueryResult } from '../../types/externalAliases';
import { TypedEventEmitter } from '../../types/events';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { ChatInfo } from '../../dtos/chatInfo';
import { IncomingInlineQuery } from '../../dtos/incomingQuery';

export type InlineQueryContext = Omit<
    InlineQueryContextInternal,
    BaseContextPropertiesToOmit | 'queryResults' | 'queryId'
>;

export class InlineQueryContextInternal extends BaseContextInternal<InlineQueryAction> {
    readonly queryResults: TelegramInlineQueryResult[] = [];
    /**
     * Abort signal to be utilized in query handler.
     * Signal will be aborted if new query comes from the same user.
     */
    readonly abortSignal: AbortSignal;
    /** Inline query text */
    readonly queryText: string;
    /** Internal query id */
    readonly queryId: string;
    /** Collection of Regexp match results on a message that triggered this action. Will be empty if trigger is not a Regexp. */
    matchResults: RegExpMatchArray[] = [];

    constructor(
        storage: IStorageClient,
        scheduler: IScheduler,
        eventEmitter: TypedEventEmitter,
        action: InlineQueryAction,
        query: IncomingInlineQuery,
        chatInfo: ChatInfo,
        botName: string
    ) {
        super(
            storage,
            scheduler,
            eventEmitter,
            action,
            chatInfo,
            query.traceId,
            botName
        );

        this.queryText = query.query;
        this.queryId = query.queryId;
        this.abortSignal = query.abortController.signal;
    }

    /**
     * This result will be shown to user as a response to inline query.
     * @param queryResult Inline query result to be shown to user.
     */
    showInlineQueryResult(queryResult: TelegramInlineQueryResult) {
        this.queryResults.push(queryResult);
    }
}
