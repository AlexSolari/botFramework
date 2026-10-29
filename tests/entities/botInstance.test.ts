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

        test('should stop only once when called again', async () => {
            const { bot, storage } = createBot();
            const stopProcessing = mock(() => Promise.resolve());
            bot['actionProcessingService'].stop = stopProcessing;

            const firstStop = bot.stop();

            expect(bot.stop()).toBe(firstStop);
            await bot.stop();
            expect(stopProcessing.mock.calls.length).toBe(1);
            expect(
                (storage.close as ReturnType<typeof mock>).mock.calls.length
            ).toBe(1);
        });
    });
});
