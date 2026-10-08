import { IncomingMessage } from '../../dtos/incomingMessage';
import {
    CommandAction,
    CommandActionInternal
} from '../../entities/actions/commandAction';
import { ReplyCaptureActionInternal } from '../../entities/actions/replyCaptureAction';
import { BaseContextInternal } from '../../entities/context/baseContext';
import { MessageContextInternal } from '../../entities/context/messageContext';
import { ReplyContextInternal } from '../../entities/context/replyContext';
import { IActionState } from '../../types/actionState';
import { TelegramApiService } from '../telegramApi';
import {
    INTERNAL_MESSAGE_TYPE_PREFIX,
    MessageType
} from '../../types/messageTypes';
import { typeSafeObjectFromEntries } from '../../helpers/objectFromEntries';
import { BaseActionProcessor } from './baseProcessor';
import { BotInfo } from '../../types/botInfo';
import { UpdatePoller } from '../telegram/updatePoller';
import { BotEventType } from '../../types/events';
import { checkTriggers } from '../../helpers/matchTriggers';
import { PersistentReplyCapture } from '../../entities/persistentReplyCapture';
import { IExecutableAction } from '../../types/action';
import { ChatHistory } from '../chatHistory';
import { ReplyCaptureRegistry } from '../replyCaptureRegistry';

export class CommandActionProcessor extends BaseActionProcessor {
    private readonly chatHistory = new ChatHistory();
    private botInfo!: BotInfo;
    private commands = typeSafeObjectFromEntries(
        Object.values(MessageType).map((x) => [
            x,
            [] as CommandActionInternal<IActionState>[]
        ])
    );

    readonly captures = new ReplyCaptureRegistry(
        this.botName,
        this.storage,
        this.eventEmitter,
        this.chatHistory,
        (processing) => {
            void this.track(processing);
        }
    );

    initialize(
        api: TelegramApiService,
        telegram: UpdatePoller,
        commands: CommandAction<IActionState>[],
        botInfo: BotInfo,
        messageFilter?: (message: IncomingMessage) => boolean,
        persistentCaptures: PersistentReplyCapture<object>[] = [],
        hasScheduledActions = false
    ) {
        this.botInfo = botInfo;
        this.initializeDependencies(api);
        this.captures.initialize(persistentCaptures);

        const commandActions =
            commands as CommandActionInternal<IActionState>[];

        for (const msgType of Object.values(MessageType)) {
            if (msgType == MessageType.Text) {
                this.commands[msgType] = commandActions.filter(
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

            this.commands[msgType] = commandActions.filter(
                (cmd) =>
                    cmd.triggers.includes(msgType) ||
                    cmd.triggers.includes(MessageType.Any)
            );
        }

        if (
            commands.length > 0 ||
            this.captures.hasPersistentCaptures ||
            hasScheduledActions
        ) {
            telegram.on('message', (message) => {
                const internalMessage = new IncomingMessage(
                    message,
                    this.botName,
                    this.chatHistory.getFor(message.chat.id)
                );

                const shouldProcessMessage = messageFilter
                    ? messageFilter(internalMessage)
                    : true;
                if (!shouldProcessMessage) {
                    return;
                }

                this.eventEmitter.emit(BotEventType.messageRecieved, {
                    botInfo: this.botInfo,
                    message: internalMessage,
                    traceId: internalMessage.traceId
                });

                void this.track(this.startMessageProcessing(internalMessage));
            });
        }
    }

    private processCommand(
        command: CommandActionInternal<IActionState>,
        msg: IncomingMessage
    ) {
        return this.processAction(
            command,
            new MessageContextInternal<IActionState>(
                this.storage,
                this.scheduler,
                this.eventEmitter,
                this.api.client,
                command,
                msg,
                this.botName,
                this.botInfo
            )
        );
    }

    private processReply(
        capture: ReplyCaptureActionInternal<IActionState>,
        msg: IncomingMessage
    ) {
        return this.processAction(
            capture,
            new ReplyContextInternal<IActionState>(
                this.storage,
                this.scheduler,
                this.eventEmitter,
                this.api.client,
                capture,
                msg,
                this.botName,
                this.botInfo
            )
        );
    }

    private async processAction<
        TAction extends IExecutableAction,
        TActionContext extends BaseContextInternal<TAction>
    >(action: TAction, ctx: TActionContext) {
        const { proxy, revoke } = Proxy.revocable(ctx, {});

        try {
            await this.executeActionAndQueueResponses(action, proxy);
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

        this.chatHistory.add(msg);

        const baseCommands = this.commands[msg.type];
        const commandsToCheck =
            msg.type != MessageType.Text && msg.text != ''
                ? new Set([...baseCommands, ...this.commands[MessageType.Text]])
                : baseCommands;

        const actionPromises: Promise<void>[] = [];
        for (const command of commandsToCheck) {
            if (!checkTriggers(command.triggers, msg.text, msg.type)) continue;

            actionPromises.push(this.processCommand(command, msg));
        }

        for (const capture of this.captures.getCapturesFor(msg)) {
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
