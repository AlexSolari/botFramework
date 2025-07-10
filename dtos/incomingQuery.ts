import { TraceId } from '../types/trace';

export class IncomingInlineQuery {
    readonly abortController: AbortController;

    constructor(
        readonly queryId: string,
        readonly query: string,
        readonly userId: number,
        readonly traceId: TraceId
    ) {
        this.abortController = new AbortController();
    }
}
