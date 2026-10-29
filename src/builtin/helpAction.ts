import { CommandActionInternal } from '../entities/actions/commandAction';
import { ActionStateBase } from '../entities/states/actionStateBase';
import { CommandActionBuilder } from '../helpers/builders/commandActionBuilder';
import { TELEGRAM_MESSAGE_LENGTH_LIMIT } from '../helpers/constants';
import { IActionState } from '../types/actionState';
import { Seconds } from '../types/timeValues';

function splitIntoMessages(readmes: string[]) {
    const messages: string[] = [];
    let current = '';

    for (const readme of readmes) {
        const joined = current ? `${current}

${readme}` : readme;

        if (current && joined.length > TELEGRAM_MESSAGE_LENGTH_LIMIT) {
            messages.push(current);
            current = readme;
        } else {
            current = joined;
        }
    }

    if (current) messages.push(current);

    return messages;
}

export function buildHelpCommand(
    commands: CommandActionInternal<IActionState>[],
    botUsername: string
) {
    const helpEntries = commands
        .map((command) => ({
            command,
            readme: command.readmeFactory(botUsername)
        }))
        .filter((entry) => !!entry.readme);

    const helpCommandBuilder = new CommandActionBuilder('Reaction.Help')
        .on(['/help', `/help@${botUsername}`])
        .do((ctx) => {
            const readmes = helpEntries
                .filter((entry) => entry.command.canExecuteIn(ctx))
                .map((entry) => entry.readme);

            for (const message of splitIntoMessages(readmes)) {
                ctx.reply.withText(message);
            }
        })
        .withRatelimit(1)
        .withCooldown({
            cooldown: 60 as Seconds
        });

    if (helpEntries.length == 0) helpCommandBuilder.disabled();

    return helpCommandBuilder.build() as CommandActionInternal<ActionStateBase>;
}
