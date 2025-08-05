import { InlineQueryResult } from 'node-telegram-bot-api';
import { InlineQueryAction } from '../../entities/actions/inlineQueryAction';
import { BotResponseTypes } from '../../types/response';
import { TraceId } from '../../types/trace';

export class InlineQueryResponse {
    readonly kind = BotResponseTypes.inlineQuery;
    readonly createdAt = Date.now();

    readonly queryId: string;
    readonly traceId: TraceId;
    readonly action: InlineQueryAction;
    readonly queryResults: InlineQueryResult[];

    constructor(
        queryResult: InlineQueryResult[],
        queryId: string,
        traceId: TraceId,
        action: InlineQueryAction
    ) {
        this.queryResults = queryResult;
        this.queryId = queryId;
        this.traceId = traceId;
        this.action = action;
    }
}
