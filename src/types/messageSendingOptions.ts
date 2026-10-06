import { InlineKeyboardButton } from './botApi.generated';

export interface TextMessageSendingOptions {
    disableWebPreview?: boolean;
    keyboard?: InlineKeyboardButton[][];
}
