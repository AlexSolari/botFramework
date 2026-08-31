import { describe, test, expect, mock } from 'bun:test';
import { CommandAction } from '../../../src/entities/actions/commandAction';
import { MessageContextInternal } from '../../../src/entities/context/messageContext';
import { ActionStateBase } from '../../../src/entities/states/actionStateBase';
import { IncomingMessage } from '../../../src/dtos/incomingMessage';
import { TextMessage } from '../../../src/dtos/responses/textMessage';
import { TypedEventEmitter } from '../../../src/types/events';
import { CooldownInfo } from '../../../src/dtos/cooldownInfo';
import { CommandActionProviders } from '../../../src/dtos/propertyProviderSets';
import { CommandCondition } from '../../../src/types/commandCondition';
import { CommandTrigger } from '../../../src/types/commandTrigger';
import { CommandHandler } from '../../../src/types/handlers';
import { IActionState } from '../../../src/types/actionState';
import { IStorageClient } from '../../../src/types/storage';
import { ActionKey } from '../../../src/types/action';
import { Seconds } from '../../../src/types/timeValues';
import { Noop } from '../../../src/helpers/noop';
import { createMockScheduler } from '../../services/actionProcessors/processorTestHelpers';
import type { Message, UserFromGetMe } from '@telegraf/types';

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

function buildAction(
    overrides: {
        trigger?: CommandTrigger | CommandTrigger[];
        handler?: CommandHandler<ActionStateBase>;
        name?: string;
        providers?: Partial<CommandActionProviders>;
        maxAllowedSimultaniousExecutions?: number;
        condition?: CommandCondition<ActionStateBase>;
    } = {}
) {
    const providers: CommandActionProviders = {
        cooldownProvider: () => new CooldownInfo(0 as Seconds),
        isActiveProvider: () => true,
        chatsBlacklistProvider: () => [],
        chatsWhitelistProvider: () => [],
        usersWhitelistProvider: () => [],
        ...overrides.providers
    };

    return new CommandAction<ActionStateBase>(
        overrides.trigger ?? '/test',
        overrides.handler ?? (() => {}),
        overrides.name ?? 'TestCommand',
        providers,
        overrides.maxAllowedSimultaniousExecutions ?? 0,
        overrides.condition ?? (() => true),
        () => new ActionStateBase(),
        () => ''
    );
}

function createContext(
    action: CommandAction<ActionStateBase>,
    options: {
        text?: string;
        hasUser?: boolean;
        chatId?: number;
        storage?: IStorageClient;
    } = {}
) {
    const storage = options.storage ?? createMockStorage();
    const scheduler = createMockScheduler();
    const eventEmitter = new TypedEventEmitter();

    const telegramMessage = {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: options.chatId ?? 555, type: 'private' },
        from:
            options.hasUser === false
                ? undefined
                : { id: 42, is_bot: false, first_name: 'Tester' },
        text: options.text ?? '/test'
    } as Message;

    const incomingMessage = new IncomingMessage(telegramMessage, 'TestBot', []);

    const botInfo = {
        id: 1,
        is_bot: true,
        first_name: 'Bot',
        username: 'testbot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
        can_connect_to_business: false,
        has_main_web_app: false
    } as UserFromGetMe;

    const ctx = new MessageContextInternal<ActionStateBase>(
        storage,
        scheduler,
        eventEmitter,
        action,
        incomingMessage,
        'TestBot',
        botInfo
    );

    return { ctx, storage };
}

