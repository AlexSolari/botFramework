import { describe, test, expect } from 'bun:test';
import { CommandActionBuilder } from '../../src/helpers/builders/commandActionBuilder';
import { ScheduledActionBuilder } from '../../src/helpers/builders/scheduledActionBuilder';
import { InlineQueryActionBuilder } from '../../src/helpers/builders/inlineQueryActionBuilder';
import { CommandActionInternal } from '../../src/entities/actions/commandAction';
import { ScheduledActionInternal } from '../../src/entities/actions/scheduledAction';
import { InlineQueryActionInternal } from '../../src/entities/actions/inlineQueryAction';
import { CooldownInfo } from '../../src/dtos/cooldownInfo';
import { ActionStateBase } from '../../src/entities/states/actionStateBase';
import { MessageContext } from '../../src/entities/context/messageContext';
import { ChatContext } from '../../src/entities/context/chatContext';
import { InlineQueryContext } from '../../src/entities/context/inlineQueryContext';
import { IActionState } from '../../src/types/actionState';
import { HoursOfDay, Seconds } from '../../src/types/timeValues';

const messageCtx = {} as MessageContext<IActionState>;
const chatCtx = {} as ChatContext<IActionState>;
const inlineCtx = {} as InlineQueryContext;

function buildCommand(
    configure: (builder: CommandActionBuilder) => CommandActionBuilder
) {
    return configure(
        new CommandActionBuilder('Test').on('/test')
    ).build() as CommandActionInternal<ActionStateBase>;
}

describe('CommandActionBuilder', () => {
    test('should default to an active command without cooldown or restrictions', () => {
        const action = buildCommand((builder) => builder);

        expect(action['isActiveProvider'](messageCtx)).toBe(true);
        expect(action['cooldownInfoProvider'](messageCtx).cooldown).toBe(
            0 as Seconds
        );
        expect(action['chatsWhitelistProvider'](messageCtx)).toEqual([]);
        expect(action['chatsBlacklistProvider'](messageCtx)).toEqual([]);
        expect(action['usersWhitelistProvider'](messageCtx)).toEqual([]);
    });

    test('should use every provider passed to withConfiguration', () => {
        const providers = {
            cooldownProvider: () => new CooldownInfo(30 as Seconds),
            isActiveProvider: () => false,
            chatsBlacklistProvider: () => [1],
            chatsWhitelistProvider: () => [2],
            usersWhitelistProvider: () => [3]
        };

        const action = buildCommand((builder) =>
            builder.withConfiguration(providers)
        );

        expect(action['cooldownInfoProvider']).toBe(providers.cooldownProvider);
        expect(action['isActiveProvider']).toBe(providers.isActiveProvider);
        expect(action['chatsBlacklistProvider']).toBe(
            providers.chatsBlacklistProvider
        );
        expect(action['chatsWhitelistProvider']).toBe(
            providers.chatsWhitelistProvider
        );
        expect(action['usersWhitelistProvider']).toBe(
            providers.usersWhitelistProvider
        );
    });

    test('should accept the configuration as a function and keep the providers it leaves out', () => {
        const isActiveProvider = () => false;

        const action = buildCommand((builder) =>
            builder.in([5]).withConfiguration(() => ({ isActiveProvider }))
        );

        expect(action['isActiveProvider']).toBe(isActiveProvider);
        expect(action['chatsWhitelistProvider'](messageCtx)).toEqual([5]);
    });

    test('should disable the command', () => {
        const action = buildCommand((builder) => builder.disabled());

        expect(action['isActiveProvider'](messageCtx)).toBe(false);
    });

    test('should use the condition set with when', () => {
        const condition = () => false;

        const action = buildCommand((builder) => builder.when(condition));

        expect(action.condition).toBe(condition);
    });
});

describe('ScheduledActionBuilder', () => {
    test('should default to an active action at hour 0 in no chats', () => {
        const action =
            new ScheduledActionBuilder('Test').build() as ScheduledActionInternal<ActionStateBase>;

        expect(action['activeProvider'](chatCtx)).toBe(true);
        expect(action['timeinHoursProvider'](chatCtx)).toBe(0);
        expect(action['chatsWhitelistProvider'](chatCtx)).toEqual([]);
    });

    test('should use every provider passed to withConfiguration', () => {
        const providers = {
            timeinHoursProvider: () => 9 as HoursOfDay,
            isActiveProvider: () => false,
            chatsWhitelistProvider: () => [7]
        };

        const action = new ScheduledActionBuilder('Test')
            .withConfiguration(providers)
            .build() as ScheduledActionInternal<ActionStateBase>;

        expect(action['timeinHoursProvider']).toBe(
            providers.timeinHoursProvider
        );
        expect(action['activeProvider']).toBe(providers.isActiveProvider);
        expect(action['chatsWhitelistProvider']).toBe(
            providers.chatsWhitelistProvider
        );
    });

    test('should keep the providers that withConfiguration leaves out', () => {
        const action = new ScheduledActionBuilder('Test')
            .in([7])
            .runAt(9)
            .withConfiguration({})
            .build() as ScheduledActionInternal<ActionStateBase>;

        expect(action['timeinHoursProvider'](chatCtx)).toBe(9);
        expect(action['chatsWhitelistProvider'](chatCtx)).toEqual([7]);
    });

    test('should disable the action', () => {
        const action = new ScheduledActionBuilder('Test')
            .disabled()
            .build() as ScheduledActionInternal<ActionStateBase>;

        expect(action['activeProvider'](chatCtx)).toBe(false);
    });
});

describe('InlineQueryActionBuilder', () => {
    test('should use the pattern and handler', () => {
        const pattern = /search (.+)/;
        const handler = () => {};

        const action = new InlineQueryActionBuilder('Test')
            .on(pattern)
            .do(handler)
            .build() as InlineQueryActionInternal;

        expect(action.pattern).toBe(pattern);
        expect(action.handler).toBe(handler);
        expect(action.isActiveProvider(inlineCtx)).toBe(true);
    });

    test('should disable the action', () => {
        const action = new InlineQueryActionBuilder('Test')
            .disabled()
            .build() as InlineQueryActionInternal;

        expect(action.isActiveProvider(inlineCtx)).toBe(false);
    });

    test('should use the provider passed to withConfiguration, and keep the default without one', () => {
        const isActiveProvider = () => false;

        const configured = new InlineQueryActionBuilder('Test')
            .withConfiguration({ isActiveProvider })
            .build() as InlineQueryActionInternal;
        const unconfigured = new InlineQueryActionBuilder('Test')
            .withConfiguration({})
            .build() as InlineQueryActionInternal;

        expect(configured.isActiveProvider).toBe(isActiveProvider);
        expect(unconfigured.isActiveProvider(inlineCtx)).toBe(true);
    });
});
