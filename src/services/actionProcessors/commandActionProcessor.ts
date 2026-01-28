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
import { MessageInfo } from '../../dtos/messageInfo';
import { UserInfo } from '../../dtos/userInfo';
import { ChatHistoryMessage } from '../../dtos/chatHistoryMessage';
import { BotInfo, TelegramBot } from '../../types/externalAliases';
import { BotEventType } from '../../types/events';

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
            telegram.on('message', async ({ message }) => {
                const internalMessage = new IncomingMessage(
                    message,
                    this.botName,
                    getOrSetIfNotExists(this.chatHistory, message.chat.id, [])
                );

                this.eventEmitter.emit(BotEventType.messageRecieved, {
                    botInfo: this.botInfo,
                    message: internalMessage
                });

                await this.processMessage(internalMessage);

                this.eventEmitter.emit(BotEventType.messageProcessingFinished, {
                    botInfo: this.botInfo,
                    message: internalMessage
                });
            });
        }
    }

    captureRegistrationCallback(
        capture: IReplyCapture,
        parentMessageId: number,
        chatInfo: ChatInfo
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
            chatInfo
        });

        this.replyCaptures.push(replyAction);

        capture.abortController.signal.addEventListener('abort', () => {
            const index = this.replyCaptures.indexOf(replyAction);
            this.replyCaptures.splice(index, 1);

            this.eventEmitter.emit(BotEventType.commandActionCaptureAborted, {
                parentMessageId,
                chatInfo
            });
        });
    }

    private async processMessage(msg: IncomingMessage) {
        this.eventEmitter.emit(BotEventType.messageProcessingStarted, {
            botInfo: this.botInfo,
            message: msg
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

        const ctx = new MessageContextInternal<IActionState>(
            this.storage,
            this.scheduler,
            this.eventEmitter
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
            commands: commandsToCheck
        });
        for (const commandAction of commandsToCheck) {
            this.initializeMessageContext(ctx, commandAction, msg);

            const { proxy, revoke } = Proxy.revocable(ctx, {});

            await this.executeAction(commandAction, proxy);

            revoke();
        }

        if (this.replyCaptures.length != 0) {
            const replyCtx = new ReplyContextInternal<IActionState>(
                this.storage,
                this.scheduler,
                this.eventEmitter
            );

            for (const replyAction of this.replyCaptures) {
                this.initializeReplyCaptureContext(replyCtx, replyAction, msg);
                const { proxy, revoke } = Proxy.revocable(replyCtx, {});
                await this.executeAction(replyAction, proxy);
                revoke();
            }
        }

        this.api.flushResponses();
    }

    private initializeReplyCaptureContext(
        ctx: ReplyContextInternal<IActionState>,
        action: ReplyCaptureAction<IActionState>,
        message: IncomingMessage
    ) {
        ctx.replyMessageId = message.replyToMessageId;
        ctx.messageInfo = new MessageInfo(
            message.messageId,
            message.text,
            message.type,
            message.updateObject
        );
        ctx.userInfo = new UserInfo(
            message.from?.id ?? -1,
            (message.from?.first_name ?? 'Unknown user') +
                (message.from?.last_name ? ` ${message.from.last_name}` : '')
        );
        ctx.botName = this.botName;
        ctx.action = action;
        ctx.chatInfo = message.chatInfo;
        ctx.traceId = message.traceId;
        ctx.botInfo = this.botInfo;

        ctx.isInitialized = true;
        ctx.matchResults = [];
    }

    private initializeMessageContext(
        ctx: MessageContextInternal<IActionState>,
        action: CommandAction<IActionState>,
        message: IncomingMessage
    ) {
        ctx.messageInfo = new MessageInfo(
            message.messageId,
            message.text,
            message.type,
            message.updateObject
        );
        ctx.userInfo = new UserInfo(
            message.from?.id ?? -1,
            (message.from?.first_name ?? 'Unknown user') +
                (message.from?.last_name ? ` ${message.from.last_name}` : '')
        );

        ctx.matchResults = [];
        ctx.startCooldown = true;

        ctx.responses = [];
        ctx.isInitialized = true;
        ctx.botName = this.botName;
        ctx.action = action;
        ctx.chatInfo = message.chatInfo;
        ctx.traceId = message.traceId;
        ctx.botInfo = this.botInfo;
        ctx.customCooldown = undefined;
    }
}
