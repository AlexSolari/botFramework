import { describe, test, expect, mock, afterEach } from 'bun:test';
import { botOrchestrator } from '../src/main';
import { BotInstance } from '../src/entities/botInstance';
import { CommandActionBuilder } from '../src/helpers/builders/commandActionBuilder';
import {
    createMockScheduler,
    createMockStorage
} from './services/actionProcessors/processorTestHelpers';
import { fakeTelegram } from './services/telegram/fakeTelegram';

function startOptions(tokenProvider: () => Promise<string>) {
    return {
        name: 'OrchestratorTestBot',
        tokenProvider,
        actions: {
            commands: [new CommandActionBuilder('Ping').on('/ping').build()],
            scheduled: [],
            inlineQueries: []
        },
        chats: {},
        services: {
            storageClient: createMockStorage(),
            scheduler: createMockScheduler()
        }
    };
}

function createStoppableBot() {
    const stop = mock(() => Promise.resolve());
    const bot = { stop } as unknown as BotInstance;

    return { bot, stop };
}

describe('botOrchestrator', () => {
    afterEach(() => {
        botOrchestrator.bots = [];
        mock.restore();
    });

    describe('startBot', () => {
        test('should start the bot with the provided token and add it to bots', async () => {
            const { urls } = fakeTelegram();
            const tokenProvider = mock(() => Promise.resolve('123:abc'));

            const bot = await botOrchestrator.startBot(
                startOptions(tokenProvider)
            );

            try {
                expect(tokenProvider).toHaveBeenCalledTimes(1);
                expect(urls[0]).toEndWith('/bot123:abc/getMe');
                expect(bot.name).toBe('OrchestratorTestBot');
                expect(botOrchestrator.bots).toEqual([bot]);
            } finally {
                await botOrchestrator.stopBots();
            }
        });

        test('should not add a bot that failed to start', async () => {
            fakeTelegram({ id: 1, is_bot: true, first_name: 'Bot' });

            await expect(
                botOrchestrator.startBot(
                    startOptions(() => Promise.resolve('123:abc'))
                )
            ).rejects.toThrow('getMe returned a bot without username');
            expect(botOrchestrator.bots).toEqual([]);
        });
    });

    describe('reconnect', () => {
        test('should reconnect every bot', () => {
            const reconnects = [mock(() => {}), mock(() => {})];
            botOrchestrator.bots = reconnects.map(
                (reconnect) => ({ reconnect }) as unknown as BotInstance
            );

            botOrchestrator.reconnect();

            for (const reconnect of reconnects) {
                expect(reconnect).toHaveBeenCalledTimes(1);
            }
        });
    });

    describe('stopBots', () => {
        test('should remove the stopped bots', async () => {
            const first = createStoppableBot();
            const second = createStoppableBot();
            botOrchestrator.bots = [first.bot, second.bot];

            await botOrchestrator.stopBots();

            expect(botOrchestrator.bots).toEqual([]);
            expect(first.stop.mock.calls.length).toBe(1);
            expect(second.stop.mock.calls.length).toBe(1);
        });

        test('should not stop the bots stopped by an earlier call again', async () => {
            const first = createStoppableBot();
            botOrchestrator.bots = [first.bot];
            await botOrchestrator.stopBots();

            const second = createStoppableBot();
            botOrchestrator.bots.push(second.bot);
            await botOrchestrator.stopBots();

            expect(first.stop.mock.calls.length).toBe(1);
            expect(second.stop.mock.calls.length).toBe(1);
        });
    });
});
