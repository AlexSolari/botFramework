import {
    describe,
    test,
    expect,
    mock,
    setSystemTime,
    afterEach
} from 'bun:test';
import { ScheduledAction } from '../../../src/entities/actions/scheduledAction';
import { CachedStateFactory } from '../../../src/entities/cachedStateFactory';
import { ChatContextInternal } from '../../../src/entities/context/chatContext';
import { ActionStateBase } from '../../../src/entities/states/actionStateBase';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import { TypedEventEmitter } from '../../../src/types/events';
import { ScheduledActionProviders } from '../../../src/dtos/propertyProviderSets';
import { ScheduledHandler } from '../../../src/types/handlers';
import { IActionState } from '../../../src/types/actionState';
import { IStorageClient } from '../../../src/types/storage';
import { ActionKey } from '../../../src/types/action';
import { Hours, HoursOfDay } from '../../../src/types/timeValues';
import { TraceId } from '../../../src/types/trace';
import { Noop } from '../../../src/helpers/noop';
import { createMockScheduler } from '../../services/actionProcessors/processorTestHelpers';

function createMockStorage(
    state: IActionState = { lastExecutedDate: 0, pinnedMessages: [] }
) {
    return {
        load: mock(() => ({})),
        close: mock(() => Promise.resolve()),
        getActionState: mock(() => state),
        saveActionExecutionResult: mock(() => Promise.resolve()),
        updateStateFor: mock(() => Promise.resolve())
    } as unknown as IStorageClient;
}

function buildScheduledAction(
    overrides: {
        name?: string;
        handler?: ScheduledHandler<ActionStateBase>;
        providers?: Partial<ScheduledActionProviders>;
        cachedStateFactories?: Map<string, CachedStateFactory>;
    } = {}
) {
    const providers: ScheduledActionProviders = {
        timeinHoursProvider: () => 0,
        isActiveProvider: () => true,
        chatsWhitelistProvider: () => [555],
        ...overrides.providers
    };

    return new ScheduledAction<ActionStateBase>(
        overrides.name ?? 'TestScheduled',
        overrides.handler ?? (async () => {}),
        providers,
        overrides.cachedStateFactories ?? new Map(),
        () => new ActionStateBase()
    );
}

function createContext(
    action: ScheduledAction<ActionStateBase>,
    options: { state?: IActionState; chatId?: number } = {}
) {
    const storage = createMockStorage(options.state);
    const scheduler = createMockScheduler();
    const eventEmitter = new TypedEventEmitter();
    const chatInfo = new ChatInfo(options.chatId ?? 555, 'Test Chat', []);

    const ctx = new ChatContextInternal<ActionStateBase>(
        storage,
        scheduler,
        eventEmitter,
        action,
        chatInfo,
        'trace:test' as TraceId,
        'TestBot'
    );

    return { ctx, storage };
}

