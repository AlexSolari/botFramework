import { describe, test, expect, mock } from 'bun:test';
import { BotInstance } from '../../src/entities/botInstance';
import {
    createMockScheduler,
    createMockStorage
} from '../services/actionProcessors/processorTestHelpers';

function createBot() {
    const storage = createMockStorage();
    const scheduler = createMockScheduler();
    const bot = new BotInstance({
        name: 'TestBot',
        actions: { commands: [], scheduled: [], inlineQueries: [] },
        chats: {},
        services: { storageClient: storage, scheduler }
    });
    const cancelAllTasks = scheduler.cancelAllTasks as ReturnType<typeof mock>;

    return { bot, storage, cancelAllTasks };
}

describe('BotInstance', () => {
    describe('stop', () => {
        test('should cancel the scheduled tasks before waiting for the processing in progress', async () => {
            const { bot, cancelAllTasks } = createBot();
            let callsBeforeProcessingStop = 0;
            bot['actionProcessingService'].stop = mock(() => {
                callsBeforeProcessingStop = cancelAllTasks.mock.calls.length;

                return Promise.resolve();
            });

            await bot.stop();

            expect(callsBeforeProcessingStop).toBe(1);
        });

        test('should cancel the tasks created by the processing in progress', async () => {
            const { bot, storage, cancelAllTasks } = createBot();
            let callsBeforeClose = 0;
            bot['actionProcessingService'].stop = mock(() => Promise.resolve());
            storage.close = mock(() => {
                callsBeforeClose = cancelAllTasks.mock.calls.length;

                return Promise.resolve();
            });

            await bot.stop();

            expect(callsBeforeClose).toBe(2);
        });
    });
});
