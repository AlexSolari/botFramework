import { IncomingMessage } from '../../dtos/incomingMessage';
import { CommandAction } from '../../entities/actions/commandAction';
import { ReplyCaptureAction } from '../../entities/actions/replyCaptureAction';
import { MessageContextInternal } from '../../entities/context/messageContext';
import { ReplyContextInternal } from '../../entities/context/replyContext';
import { IActionState } from '../../types/actionState';
import { TelegramApiService } from '../telegramApi';
import { ChatInfo } from '../../dtos/chatInfo';
import {
    INTERNAL_MESSAGE_TYPE_PREFIX,
    MessageType
} from '../../types/messageTypes';
import { typeSafeObjectFromEntries } from '../../helpers/objectFromEntries';
import { BaseActionProcessor } from './baseProcessor';
import { getOrCreateIfNotExists } from '../../helpers/mapUtils';
import { ChatHistoryMessage } from '../../dtos/chatHistoryMessage';
import { BotInfo, TelegramBot } from '../../types/externalAliases';
import { BotEventType } from '../../types/events';
import { TraceId } from '../../types/trace';
import { MESSAGE_HISTORY_LENGTH_LIMIT } from '../../helpers/constants';
import { ReplyCapture } from '../../types/postSendOperations';

export class CommandActionProcessor extends BaseActionProcessor {
    private static readonly fallbackFactoryForChatHistory: () => ChatHistoryMessage[] =
        () => [];
    private static readonly fallbackFactoryForCaptures: () => ReplyCaptureAction<IActionState>[] =
        () => [];

    private readonly replyCaptures = new Map<
        number,
        ReplyCaptureAction<IActionState>[]
    >();
    private readonly chatHistory = new Map<number, ChatHistoryMessage[]>();
    private botInfo!: BotInfo;

    private commands = typeSafeObjectFromEntries(
        Object.values(MessageType).map((x) => [
            x,
            [] as CommandAction<IActionState>[]
        ])
    );

    initialize(
        api: TelegramApiService,
        telegram: TelegramBot,
        commands: CommandAction<IActionState>[],
        botInfo: BotInfo
    ) {
        this.botInfo = botInfo;
        this.initializeDependencies(api);

        for (const msgType of Object.values(MessageType)) {
            if (msgType == MessageType.Text) {
                this.commands[msgType] = commands.filter(
                    (cmd) =>
                        cmd.triggers.some((x) => typeof x != 'string') ||
                        cmd.triggers.some(
                            (x) =>
                                typeof x == 'string' &&
                                !x.startsWith(INTERNAL_MESSAGE_TYPE_PREFIX)
                        ) ||
                        cmd.triggers.includes(MessageType.Text) ||
                        cmd.triggers.includes(MessageType.Any)
                );

                continue;
            }

            this.commands[msgType] = commands.filter(
                (cmd) =>
                    cmd.triggers.includes(msgType) ||
                    cmd.triggers.includes(MessageType.Any)
            );
        }

        if (commands.length > 0) {
            telegram.on('message', ({ message }) => {
                const internalMessage = new IncomingMessage(
                    message,
                    this.botName,
                    getOrCreateIfNotExists(
                        this.chatHistory,
                        message.chat.id,
                        CommandActionProcessor.fallbackFactoryForChatHistory
                    )
                );

                this.eventEmitter.emit(BotEventType.messageRecieved, {
                    botInfo: this.botInfo,
                    message: internalMessage,
                    traceId: internalMessage.traceId
                });

                void this.startMessageProcessing(internalMessage);
            });
        }
    }

