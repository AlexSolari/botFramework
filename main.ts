import { readFile } from 'fs/promises';
import { IStorageClient } from './types/storage';
import { CommandAction } from './entities/actions/commandAction';
import { ScheduledAction } from './entities/actions/scheduledAction';
import { BotInstance } from './entities/botInstance';
import { Seconds } from './types/timeValues';
import { IScheduler } from './types/scheduler';
import { ILogger } from './types/logger';
import { ActionStateBase } from './entities/states/actionStateBase';
import { InlineQueryAction } from './entities/actions/inlineQueryAction';

class BotOrchestrator {
    bots: BotInstance[] = [];

    /**
     * Starts bot
     */
    async startBot(options: {
        /** Bot name, used in logging */
        name: string;
        /** Path to file containing Telegram Bot token. */
        tokenFilePath: string;
        actions: {
            /** Collection of actions that will be executed as a response to message from used. Created using `CommandActionBuilder`.*/
            commands: CommandAction<ActionStateBase>[];
            /** Collection of actions that will be executed on timer. Created using `ScheduledActionBuilder`.*/
            scheduled: ScheduledAction<ActionStateBase>[];
            /** Collection of actions that will handle inline queries */
            inlineQueries: InlineQueryAction[];
        };
        /** Object containing chat name and chat id pairs. Used for logging and execution of scheduled action. */
        chats: Record<string, number>;
        /** Storage path for default `JsonFileStorage` client. Will be used only if `storageClient` is not provided. If not provided, default value of `./storage/` will be used.*/
        storagePath?: string;
        /** Period of time between execution of scheduled actions. */
        scheduledPeriod?: Seconds;
        /** If true, telegram API objects will be logged instead of message content. */
        verboseLoggingForIncomingMessage?: boolean;
        services?: {
            /** Storage client for bot state storage. If not provided, default `JsonFileStorage` will be used. */
            storageClient?: IStorageClient;
            /** Logger client for bot logging. If not provided, default `JsonFileStorage` will be used. */
            logger?: ILogger;
            /** Scheduler client for bot scheduling. If not provided, default `NodeTimeoutScheduler` will be used. */
            scheduler?: IScheduler;
        };
    }) {
        const token = await readFile(options.tokenFilePath, 'utf8');
        const bot = new BotInstance({
            name: options.name,
            token,
            actions: options.actions,
            chats: options.chats,
            storagePath: options.storagePath,
            scheduledPeriod: options.scheduledPeriod,
            verboseLoggingForIncomingMessage:
                options.verboseLoggingForIncomingMessage,
            services: {
                storageClient: options.services?.storageClient,
                logger: options.services?.logger,
                scheduler: options.services?.scheduler
            }
        });

        this.bots.push(bot);

        return bot;
    }

    /**
     * Terminates all scheduled tasks, closes storage connections and stops all bots.
     */
    async stopBots(reason: string) {
        for (const bot of this.bots) {
            await bot.stop(reason);
        }
    }
}

export const botOrchestrator = new BotOrchestrator();
