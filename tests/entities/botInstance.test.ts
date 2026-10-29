import { describe, test, expect, mock } from 'bun:test';
import { BotInstance } from '../../src/entities/botInstance';
import {
    createMockScheduler,
    createMockStorage
} from '../services/actionProcessors/processorTestHelpers';
import { CommandActionBuilder } from '../../src/helpers/builders/commandActionBuilder';
import { ScheduledActionBuilder } from '../../src/helpers/builders/scheduledActionBuilder';
import { IActionState } from '../../src/types/actionState';
import { CommandAction } from '../../src/entities/actions/commandAction';
import { ScheduledAction } from '../../src/entities/actions/scheduledAction';

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

function createBotWith(actions: {
    commands?: CommandAction<IActionState>[];
    scheduled?: ScheduledAction<IActionState>[];
}) {
    return new BotInstance({
        name: 'TestBot',
        actions: {
            commands: actions.commands ?? [],
            scheduled: actions.scheduled ?? [],
            inlineQueries: []
        },
        chats: {},
        services: {
            storageClient: createMockStorage(),
            scheduler: createMockScheduler()
        }
    });
}

describe('BotInstance', () => {
    describe('constructor', () => {
        test('should reject commands whose names give the same key', () => {
            const commands = [
                new CommandActionBuilder('Greet.Hello').on('/a').build(),
                new CommandActionBuilder('Greet-Hello').on('/b').build()
            ];

            expect(() => createBotWith({ commands })).toThrow(
                'Actions Greet.Hello and Greet-Hello have the same key command:Greet-Hello'
            );
        });

        test('should reject a scheduled action registered twice', () => {
            const action = new ScheduledActionBuilder('Daily').build();

            expect(() =>
                createBotWith({ scheduled: [action, action] })
            ).toThrow('Action Daily is registered more than once.');
        });

        test('should accept a command and a scheduled action with the same name', () => {
            expect(() =>
                createBotWith({
                    commands: [new CommandActionBuilder('Daily').on('/a').build()],
                    scheduled: [new ScheduledActionBuilder('Daily').build()]
                })
            ).not.toThrow();
        });
    });

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