    captureRegistrationCallback(
        capture: ReplyCapture,
        parentMessageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        const replyAction = new ReplyCaptureAction(
            parentMessageId,
            capture.action,
            capture.handler,
            capture.trigger,
            capture.abortController
        );

        this.eventEmitter.emit(BotEventType.commandActionCaptureStarted, {
            parentMessageId,
            chatInfo,
            traceId
        });

        const chatCaptures = getOrCreateIfNotExists(
            this.replyCaptures,
            chatInfo.id,
            CommandActionProcessor.fallbackFactoryForCaptures
        );
        chatCaptures.push(replyAction);

        capture.abortController.signal.addEventListener(
            'abort',
            () => {
                const chatCaptures = this.replyCaptures.get(chatInfo.id);
                if (!chatCaptures) return;

                const capturesWithController = chatCaptures.filter(
                    (x) => x.abortController == capture.abortController
                );

                for (const captureToCancel of capturesWithController) {
                    const index = chatCaptures.indexOf(captureToCancel);
                    chatCaptures.splice(index, 1);

                    this.eventEmitter.emit(
                        BotEventType.commandActionCaptureAborted,
                        {
                            parentMessageId,
                            chatInfo,
                            traceId
                        }
                    );
                }
            },
            { once: true }
        );
    }

    private updateChatHistory(msg: IncomingMessage) {
        const chatHistoryArray = getOrCreateIfNotExists(
            this.chatHistory,
            msg.chatInfo.id,
            CommandActionProcessor.fallbackFactoryForChatHistory
        );

        if (chatHistoryArray.length >= MESSAGE_HISTORY_LENGTH_LIMIT)
            chatHistoryArray.splice(
                0,
                chatHistoryArray.length - MESSAGE_HISTORY_LENGTH_LIMIT + 1
            );

        chatHistoryArray.push(
            new ChatHistoryMessage(
                msg.messageId,
                msg.from,
                msg.text,
                msg.type,
                msg.traceId,
                msg.replyToMessageId,
                msg.updateObject.date
            )
        );
    }

    private async processCommand(
        command: CommandAction<IActionState>,
        msg: IncomingMessage
    ) {
        const ctx = new MessageContextInternal<IActionState>(
            this.storage,
            this.scheduler,
            this.eventEmitter,
            command,
            msg,
            this.botName,
            this.botInfo
        );

        const { proxy, revoke } = Proxy.revocable(ctx, {});

        try {
            await this.executeAction(command, proxy);
        } finally {
            this.api.flushResponses();
            revoke();
        }
    }

    private async processReply(
        capture: ReplyCaptureAction<IActionState>,
        msg: IncomingMessage
    ) {
        const ctx = new ReplyContextInternal<IActionState>(
            this.storage,
            this.scheduler,
            this.eventEmitter,
            capture,
            msg,
            this.botName,
            this.botInfo
        );

        const { proxy, revoke } = Proxy.revocable(ctx, {});

        try {
            await this.executeAction(capture, proxy);
        } finally {
            this.api.flushResponses();
            revoke();
        }
    }

    private async startMessageProcessing(msg: IncomingMessage) {
        this.eventEmitter.emit(BotEventType.messageProcessingStarted, {
            botInfo: this.botInfo,
            message: msg,
            traceId: msg.traceId
        });

        this.updateChatHistory(msg);

        const baseCommands = this.commands[msg.type];
        const commandsToCheck =
            msg.type != MessageType.Text && msg.text != ''
                ? new Set([...baseCommands, ...this.commands[MessageType.Text]])
                : baseCommands;

        const actionPromises: Promise<void>[] = [];
        for (const command of commandsToCheck) {
            actionPromises.push(this.processCommand(command, msg));
        }

        const chatCaptures = getOrCreateIfNotExists(
            this.replyCaptures,
            msg.chatInfo.id,
            CommandActionProcessor.fallbackFactoryForCaptures
        );
        for (const capture of chatCaptures) {
            actionPromises.push(this.processReply(capture, msg));
        }

        try {
            await Promise.allSettled(actionPromises);
        } finally {
            this.eventEmitter.emit(BotEventType.messageProcessingFinished, {
                botInfo: this.botInfo,
                message: msg,
                traceId: msg.traceId
            });
        }
    }
}
