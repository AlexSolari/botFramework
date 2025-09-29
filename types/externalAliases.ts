import { Telegram, Telegraf } from 'telegraf';
import {
    User,
    Message,
    InlineQueryResult,
    UserFromGetMe,
    TelegramEmoji as Emoji,
    InlineKeyboardButton
} from 'telegraf/types';

export type TelegramUser = User;
export type TelegramMessage = Message;
export type TelegramInlineQueryResult = InlineQueryResult;
export type TelegramEmoji = Emoji;
export type TelegramApiClient = Telegram;
export type BotInfo = UserFromGetMe;
export type TelegramBot = Telegraf;
export type TelegramInlineKeyboardButton = InlineKeyboardButton;
