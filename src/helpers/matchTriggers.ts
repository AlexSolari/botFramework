import { CommandTrigger } from '../types/commandTrigger';
import { MessageType, MessageTypeValue } from '../types/messageTypes';
import { REGEX_MATCH_LIMIT } from './constants';

/**
 * Checks whether any trigger matches the message, stopping at the first match.
 * Does not depend on action context, so it can be used to filter out actions before context is created.
 */
export function checkTriggers(
    triggers: CommandTrigger[],
    text: string,
    type: MessageTypeValue
) {
    let lowerCaseText: string | undefined;

    for (const trigger of triggers) {
        if (trigger == MessageType.Any || trigger == type) return true;

        if (typeof trigger == 'string') {
            lowerCaseText ??= text.toLowerCase();
            if (lowerCaseText == trigger.toLowerCase()) return true;

            continue;
        }

        trigger.lastIndex = 0;
        if (trigger.test(text)) return true;
    }

    return false;
}

/**
 * Collects matches of every regex trigger. Call it after `checkTriggers` confirmed the match.
 */
export function getMatchResults(triggers: CommandTrigger[], text: string) {
    const matchResults: RegExpExecArray[] = [];

    for (const trigger of triggers) {
        if (typeof trigger == 'string') continue;

        trigger.lastIndex = 0;

        const execResult = trigger.exec(text);
        if (execResult == null) continue;

        matchResults.push(execResult);

        if (trigger.global) {
            let regexMatchLimit = REGEX_MATCH_LIMIT;

            while (regexMatchLimit > 0) {
                const nextResult = trigger.exec(text);

                if (nextResult == null) break;

                matchResults.push(nextResult);
                regexMatchLimit -= 1;
            }
        }
    }

    return matchResults;
}
