import { IncomingMessage } from '../../dtos/incomingMessage';
import { CommandAction } from '../../entities/actions/commandAction';
import { ReplyCaptureAction } from '../../entities/actions/replyCaptureAction';
import { MessageContextInternal } from '../../entities/context/messageContext';
import { ReplyContextInternal } from '../../entities/context/replyContext';
import { IActionState } from '../../types/actionState';
import { TelegramApiService } from '../telegramApi';
import { IReplyCapture } from '../../types/capture';
import { ChatInfo } from '../../dtos/chatInfo';
import {
    INTERNAL_MESSAGE_TYPE_PREFIX,
    MessageType
} from '../../types/messageTypes';
import { typeSafeObjectFromEntries } from '../../helpers/objectFromEntries';
import { BaseActionProcessor } from './baseProcessor';
import { getOrSetIfNotExists } from '../../helpers/mapUtils';
import { ChatHistoryMessage } from '../../dtos/chatHistoryMessage';
import { BotInfo, TelegramBot } from '../../types/externalAliases';
import { BotEventType } from '../../types/events';
import { TraceId } from '../../types/trace';

const MESSAGE_HISTORY_LENGTH_LIMIT = 100;

export class CommandActionProcessor extends BaseActionProcessor {
    private readonly replyCaptures: ReplyCaptureAction<IActionState>[] = [];
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
                    getOrSetIfNotExists(this.chatHistory, message.chat.id, [])
                );

                this.eventEmitter.emit(BotEventType.messageRecieved, {
                    botInfo: this.botInfo,
                    message: internalMessage,
                    traceId: internalMessage.traceId
                });

                this.startMessageProcessing(internalMessage);
            });
        }
    }

    captureRegistrationCallback(
        capture: IReplyCapture,
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

        this.replyCaptures.push(replyAction);

        capture.abortController.signal.addEventListener(
            'abort',
            () => {
                const capturesWithController = this.replyCaptures.filter(
                    (x) => x.abortController == capture.abortController
                );

                for (const captureToCancel of capturesWithController) {
                    const index = this.replyCaptures.indexOf(captureToCancel);
                    this.replyCaptures.splice(index, 1);

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

    private startMessageProcessing(msg: IncomingMessage) {
        this.eventEmitter.emit(BotEventType.messageProcessingStarted, {
            botInfo: this.botInfo,
            message: msg,
            traceId: msg.traceId
        });

        const chatHistoryArray = getOrSetIfNotExists(
            this.chatHistory,
            msg.chatInfo.id,
            []
        );

        while (chatHistoryArray.length > MESSAGE_HISTORY_LENGTH_LIMIT)
            chatHistoryArray.shift();

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

        const commandsToCheck = new Set(this.commands[msg.type]);
        if (msg.type != MessageType.Text && msg.text != '') {
            for (const command of this.commands[MessageType.Text]) {
                commandsToCheck.add(command);
            }
        }

        this.eventEmitter.emit(BotEventType.beforeActionsExecuting, {
            botInfo: this.botInfo,
            message: msg,
            commands: commandsToCheck,
            traceId: msg.traceId
        });

        const promises = [...commandsToCheck].map((command) => {
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

            const executePromise = this.executeAction(command, proxy);

            return executePromise.finally(() => {
                revoke();
                this.api.flushResponses();
            });
        });

        if (this.replyCaptures.length != 0) {
            const replyPromises = this.replyCaptures.map((capture) => {
                const replyCtx = new ReplyContextInternal<IActionState>(
                    this.storage,
                    this.scheduler,
                    this.eventEmitter,
                    capture,
                    msg,
                    this.botName,
                    this.botInfo
                );

                const { proxy, revoke } = Proxy.revocable(replyCtx, {});

                const executePromise = this.executeAction(capture, proxy);

                return executePromise.finally(() => {
                    revoke();
                    this.api.flushResponses();
                });
            });

            promises.push(...replyPromises);
        }

        void Promise.allSettled(promises).then(() => {
            this.eventEmitter.emit(BotEventType.messageProcessingFinished, {
                botInfo: this.botInfo,
                message: msg,
                traceId: msg.traceId
            });
        });
    }
}
