import { InlineQueryResult } from 'telegraf/types';
import { BotResponse } from '../../types/response';
import { InlineQueryAction } from '../actions/inlineQueryAction';
import { InlineQueryResponse } from '../../dtos/responses/inlineQueryResponse';
import {
    BaseContextInternal,
    BaseContextPropertiesToOmit
} from './baseContext';

export type InlineQueryContext = Omit<
    InlineQueryContextInternal,
    BaseContextPropertiesToOmit | 'queryResults' | 'queryId'
>;

export class InlineQueryContextInternal extends BaseContextInternal<InlineQueryAction> {
    queryResults: InlineQueryResult[] = [];
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

    /**
     * This result will be shown to user as a response to inline query.
     * @param queryResult Inline query result to be shown to user.
     */
    showInlineQueryResult(queryResult: InlineQueryResult) {
        this.queryResults.push(queryResult);
    }
}
