export interface IReplyMessage<TType> {
    content: TType;
    chatId: number;
    replyId: number | undefined;
    traceId: number | string;
    disableWebPreview: boolean;
}
