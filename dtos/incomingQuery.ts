import { TraceId } from '../types/trace';

export class IncomingInlineQuery {
    readonly queryId: string;
    readonly query: string;
    readonly userId: number;
    readonly traceId: TraceId;

    constructor(
        queryId: string,
        query: string,
        userId: number,
        traceId: TraceId
    ) {
        this.queryId = queryId;
        this.query = query;
        this.userId = userId;
        this.traceId = traceId;
    }
}
