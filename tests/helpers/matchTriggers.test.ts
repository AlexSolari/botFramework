import { describe, test, expect } from 'bun:test';
import {
    checkTriggers,
    getMatchResults
} from '../../src/helpers/matchTriggers';
import { CommandTrigger } from '../../src/types/commandTrigger';
import { MessageTypeValue } from '../../src/types/messageTypes';
import { MessageType } from '../../src/types/messageTypes';
import { REGEX_MATCH_LIMIT } from '../../src/helpers/constants';

describe('getMatchResults', () => {
    test('should return empty results when no trigger matches', () => {
        const result = getMatchResults(
            ['/start', /^!ping$/, MessageType.Photo],
            'hello'
        );

        expect(result).toEqual([]);
    });

    test('should return empty results when only non-regex triggers match', () => {
        const result = getMatchResults(
            ['/Start', MessageType.Any],
            '/sTART'
        );

        expect(result).toEqual([]);
    });

    test('should return regex match results', () => {
        const result = getMatchResults([/^\/r (\d+)$/], '/r 20');

        expect(result.length).toBe(1);
        expect(result[0][1]).toBe('20');
    });

    test('should collect all matches of a global regex', () => {
        const result = getMatchResults(
            [/\[([^[]+)\]/g],
            '[one] and [two]'
        );

        expect(result.map((x) => x[1])).toEqual(['one', 'two']);
    });

    test('should not be affected by lastIndex left from a previous match', () => {
        const trigger = /a/g;
        trigger.lastIndex = 5;

        const result = getMatchResults([trigger], 'a');

        expect(result.length).toBe(1);
    });

    test('should limit number of global regex matches', () => {
        const result = getMatchResults(
            [/a/g],
            'a'.repeat(REGEX_MATCH_LIMIT * 2)
        );

        expect(result.length).toBe(REGEX_MATCH_LIMIT + 1);
    });

    test('should collect regex results when several triggers match', () => {
        const result = getMatchResults(
            [MessageType.Text, /(\d+)/, 'nope'],
            'room 42'
        );

        expect(result.length).toBe(1);
        expect(result[0][1]).toBe('42');
    });
});

describe('checkTriggers', () => {
    const cases: [string, CommandTrigger[], string, MessageTypeValue, boolean][] = [
        ['no trigger matches', ['/start', /^!ping$/, MessageType.Photo], 'hello', MessageType.Text, false],
        ['exact string, case-insensitive', ['/Start'], '/sTART', MessageType.Text, true],
        ['partial string', ['/start'], '/start now', MessageType.Text, false],
        ['message type', [MessageType.Photo], 'caption', MessageType.Photo, true],
        ['Any', [MessageType.Any], '', MessageType.Sticker, true],
        ['regex', [/^\/r (\d+)$/], '/r 20', MessageType.Text, true],
        ['global regex', [/\[([^[]+)\]/g], '[one] and [two]', MessageType.Text, true],
        ['non-matching regex after string', ['nope', /^x$/], 'y', MessageType.Text, false]
    ];

    for (const [name, triggers, text, type, expected] of cases) {
        test(`should return ${expected} for ${name}`, () => {
            expect(checkTriggers(triggers, text, type)).toBe(expected);
        });
    }

    test('should not be affected by lastIndex left from a previous match', () => {
        const trigger = /a/g;
        trigger.lastIndex = 5;

        expect(checkTriggers([trigger], 'a', MessageType.Text)).toBe(true);
    });

    test('should not run triggers after the first match', () => {
        const laterTrigger = /x/;
        let laterTriggerRuns = 0;
        laterTrigger.exec = (text: string) => {
            laterTriggerRuns++;
            return RegExp.prototype.exec.call(laterTrigger, text);
        };

        expect(checkTriggers(['hello', laterTrigger], 'hello', MessageType.Text)).toBe(true);
        expect(laterTriggerRuns).toBe(0);
    });

    test('should leave global regex ready for getMatchResults', () => {
        const trigger = /a/g;

        checkTriggers([trigger], 'aaa', MessageType.Text);

        expect(getMatchResults([trigger], 'aaa').length).toBe(3);
    });
});
