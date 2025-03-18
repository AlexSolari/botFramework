import { readFile } from 'fs/promises';
import { IStorageClient } from './types/storage';
import { Logger } from './services/logger';
import { CommandAction } from './entities/actions/commandAction';
import { ScheduledAction } from './entities/actions/scheduledAction';
import { IActionState } from './types/actionState';
import { Scheduler } from './services/taskScheduler';
import { BotInstance } from './entities/botInstance';

const bots: BotInstance[] = [];

function log(text: string) {
    Logger.logWithTraceId('ALL BOTS', 'System:Bot', 'System', text);
}

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
    /** Storage client for bot state storage. If not provided, default `JsonFileStorage` will be used. */
    storageClient?: IStorageClient;
    /** Storage path for default `JsonFileStorage` client. Will be used only if `storageClient` is not provided. If not provided, default value of `./storage/` will be used.*/
    storagePath?: string;
}) {
    const token = await readFile(options.tokenFilePath, 'utf8');
    const bot = new BotInstance({
        name: options.name,
        token,
        commands: options.commands,
        scheduled: options.scheduled,
        chats: options.chats,
        storageClient: options.storageClient,
        storagePath: options.storagePath
    });
    bots.push(bot);

    return bot;
}

/**
 * Terminates all scheduled tasks, closes storage connections and stops all bots.
 */
async function stopBots(reason: string) {
    log(`Recieved termination code: ${reason}`);
    Scheduler.stopAll();
    log('Acquiring storage semaphore...');

    log('Stopping bots...');
    for (const bot of bots) {
        await bot.stop(reason);
    }
}

export { startBot, stopBots };
