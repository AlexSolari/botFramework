import { IncomingMessage } from '../../dtos/incomingMessage';
import { CommandAction } from '../../entities/actions/commandAction';
import { ReplyCaptureAction } from '../../entities/actions/replyCaptureAction';
import { MessageContextInternal } from '../../entities/context/messageContext';
import { ReplyContextInternal } from '../../entities/context/replyContext';
import { IActionState } from '../../types/actionState';
import { TelegramApiService } from '../telegramApi';
import { IReplyCapture } from '../../types/capture';
import { TraceId } from '../../types/trace';
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
import TelegramBot from 'node-telegram-bot-api';

const MESSAGE_HISTORY_LENGTH_LIMIT = 100;

export class CommandActionProcessor extends BaseActionProcessor {
    private readonly replyCaptures: ReplyCaptureAction<IActionState>[] = [];
    private readonly chatHistory = new Map<number, ChatHistoryMessage[]>();
    private botInfo!: TelegramBot.User;

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
        verboseLoggingForIncomingMessage: boolean,
        botInfo: TelegramBot.User
    ) {
        this.botInfo = botInfo;
        this.initializeDependencies(api);

        for (const msgType of Object.values(MessageType)) {
            if (msgType == MessageType.Text) {
                this.commands[msgType] = commands.filter(
                    (cmd) =>
                        cmd.triggers.find((x) => typeof x != 'string') !=
                            undefined ||
                        cmd.triggers.find(
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
            telegram.on('message', (msg) => {
                const internalMessage = new IncomingMessage(
                    msg,
                    this.botName,
                    getOrSetIfNotExists(this.chatHistory, msg.chat.id, [])
                );

                const logger = this.logger.createScope(
                    this.botName,
                    internalMessage.traceId,
                    internalMessage.chatInfo.name
                );

                if (verboseLoggingForIncomingMessage) {
                    logger.logObjectWithTraceId(msg);
                } else {
                    logger.logWithTraceId(
                        `${internalMessage.from?.first_name ?? 'Unknown'} (${
                            internalMessage.from?.id ?? 'Unknown'
                        }): ${internalMessage.text || internalMessage.type}`
                    );
                }

                void this.processMessage(internalMessage);
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

        const logger = this.logger.createScope(
            this.botName,
            traceId,
            chatInfo.name
        );

        logger.logWithTraceId(
            `Starting capturing replies to message ${parentMessageId} with action ${replyAction.key}`
        );

        this.replyCaptures.push(replyAction);

        capture.abortController.signal.addEventListener('abort', () => {
            const index = this.replyCaptures.indexOf(replyAction);
            this.replyCaptures.splice(index, 1);

            logger.logWithTraceId(
                `Stopping capturing replies to message ${parentMessageId} with action ${replyAction.key}`
            );
        });
    }

    private async processMessage(msg: IncomingMessage) {
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
                msg.replyToMessageId
            )
        );

        const ctx = new MessageContextInternal<IActionState>(
            this.storage,
            this.scheduler
        );

        const commandsToCheck = new Set(this.commands[msg.type]);
        if (msg.type != MessageType.Text && msg.text != '') {
            this.commands[MessageType.Text].forEach((x) =>
                commandsToCheck.add(x)
            );
        }

        for (const commandAction of commandsToCheck) {
            this.initializeMessageContext(ctx, commandAction, msg);
            await this.executeAction(commandAction, ctx);
        }

        if (this.replyCaptures.length != 0) {
            const replyCtx = new ReplyContextInternal<IActionState>(
                this.storage,
                this.scheduler
            );

            for (const replyAction of this.replyCaptures) {
                this.initializeReplyCaptureContext(replyCtx, replyAction, msg);
                await this.executeAction(replyAction, replyCtx);
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

        ctx.logger = this.logger.createScope(
            this.botName,
            message.traceId,
            message.chatInfo.name
        );
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

        ctx.logger = this.logger.createScope(
            this.botName,
            message.traceId,
            message.chatInfo.name
        );
    }
}
