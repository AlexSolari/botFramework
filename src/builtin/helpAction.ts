import { CommandActionInternal } from '../entities/actions/commandAction';
import { ActionStateBase } from '../entities/states/actionStateBase';
import { CommandActionBuilder } from '../helpers/builders/commandActionBuilder';
import { Seconds } from '../types/timeValues';

export function buildHelpCommand(readmes: string[], botUsername: string) {
    const helpCommandBuilder = new CommandActionBuilder('Reaction.Help')
        .on(['/help', `/help@${botUsername}`])
        .do((ctx) => {
            ctx.reply.withText(readmes.join('\n\n'));
        })
        .withRatelimit(1)
        .withCooldown({
            cooldown: 60 as Seconds
        });

    if (readmes.length == 0) helpCommandBuilder.disabled();

    return helpCommandBuilder.build() as CommandActionInternal<ActionStateBase>;
}
