import { describe, test, expect } from 'bun:test';
import { buildHelpCommand } from '../../src/builtin/helpAction';
import {
    CommandActionBuilder,
    CommandActionBuilderWithState
} from '../../src/helpers/builders/commandActionBuilder';
import { CommandActionInternal } from '../../src/entities/actions/commandAction';
import { MessageContextInternal } from '../../src/entities/context/messageContext';
import { ActionStateBase } from '../../src/entities/states/actionStateBase';
import { IncomingMessage } from '../../src/dtos/incomingMessage';
import { TextMessage } from '../../src/dtos/responses/textMessage';
import { TypedEventEmitter } from '../../src/types/events';
import { IActionState } from '../../src/types/actionState';
import {
    createMockBotApiClient,
    createMockScheduler,
    createMockStorage
} from '../services/actionProcessors/processorTestHelpers';
import type { BotInfo } from '../../src/types/botInfo';
import type { Message } from '../../src/types/botApi.generated';

const CHAT_ID = 555;
const USER_ID = 42;

function command(
    name: string,
    configure: (
        builder: CommandActionBuilderWithState<ActionStateBase>
    ) => CommandActionBuilderWithState<ActionStateBase> = (builder) => builder
) {
    return configure(
        new CommandActionBuilder(name).on(`/${name}`)
    ).build() as CommandActionInternal<IActionState>;
}

async function runHelp(commands: CommandActionInternal<IActionState>[]) {
    const help = buildHelpCommand(commands, 'testbot');
    const message = new IncomingMessage(
        {
            message_id: 1,
            date: Math.floor(Date.now() / 1000),
            chat: { id: CHAT_ID, type: 'group' },
            from: { id: USER_ID, is_bot: false, first_name: 'Tester' },
            text: '/help'
        } as Message,
        'TestBot',
        []
    );
    const ctx = new MessageContextInternal<ActionStateBase>(
        createMockStorage(),
        createMockScheduler(),
        new TypedEventEmitter(),
        createMockBotApiClient(),
        help,
        message,
        'TestBot',
        { username: 'testbot' } as BotInfo
    );

    const responses = await help.exec(ctx);

    return responses.map((response) => (response as TextMessage).content);
}

describe('buildHelpCommand', () => {
    test('should list only the commands that can run in the chat for the user', async () => {
        const texts = await runHelp([
            command('available', (b) => b.withHelp(() => 'available')),
            command('disabled', (b) => b.withHelp(() => 'disabled').disabled()),
            command('otherChat', (b) =>
                b.withHelp(() => 'otherChat').in([CHAT_ID + 1])
            ),
            command('blacklisted', (b) =>
                b.withHelp(() => 'blacklisted').notIn([CHAT_ID])
            ),
            command('otherUser', (b) =>
                b.withHelp(() => 'otherUser').from(USER_ID + 1)
            ),
            command('noHelp')
        ]);

        expect(texts).toEqual(['available']);
    });

    test('should split long help into messages between readmes', async () => {
        const readme = (char: string) => char.repeat(2000);

        const texts = await runHelp([
            command('first', (b) => b.withHelp(() => readme('a'))),
            command('second', (b) => b.withHelp(() => readme('b'))),
            command('third', (b) => b.withHelp(() => readme('c')))
        ]);

        expect(texts).toEqual([
            `${readme('a')}\n\n${readme('b')}`,
            readme('c')
        ]);
        expect(texts.every((text) => text.length <= 4096)).toBe(true);
    });

    test('should not reply when no command available in the chat has help', async () => {
        const texts = await runHelp([
            command('otherChat', (b) =>
                b.withHelp(() => 'otherChat').in([CHAT_ID + 1])
            )
        ]);

        expect(texts).toEqual([]);
    });
});
