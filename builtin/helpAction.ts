import { CommandActionBuilder } from '../helpers/builders/commandActionBuilder';
import { Seconds } from '../types/timeValues';

export function buildHelpCommand(readmes: string[], botUsername: string) {
    return new CommandActionBuilder('Reaction.Help')
        .on(['/help', `/help@${botUsername}`])
        .do(async (ctx) => {
            if (readmes.length == 0) return;

            ctx.reply.withText(readmes.join('\n\n'));
        })
        .cooldown(60 as Seconds)
        .build();
}
