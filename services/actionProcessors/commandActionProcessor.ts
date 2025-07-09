import { Telegraf } from 'telegraf';
import { IncomingMessage } from '../../dtos/incomingMessage';
import { CommandAction } from '../../entities/actions/commandAction';
import { ReplyCaptureAction } from '../../entities/actions/replyCaptureAction';
import { MessageContext } from '../../entities/context/messageContext';
import { ReplyContext } from '../../entities/context/replyContext';
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
import { UserFromGetMe } from 'telegraf/types';

export class CommandActionProcessor extends BaseActionProcessor {
    private readonly replyCaptures: ReplyCaptureAction<IActionState>[] = [];
    private botInfo!: UserFromGetMe;

    private commands = typeSafeObjectFromEntries(
        Object.values(MessageType).map((x) => [
            x,
            [] as CommandAction<IActionState>[]
        ])
    );

    initialize(
        api: TelegramApiService,
        telegraf: Telegraf,
        commands: CommandAction<IActionState>[],
        verboseLoggingForIncomingMessage: boolean,
        botInfo: UserFromGetMe
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
            telegraf.on('message', (ctx) => {
                const msg = new IncomingMessage(
                    ctx.update.message,
                    this.botName
                );

                const logger = this.logger.createScope(
                    this.botName,
                    msg.traceId,
                    msg.chatInfo.name
                );

                if (verboseLoggingForIncomingMessage) {
                    logger.logObjectWithTraceId(ctx.update.message);
                } else {
                    logger.logWithTraceId(
                        `${msg.from?.first_name ?? 'Unknown'} (${
                            msg.from?.id ?? 'Unknown'
                        }): ${msg.text || `<non-text message: ${msg.type}>`}`
                    );
                }

                void this.processMessage(msg);
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
        const ctx = new MessageContext<IActionState>(
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
            const replyCtx = new ReplyContext<IActionState>(
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
        ctx: ReplyContext<IActionState>,
        action: ReplyCaptureAction<IActionState>,
        message: IncomingMessage
    ) {
        ctx.replyMessageId = message.replyToMessageId;
        ctx.messageId = message.messageId;
        ctx.messageText = message.text;
        ctx.messageType = message.type;
        ctx.fromUserId = message.from?.id;
        ctx.fromUserName =
            (message.from?.first_name ?? 'Unknown user') +
            (message.from?.last_name ? ` ${message.from.last_name}` : '');
        ctx.messageUpdateObject = message.updateObject;
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
        ctx: MessageContext<IActionState>,
        action: CommandAction<IActionState>,
        message: IncomingMessage
    ) {
        ctx.messageId = message.messageId;
        ctx.messageText = message.text;
        ctx.messageType = message.type;
        ctx.fromUserId = message.from?.id;
        ctx.fromUserName =
            (message.from?.first_name ?? 'Unknown user') +
            (message.from?.last_name ? ` ${message.from.last_name}` : '');
        ctx.messageUpdateObject = message.updateObject;

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