describe('CommandAction', () => {
    describe('constructor', () => {
        test('should generate key with command prefix and dots replaced with dashes', () => {
            const action = buildAction({ name: 'my.command.name' });

            expect(action.key).toBe('command:my-command-name' as ActionKey);
        });

        test('should store triggers as an array when a single trigger is provided', () => {
            const action = buildAction({ trigger: '/single' });

            expect(action.triggers).toEqual(['/single']);
        });
    });

    describe('exec - gating checks', () => {
        test('should return NoResponse when user id is missing', async () => {
            const handler = mock(() => {});
            const action = buildAction({ handler });
            const { ctx } = createContext(action, { hasUser: false });

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should return NoResponse when action is disabled', async () => {
            const handler = mock(() => {});
            const action = buildAction({
                handler,
                providers: { isActiveProvider: () => false }
            });
            const { ctx } = createContext(action);

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should return NoResponse when chat is blacklisted', async () => {
            const handler = mock(() => {});
            const action = buildAction({
                handler,
                providers: { chatsBlacklistProvider: () => [555] }
            });
            const { ctx } = createContext(action, { chatId: 555 });

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should return NoResponse when chat whitelist is configured and chat is not included', async () => {
            const handler = mock(() => {});
            const action = buildAction({
                handler,
                providers: { chatsWhitelistProvider: () => [999] }
            });
            const { ctx } = createContext(action, { chatId: 555 });

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should execute when chat whitelist is configured and chat is included', async () => {
            const handler = mock(() => {});
            const action = buildAction({
                handler,
                providers: { chatsWhitelistProvider: () => [555] }
            });
            const { ctx } = createContext(action, { chatId: 555 });

            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should return NoResponse when user whitelist is configured and user is not included', async () => {
            const handler = mock(() => {});
            const action = buildAction({
                handler,
                providers: { usersWhitelistProvider: () => [1234] }
            });
            const { ctx } = createContext(action);

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should return NoResponse when custom condition returns false', async () => {
            const handler = mock(() => {});
            const action = buildAction({ handler, condition: () => false });
            const { ctx } = createContext(action);

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should execute when custom condition returns true', async () => {
            const handler = mock(() => {});
            const action = buildAction({ handler, condition: () => true });
            const { ctx } = createContext(action);

            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('exec - trigger matching', () => {
        test('should return NoResponse when no trigger matches', async () => {
            const handler = mock(() => {});
            const action = buildAction({ trigger: '/hello', handler });
            const { ctx } = createContext(action, { text: '/other' });

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should execute on exact string trigger match, case-insensitively', async () => {
            const handler = mock(() => {});
            const action = buildAction({ trigger: '/Hello', handler });
            const { ctx } = createContext(action, { text: '/hello' });

            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should execute on regex trigger match and set matchResults', async () => {
            const handler = mock(() => {});
            const action = buildAction({ trigger: /^\/echo (\w+)/, handler });
            const { ctx } = createContext(action, { text: '/echo world' });

            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(ctx.matchResults).toHaveLength(1);
            expect(ctx.matchResults[0][1]).toBe('world');
        });

        test('should execute when any of multiple configured triggers matches', async () => {
            const handler = mock(() => {});
            const action = buildAction({ trigger: ['/foo', '/bar'], handler });
            const { ctx } = createContext(action, { text: '/bar' });

            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('exec - cooldown', () => {
        test('should block execution and return cooldown message while on cooldown', async () => {
            const handler = mock(() => {});
            const action = buildAction({
                handler,
                providers: {
                    cooldownProvider: () =>
                        new CooldownInfo(60 as Seconds, 'Please wait!')
                }
            });
            const { ctx } = createContext(action, {
                storage: createMockStorage({
                    lastExecutedDate: Date.now(),
                    pinnedMessages: []
                })
            });

            const responses = await action.exec(ctx);

            expect(handler).not.toHaveBeenCalled();
            expect(responses).toHaveLength(1);
            expect((responses[0] as TextMessage).content).toBe('Please wait!');
        });

        test('should return NoResponse while on cooldown when no cooldown message is configured', async () => {
            const handler = mock(() => {});
            const action = buildAction({
                handler,
                providers: {
                    cooldownProvider: () => new CooldownInfo(60 as Seconds)
                }
            });
            const { ctx } = createContext(action, {
                storage: createMockStorage({
                    lastExecutedDate: Date.now(),
                    pinnedMessages: []
                })
            });

            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should allow execution again once the cooldown window has elapsed', async () => {
            const handler = mock(() => {});
            const action = buildAction({
                handler,
                providers: {
                    cooldownProvider: () => new CooldownInfo(1 as Seconds)
                }
            });
            const { ctx } = createContext(action, {
                storage: createMockStorage({
                    lastExecutedDate: Date.now() - 5000,
                    pinnedMessages: []
                })
            });

            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should preserve the cooldown outcome when one of several triggers matches while on cooldown and another trigger does not match', async () => {
            // Regression test: previously the reason from the last-checked trigger
            // ('TriggerNotSatisfied' for '/bar') would overwrite the earlier
            // 'OnCooldown' reason from '/foo', silently swallowing the cooldown message.
            const handler = mock(() => {});
            const action = buildAction({
                trigger: ['/foo', '/bar'],
                handler,
                providers: {
                    cooldownProvider: () =>
                        new CooldownInfo(60 as Seconds, 'On cooldown!')
                }
            });
            const { ctx } = createContext(action, {
                text: '/foo',
                storage: createMockStorage({
                    lastExecutedDate: Date.now(),
                    pinnedMessages: []
                })
            });

            const responses = await action.exec(ctx);

            expect(handler).not.toHaveBeenCalled();
            expect(responses).toHaveLength(1);
            expect((responses[0] as TextMessage).content).toBe('On cooldown!');
        });

        test('should not update lastExecutedDate when handler calls ctx.skipCooldown()', async () => {
            const state: IActionState = {
                lastExecutedDate: 0,
                pinnedMessages: []
            };
            const action = buildAction({
                handler: (ctx) => {
                    ctx.skipCooldown();
                }
            });
            const { ctx, storage } = createContext(action, {
                storage: createMockStorage(state)
            });

            await action.exec(ctx);

            expect(state.lastExecutedDate).toBe(0);
            expect(storage.saveActionExecutionResult).toHaveBeenCalledTimes(1);
        });

        test('should honor a custom cooldown set via ctx.startCustomCooldown()', async () => {
            let callCount = 0;
            const action = buildAction({
                handler: (ctx) => {
                    callCount++;
                    ctx.startCustomCooldown(3600 as Seconds);
                }
            });
            const state: IActionState = {
                lastExecutedDate: 0,
                pinnedMessages: []
            };
            const storage = createMockStorage(state);

            const { ctx: firstCtx } = createContext(action, { storage });
            await action.exec(firstCtx);
            state.lastExecutedDate = Date.now();

            const { ctx: secondCtx } = createContext(action, { storage });
            await action.exec(secondCtx);

            expect(callCount).toBe(1);
        });
    });

    describe('exec - state persistence', () => {
        test('should save state after successful execution', async () => {
            const action = buildAction({ handler: () => {} });
            const { ctx, storage } = createContext(action);

            await action.exec(ctx);

            expect(storage.saveActionExecutionResult).toHaveBeenCalledTimes(1);
        });

        test('should update lastExecutedDate on successful execution', async () => {
            const state: IActionState = {
                lastExecutedDate: 0,
                pinnedMessages: []
            };
            const action = buildAction({ handler: () => {} });
            const { ctx } = createContext(action, {
                storage: createMockStorage(state)
            });

            await action.exec(ctx);

            expect(state.lastExecutedDate).toBeGreaterThan(0);
        });
    });

    describe('exec - ratelimit', () => {
        test('should serialize concurrent executions for the same chat when a ratelimit is configured', async () => {
            const order: string[] = [];
            let releaseFirst!: () => void;
            const firstGate = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            let callCount = 0;

            const action = buildAction({
                maxAllowedSimultaniousExecutions: 1,
                handler: async () => {
                    callCount++;
                    if (callCount === 1) {
                        order.push('start-1');
                        await firstGate;
                        order.push('end-1');
                    } else {
                        order.push('start-2');
                    }
                }
            });

            const { ctx: ctx1 } = createContext(action);
            const { ctx: ctx2 } = createContext(action);

            const p1 = action.exec(ctx1);
            await new Promise((resolve) => setImmediate(resolve));
            const p2 = action.exec(ctx2);
            await new Promise((resolve) => setImmediate(resolve));

            expect(order).toEqual(['start-1']);

            releaseFirst();
            await Promise.all([p1, p2]);

            expect(order).toEqual(['start-1', 'end-1', 'start-2']);
        });

        test('should not serialize executions when ratelimit is unlimited (0)', async () => {
            const order: string[] = [];
            let releaseFirst!: () => void;
            const firstGate = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            let callCount = 0;

            const action = buildAction({
                maxAllowedSimultaniousExecutions: 0,
                handler: async () => {
                    callCount++;
                    if (callCount === 1) {
                        await firstGate;
                        order.push('end-1');
                    } else {
                        order.push('start-2');
                    }
                }
            });

            const { ctx: ctx1 } = createContext(action);
            const { ctx: ctx2 } = createContext(action);

            const p1 = action.exec(ctx1);
            await new Promise((resolve) => setImmediate(resolve));
            const p2 = action.exec(ctx2);
            await new Promise((resolve) => setImmediate(resolve));

            // Second call was able to start before the first released its gate.
            expect(order).toEqual(['start-2']);

            releaseFirst();
            await Promise.all([p1, p2]);
        });
    });
});
