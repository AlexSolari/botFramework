import { describe, test, expect, mock, spyOn, afterEach } from 'bun:test';
import { ActionProcessingService } from '../../src/services/actionProcessingService';
import { TypedEventEmitter } from '../../src/types/events';
import { CommandActionBuilder } from '../../src/helpers/builders/commandActionBuilder';
import { DEFAULT_SCHEDULED_ACTION_PERIOD_SECONDS } from '../../src/helpers/constants';
import { UpdatePoller } from '../../src/services/telegram/updatePoller';
import { TelegramApiService } from '../../src/services/telegramApi';
import { Seconds } from '../../src/types/timeValues';
import {
    createMockScheduler,
    createMockStorage
} from './actionProcessors/processorTestHelpers';
import { fakeTelegram } from './telegram/fakeTelegram';

const TOKEN = '123:abc';

function createService() {
    return new ActionProcessingService(
        'ServiceTestBot',
        {},
        createMockStorage(),
        createMockScheduler(),
        new TypedEventEmitter()
    );
}

const noActions = { commands: [], scheduled: [], inlineQueries: [] };

describe('ActionProcessingService', () => {
    afterEach(() => {
        mock.restore();
    });

    describe('initialize', () => {
        test('should start polling after getMe, with the help command before the commands', async () => {
            const { urls, methods } = fakeTelegram();
            const service = createService();
            const commandInit = spyOn(
                service['commandProcessor'],
                'initialize'
            );
            const command = new CommandActionBuilder('Greet')
                .on('/hi')
                .withHelp(() => 'Says hi')
                .build();

            await service.initialize(TOKEN, {
                ...noActions,
                commands: [command]
            });
            await Bun.sleep(10);
            await service.stop();

            expect(urls[0]).toEndWith(`/bot${TOKEN}/getMe`);
            expect(methods).toEqual(['getMe', 'deleteWebhook', 'getUpdates']);
            expect(commandInit.mock.calls[0][2].map((x) => x.name)).toEqual([
                'Reaction.Help',
                'Greet'
            ]);
        });

        test('should not add the help command without commands', async () => {
            fakeTelegram();
            const service = createService();
            const commandInit = spyOn(
                service['commandProcessor'],
                'initialize'
            );

            await service.initialize(TOKEN, noActions);
            await service.stop();

            expect(commandInit.mock.calls[0][2]).toEqual([]);
        });

        test('should check scheduled actions every hour unless another period is given', async () => {
            fakeTelegram();
            const service = createService();
            const scheduledInit = spyOn(
                service['scheduledProcessor'],
                'initialize'
            );

            await service.initialize(TOKEN, noActions);
            await service.stop();
            await service.initialize(TOKEN, noActions, 600 as Seconds);
            await service.stop();

            expect(scheduledInit.mock.calls.map((call) => call[2])).toEqual([
                DEFAULT_SCHEDULED_ACTION_PERIOD_SECONDS,
                600 as Seconds
            ]);
        });

        test('should reject a bot without a username before polling', async () => {
            const { methods } = fakeTelegram({
                id: 1,
                is_bot: true,
                first_name: 'Bot'
            });
            const service = createService();

            await expect(service.initialize(TOKEN, noActions)).rejects.toThrow(
                'getMe returned a bot without username'
            );
            expect(methods).toEqual(['getMe']);
        });
    });

    describe('reconnect', () => {
        test('should reconnect the update poller', () => {
            const service = createService();
            const reconnect = mock(() => {});
            service['telegramBot'] = { reconnect } as unknown as UpdatePoller;

            service.reconnect();

            expect(reconnect).toHaveBeenCalledTimes(1);
        });
    });

    describe('stop', () => {
        test('should send the due responses only after polling and all processing finished', async () => {
            const service = createService();
            const calls: string[] = [];
            let finishPolling!: () => void;

            service['telegramBot'] = {
                stop: () => {
                    calls.push('poller stopped');
                    setTimeout(finishPolling, 1);
                }
            } as unknown as UpdatePoller;
            service['polling'] = new Promise<void>((resolve) => {
                finishPolling = resolve;
            }).then(() => {
                calls.push('polling finished');
            });
            service['commandProcessor'].waitForProcessing = () => {
                calls.push('commands done');
                return Promise.resolve();
            };
            service['inlineQueryProcessor'].waitForProcessing = () => {
                calls.push('inline queries done');
                return Promise.resolve();
            };
            service['scheduledProcessor'].waitForProcessing = async () => {
                await Bun.sleep(5);
                calls.push('scheduled actions done');
            };
            service['api'] = {
                stop: () => {
                    calls.push('responses sent');
                    return Promise.resolve();
                }
            } as unknown as TelegramApiService;
            spyOn(
                service['commandProcessor'].captures,
                'stop'
            ).mockImplementation(() => {
                calls.push('captures stopped');
            });

            await service.stop();

            expect(calls).toEqual([
                'poller stopped',
                'polling finished',
                'commands done',
                'inline queries done',
                'scheduled actions done',
                'responses sent',
                'commands done',
                'captures stopped'
            ]);
        });
    });
});
