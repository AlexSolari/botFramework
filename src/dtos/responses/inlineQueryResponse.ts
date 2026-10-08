import { InlineQueryActionInternal } from '../../entities/actions/inlineQueryAction';
import { InlineQueryResult } from '../../types/botApi.generated';
import { BotResponseTypes } from '../../types/response';
import { TraceId } from '../../types/trace';

export class InlineQueryResponse {
    readonly kind = BotResponseTypes.inlineQuery;
    readonly createdAt = Date.now();

    readonly queryId: string;
    readonly traceId: TraceId;
    readonly action: InlineQueryActionInternal;
    readonly queryResults: InlineQueryResult[];

    constructor(
        queryResult: InlineQueryResult[],
        queryId: string,
        traceId: TraceId,
        action: InlineQueryActionInternal
    ) {
        this.queryResults = queryResult;
        this.queryId = queryId;
        this.traceId = traceId;
        this.action = action;
    }
}
