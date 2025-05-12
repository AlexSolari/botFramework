import { TextMessageSendingOptions } from '../../types/messageSendingOptions';
import { BotResponseTypes, IReplyMessage } from '../../types/response';
import { IActionWithState } from '../../types/actionWithState';
import { IActionState } from '../../types/actionState';

export class TextMessage implements IReplyMessage<string> {
    kind = BotResponseTypes.text;

    content: string;
    chatId: number;
    replyId: number | undefined;
    traceId: string | number;
    disableWebPreview: boolean;
    shouldPin: boolean;
    action: IActionWithState<IActionState>;

    constructor(
        text: string,
        chatId: number,
        replyId: number | undefined,
        traceId: string | number,
        action: IActionWithState<IActionState>,
        options?: TextMessageSendingOptions
    ) {
        this.content = text;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
        this.disableWebPreview = options?.disableWebPreview ?? false;
        this.shouldPin = options?.pin ?? false;
        this.action = action;
    }
}
