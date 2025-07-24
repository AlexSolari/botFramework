import { CommandActionBuilder } from '../helpers/builders/commandActionBuilder';
import { Seconds } from '../types/timeValues';

export function buildHelpCommand(readmes: string[], botUsername: string) {
    const helpCommandBuilder = new CommandActionBuilder('Reaction.Help')
        .on(['/help', `/help@${botUsername}`])
        .do((ctx) => {
            ctx.reply.withText(readmes.join('\n\n'));
        })
        .withCooldown({
            cooldown: { seconds: 60 as Seconds }
        });

    if (readmes.length == 0) helpCommandBuilder.disabled();

    return helpCommandBuilder.build();
}
