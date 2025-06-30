import { Telegraf } from 'telegraf';
import { IncomingMessage } from '../../dtos/incomingMessage';
import { CommandAction } from '../../entities/actions/commandAction';
import { ReplyCaptureAction } from '../../entities/actions/replyCaptureAction';
import { MessageContext } from '../../entities/context/messageContext';
import { ReplyContext } from '../../entities/context/replyContext';
import { IActionWithState } from '../../types/action';
import { IActionState } from '../../types/actionState';
import { ILogger } from '../../types/logger';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { TelegramApiService } from '../telegramApi';
import { IReplyCapture } from '../../types/capture';
import { TraceId } from '../../types/trace';
import { ChatInfo } from '../../dtos/chatInfo';
import {
    INTERNAL_MESSAGE_TYPE_PREFIX,
    MessageType
} from '../../types/messageTypes';
import { typeSafeObjectFromEntries } from '../../helpers/objectFromEntries';

export class CommandActionProcessor {
    private readonly storage: IStorageClient;
    private readonly scheduler: IScheduler;
    private readonly logger: ILogger;

    private readonly botName: string;
    private readonly replyCaptures: ReplyCaptureAction<IActionState>[];

    private api!: TelegramApiService;
    private telegraf!: Telegraf;
    private commands = typeSafeObjectFromEntries(
        Object.values(MessageType).map((x) => [
            x,
            [] as CommandAction<IActionState>[]
        ])
    );

    constructor(
        botName: string,
        storage: IStorageClient,
        scheduler: IScheduler,
        logger: ILogger
    ) {
        this.storage = storage;
        this.scheduler = scheduler;
        this.logger = logger;

        this.botName = botName;
        this.replyCaptures = [];
    }

    initialize(
        api: TelegramApiService,
        telegraf: Telegraf,
        commands: CommandAction<IActionState>[],
        verboseLoggingForIncomingMessage: boolean
    ) {
        this.api = api;
        this.telegraf = telegraf;

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
            this.telegraf.on('message', async (ctx) => {
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

                await this.processMessage(msg);
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

        for (const commandAction of this.commands[msg.type]) {
            this.initializeMessageContext(ctx, commandAction, msg);

            try {
                const responses = await commandAction.exec(ctx);
                this.api.enqueueBatchedResponses(responses);
                ctx.isInitialized = false;
            } catch (error) {
                ctx.logger.errorWithTraceId(error, ctx);
            }
        }

        const replyCtx = new ReplyContext<IActionState>(
            this.storage,
            this.scheduler
        );

        for (const replyAction of this.replyCaptures) {
            this.initializeReplyCaptureContext(replyCtx, replyAction, msg);

            try {
                const responses = await replyAction.exec(replyCtx);
                this.api.enqueueBatchedResponses(responses);
                replyCtx.isInitialized = false;
            } catch (error) {
                replyCtx.logger.errorWithTraceId(error, replyCtx);
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
        ctx.messageText = message.text ?? '';
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

        ctx.isInitialized = true;
        ctx.matchResults = [];

        ctx.logger = this.logger.createScope(
            this.botName,
            message.traceId,
            message.chatInfo.name
        );
    }

    private initializeMessageContext<TActionState extends IActionState>(
        ctx: MessageContext<IActionState>,
        action: IActionWithState<TActionState>,
        message: IncomingMessage
    ) {
        ctx.messageId = message.messageId;
        ctx.messageText = message.text ?? '';
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

        ctx.logger = this.logger.createScope(
            this.botName,
            message.traceId,
            message.chatInfo.name
        );
    }
}
