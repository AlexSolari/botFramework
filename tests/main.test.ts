import { describe, test, expect, mock, afterEach } from 'bun:test';
import { botOrchestrator } from '../src/main';
import { BotInstance } from '../src/entities/botInstance';

function createStoppableBot() {
    const stop = mock(() => Promise.resolve());
    const bot = { stop } as unknown as BotInstance;

    return { bot, stop };
}

describe('botOrchestrator', () => {
    afterEach(() => {
        botOrchestrator.bots = [];
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
