import { InputFile, Message } from 'telegraf/types';
import { ChatContext } from '../entities/context/chatContext';
import { MessageContext } from '../entities/context/messageContext';
import { reverseRecord } from '../helpers/reverseRecord';
import { IStorageClient } from '../types/storage';
import { Logger } from './logger';
import { Reaction } from '../entities/responses/reaction';
import { IncomingMessage } from '../entities/incomingMessage';
import { BotResponse, IReplyMessage } from '../types/response';
import { UnpinResponse } from '../entities/responses/unpin';
import { TextMessage } from '../entities/responses/textMessage';
import { VideoMessage } from '../entities/responses/videoMessage';
import { ImageMessage } from '../entities/responses/imageMessage';
import { Telegram } from 'telegraf/typings/telegram';
import { setTimeout } from 'timers/promises';
import { Milliseconds } from '../types/timeValues';
import { ScheduledAction } from '../entities/actions/scheduledAction';
import { IActionState } from '../types/actionState';
import { CommandAction } from '../entities/actions/commandAction';

export class TelegramApiService {
    isFlushing = false;
    messageQueue: Array<BotResponse> = [];

    botName: string;
    telegram: Telegram;
    chats: Record<number, string>;
    storage: IStorageClient;

    constructor(
        botName: string,
        telegram: Telegram,
        storage: IStorageClient,
        chats: Record<string, number>
    ) {
        this.telegram = telegram;
        this.botName = botName;
        this.chats = reverseRecord(chats);
        this.storage = storage;
    }

    async flushResponses() {
        if (this.isFlushing) return;

        this.isFlushing = true;

        while (this.messageQueue.length) {
            const message = this.messageQueue.pop();

            if (!message) break;

            try {
                await this.processResponse(message);
                await setTimeout(100 as Milliseconds);
            } catch (error) {
                Logger.errorWithTraceId(
                    this.botName,
                    message.traceId,
                    this.chats[message.chatId],
                    error,
                    message
                );
            }
        }

        this.isFlushing = false;
    }

    private async pinIfShould<T>(
        response: IReplyMessage<T>,
        sentMessage: Message
    ) {
        if (response.shouldPin) {
            await this.telegram.pinChatMessage(
                response.chatId,
                sentMessage.message_id,
                { disable_notification: true }
            );

            await this.storage.updateStateFor(
                response.sourceActionKey,
                response.chatId,
                async (state) => {
                    state.pinnedMessages.push(sentMessage.message_id);
                }
            );
        }
    }

    private async processResponse(response: BotResponse) {
        let sentMessage: Message;

        switch (response.kind) {
            case 'text':
                sentMessage = await this.telegram.sendMessage(
                    response.chatId,
                    response.content as string,
                    {
                        reply_to_message_id: response.replyId,
                        parse_mode: 'MarkdownV2',
                        disable_web_page_preview: response.disableWebPreview
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any
                );

                await this.pinIfShould(response, sentMessage);
                break;
            case 'image':
                sentMessage = await this.telegram.sendPhoto(
                    response.chatId,
                    response.content as InputFile,
                    response.replyId
                        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          ({ reply_to_message_id: response.replyId } as any)
                        : undefined
                );

                await this.pinIfShould(response, sentMessage);
                break;
            case 'video':
                sentMessage = await this.telegram.sendVideo(
                    response.chatId,
                    response.content as InputFile,
                    response.replyId
                        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          ({ reply_to_message_id: response.replyId } as any)
                        : undefined
                );

                await this.pinIfShould(response, sentMessage);
                break;
            case 'react':
                await this.telegram.setMessageReaction(
                    response.chatId,
                    response.messageId,
                    [
                        {
                            type: 'emoji',
                            emoji: response.emoji
                        }
                    ],
                    true
                );

                return;
            case 'unpin':
                await this.telegram.unpinChatMessage(
                    response.chatId,
                    response.messageId
                );

                await this.storage.updateStateFor(
                    response.sourceActionKey,
                    response.chatId,
                    async (state) => {
                        state.pinnedMessages = state.pinnedMessages.filter(
                            (x) => x != response.messageId
                        );
                    }
                );
                break;
        }
    }

    private enqueue(response: BotResponse) {
        this.messageQueue.push(response);
    }

    private getInteractions() {
        return {
            react: (reaction) => this.enqueue(reaction),
            respond: (response) => this.enqueue(response),
            unpin: (unpinMessage) => this.enqueue(unpinMessage)
        } as IBotApiInteractions;
    }

    createContextForMessage<TActionState extends IActionState>(
        incomingMessage: IncomingMessage,
        command: CommandAction<TActionState>
    ) {
        const firstName = incomingMessage.from?.first_name ?? 'Unknown user';
        const lastName = incomingMessage.from?.last_name
            ? ` ${incomingMessage.from?.last_name}`
            : '';

        return new MessageContext<TActionState>(
            this.botName,
            command.key,
            this.getInteractions(),
            incomingMessage.chat.id,
            incomingMessage.chatName,
            incomingMessage.message_id,
            incomingMessage.text,
            incomingMessage.from?.id,
            incomingMessage.traceId,
            firstName + lastName,
            this.storage
        );
    }

    createContextForChat<TActionState extends IActionState>(
        chatId: number,
        scheduledAction: ScheduledAction<TActionState>
    ) {
        return new ChatContext<TActionState>(
            this.botName,
            scheduledAction.key,
            this.getInteractions(),
            chatId,
            this.chats[chatId],
            `Scheduled:${scheduledAction.key}:${chatId}`,
            this.storage
        );
    }
}

export interface IBotApiInteractions {
    respond: (response: TextMessage | VideoMessage | ImageMessage) => void;
    react: (reaction: Reaction) => void;
    unpin: (unpinMessage: UnpinResponse) => void;
}