describe('ScheduledAction', () => {
    describe('constructor', () => {
        test('should generate key with scheduled prefix and dots replaced with dashes', () => {
            const action = buildScheduledAction({ name: 'my.scheduled.job' });

            expect(action.key).toBe('scheduled:my-scheduled-job' as ActionKey);
        });
    });

    describe('exec - gating checks', () => {
        test('should return NoResponse when not active', async () => {
            const handler = mock(() => Promise.resolve());
            const action = buildScheduledAction({
                handler,
                providers: { isActiveProvider: () => false }
            });
            const { ctx } = createContext(action);

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should return NoResponse when chat is not in the whitelist', async () => {
            const handler = mock(() => Promise.resolve());
            const action = buildScheduledAction({
                handler,
                providers: { chatsWhitelistProvider: () => [999] }
            });
            const { ctx } = createContext(action, { chatId: 555 });

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should execute when chat is in the whitelist', async () => {
            const handler = mock(() => Promise.resolve());
            const action = buildScheduledAction({
                handler,
                providers: { chatsWhitelistProvider: () => [555] }
            });
            const { ctx } = createContext(action, { chatId: 555 });

            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('exec - daily scheduling', () => {
        afterEach(() => {
            setSystemTime();
        });

        test('should return NoResponse when the scheduled time has not arrived yet today', async () => {
            const noon = new Date();
            noon.setHours(12, 0, 0, 0);
            setSystemTime(noon);

            const handler = mock(() => Promise.resolve());
            const action = buildScheduledAction({
                handler,
                providers: { timeinHoursProvider: () => 18 as HoursOfDay }
            });
            const { ctx } = createContext(action);

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should return NoResponse when already executed today', async () => {
            const noon = new Date();
            noon.setHours(12, 0, 0, 0);
            setSystemTime(noon);

            const handler = mock(() => Promise.resolve());
            const action = buildScheduledAction({
                handler,
                providers: { timeinHoursProvider: () => 0 as HoursOfDay }
            });
            const { ctx } = createContext(action, {
                state: { lastExecutedDate: Date.now(), pinnedMessages: [] }
            });

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should execute and save state when the scheduled time has arrived and it has not run today', async () => {
            const noon = new Date();
            noon.setHours(12, 0, 0, 0);
            setSystemTime(noon);

            const handler = mock(() => Promise.resolve());
            const action = buildScheduledAction({
                handler,
                providers: { timeinHoursProvider: () => 9 as HoursOfDay }
            });
            const state: IActionState = {
                lastExecutedDate: 0,
                pinnedMessages: []
            };
            const { ctx, storage } = createContext(action, { state });

            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(state.lastExecutedDate).toBeGreaterThan(0);
            expect(storage.saveActionExecutionResult).toHaveBeenCalledTimes(1);
        });
    });

    describe('exec - shared cache', () => {
        test('should invoke the factory once and reuse the cached value on later calls', async () => {
            const factory = mock(() => Promise.resolve('value'));
            const cachedStateFactories = new Map([
                ['key', new CachedStateFactory(factory, 1 as Hours)]
            ]);
            const seen: unknown[] = [];

            const action = buildScheduledAction({
                name: 'ScheduledActionTest.CacheReuse',
                cachedStateFactories,
                handler: async (ctx, getCached) => {
                    seen.push(await getCached('key'));
                    seen.push(await getCached('key'));
                }
            });
            const { ctx } = createContext(action);

            await action.exec(ctx);

            expect(factory).toHaveBeenCalledTimes(1);
            expect(seen).toEqual(['value', 'value']);
        });

        test('should share the cached value across different ScheduledAction instances with the same name', async () => {
            const sharedName = 'ScheduledActionTest.SharedAcrossInstances';
            const factory = mock(() => Promise.resolve('shared-value'));

            let seenByFirst: unknown;
            let seenBySecond: unknown;

            const action1 = buildScheduledAction({
                name: sharedName,
                cachedStateFactories: new Map([
                    ['key', new CachedStateFactory(factory, 1 as Hours)]
                ]),
                handler: async (ctx, getCached) => {
                    seenByFirst = await getCached('key');
                }
            });
            const action2 = buildScheduledAction({
                name: sharedName,
                cachedStateFactories: new Map([
                    ['key', new CachedStateFactory(factory, 1 as Hours)]
                ]),
                handler: async (ctx, getCached) => {
                    seenBySecond = await getCached('key');
                }
            });

            const { ctx: ctx1 } = createContext(action1);
            await action1.exec(ctx1);

            const { ctx: ctx2 } = createContext(action2);
            await action2.exec(ctx2);

            expect(seenByFirst).toBe('shared-value');
            expect(seenBySecond).toBe('shared-value');
            expect(factory).toHaveBeenCalledTimes(1);
        });

        test('should reject when no cache factory is configured for the requested key', async () => {
            let caught: unknown;
            const action = buildScheduledAction({
                name: 'ScheduledActionTest.MissingFactory',
                handler: async (ctx, getCached) => {
                    try {
                        await getCached('missing-key');
                    } catch (error) {
                        caught = error;
                    }
                }
            });
            const { ctx } = createContext(action);

            await action.exec(ctx);

            expect(caught).toBeInstanceOf(Error);
        });
    });
});
