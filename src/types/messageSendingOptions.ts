import { TelegramInlineKeyboardButton } from './externalAliases';

export interface MessageSendingOptions {
    pin?: boolean;
}

export interface TextMessageSendingOptions extends MessageSendingOptions {
    disableWebPreview?: boolean;
    keyboard?: TelegramInlineKeyboardButton[][];
}
