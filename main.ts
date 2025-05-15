import { readFile } from 'fs/promises';
import { IStorageClient } from './types/storage';
import { CommandAction } from './entities/actions/commandAction';
import { ScheduledAction } from './entities/actions/scheduledAction';
import { IActionState } from './types/actionState';
import { BotInstance } from './entities/botInstance';
import { Seconds } from './types/timeValues';
import { IScheduler } from './types/scheduler';
import { ILogger } from './types/logger';

const bots: BotInstance[] = [];

/**
 * Starts bot
 */
async function startBot(options: {
    /** Bot name, used in logging */
    name: string;
    /** Path to file containing Telegram Bot token. */
    tokenFilePath: string;
    /** Collection of actions that will be executed as a response to message from used. Created using `CommandActionBuilder`.*/
    commands: CommandAction<IActionState>[];
    /** Collection of actions that will be executed on timer. Created using `ScheduledActionBuilder`.*/
    scheduled: ScheduledAction<IActionState>[];
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
        commands: options.commands,
        scheduled: options.scheduled,
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
    bots.push(bot);

    return bot;
}

/**
 * Terminates all scheduled tasks, closes storage connections and stops all bots.
 */
async function stopBots(reason: string) {
    for (const bot of bots) {
        await bot.stop(reason);
    }
}

export { startBot, stopBots };
