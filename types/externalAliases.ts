import {
    User,
    Message,
    InlineQueryResult,
    TelegramEmoji as Emoji,
    UserFromGetMe
} from 'telegraf/typings/core/types/typegram';
import { Telegraf } from 'telegraf';
import Telegram from 'telegraf/typings/telegram';

export type TelegramUser = User;
export type TelegramMessage = Message;
export type TelegramInlineQueryResult = InlineQueryResult;
export type TelegramEmoji = Emoji;
export type TelegramApiClient = Telegram;
export type BotInfo = UserFromGetMe;
export type TelegramBot = Telegraf;
