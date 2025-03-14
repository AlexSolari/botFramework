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

async function startBot(options: {
    name: string;
    tokenFilePath: string;
    commands: CommandAction<IActionState>[];
    scheduled: ScheduledAction[];
    chats: Map<string, number>;
    storageClient?: IStorageClient;
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

async function stopBots(reason: string) {
    log(`Recieved termination code: ${reason}`);
    Scheduler.stopAll();
    log('Acquiring storage semaphore...');

    log('Stopping bots...');
    for (const bot of bots) {
        bot.stop(reason);
    }
}

export { startBot, stopBots };
