export class ReplyInfo {
    readonly id: number;
    readonly quote: string | undefined;

    constructor(id: number, quote?: string) {
        this.id = id;
        this.quote = quote;
    }
}
