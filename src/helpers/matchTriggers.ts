import { CommandTrigger } from '../types/commandTrigger';
import { MessageType, MessageTypeValue } from '../types/messageTypes';
import { REGEX_MATCH_LIMIT } from './constants';

/**
 * Checks message against command triggers.
 * Does not depend on action context, so it can be used to filter out commands before context is created.
 * @returns Regex match results (empty if only non-regex triggers matched), or `null` if no trigger matched.
 */
export function matchTriggers(
    triggers: CommandTrigger[],
    text: string,
    type: MessageTypeValue
): RegExpExecArray[] | null {
    let matched = false;
    let lowerCaseText: string | undefined;
    const matchResults: RegExpExecArray[] = [];

    for (const trigger of triggers) {
        if (trigger == MessageType.Any || trigger == type) {
            matched = true;
            continue;
        }

        if (typeof trigger == 'string') {
            lowerCaseText ??= text.toLowerCase();
            if (lowerCaseText == trigger.toLowerCase()) matched = true;

            continue;
        }

        trigger.lastIndex = 0;

        const execResult = trigger.exec(text);
        if (execResult == null) continue;

        matched = true;
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

    return matched ? matchResults : null;
}
