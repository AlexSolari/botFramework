import { MessageInfo } from '../dtos/messageInfo';

type ContextWithMessageInfo = {
    readonly messageInfo: MessageInfo;
    readonly matchResults: RegExpMatchArray[];
};

export function getQuotedText(
    context: ContextWithMessageInfo,
    quote: boolean | string
) {
    if (typeof quote != 'boolean') return quote;

    return context.matchResults.length == 0 ||
        context.matchResults[0].length <= 1
        ? context.messageInfo.text
        : context.matchResults[0][1];
}
