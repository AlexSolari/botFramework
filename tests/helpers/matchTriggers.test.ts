import { describe, test, expect } from 'bun:test';
import { matchTriggers } from '../../src/helpers/matchTriggers';
import { MessageType } from '../../src/types/messageTypes';
import { REGEX_MATCH_LIMIT } from '../../src/helpers/constants';

describe('matchTriggers', () => {
    test('should return null when no trigger matches', () => {
        const result = matchTriggers(
            ['/start', /^!ping$/, MessageType.Photo],
            'hello',
            MessageType.Text
        );

        expect(result).toBeNull();
    });

    test('should match exact string trigger case-insensitively without match results', () => {
        const result = matchTriggers(['/Start'], '/sTART', MessageType.Text);

        expect(result).toEqual([]);
    });

    test('should not match string trigger on partial text', () => {
        const result = matchTriggers(['/start'], '/start now', MessageType.Text);

        expect(result).toBeNull();
    });

    test('should match message type trigger', () => {
        const result = matchTriggers(
            [MessageType.Photo],
            'caption',
            MessageType.Photo
        );

        expect(result).toEqual([]);
    });

    test('should match Any trigger for every message type', () => {
        const result = matchTriggers(
            [MessageType.Any],
            '',
            MessageType.Sticker
        );

        expect(result).toEqual([]);
    });

    test('should return regex match results', () => {
        const result = matchTriggers([/^\/r (\d+)$/], '/r 20', MessageType.Text);

        expect(result?.length).toBe(1);
        expect(result?.[0][1]).toBe('20');
    });

    test('should collect all matches of a global regex', () => {
        const result = matchTriggers(
            [/\[([^[]+)\]/g],
            '[one] and [two]',
            MessageType.Text
        );

        expect(result?.map((x) => x[1])).toEqual(['one', 'two']);
    });

    test('should not be affected by lastIndex left from a previous match', () => {
        const trigger = /a/g;
        trigger.lastIndex = 5;

        const result = matchTriggers([trigger], 'a', MessageType.Text);

        expect(result?.length).toBe(1);
    });

    test('should limit number of global regex matches', () => {
        const result = matchTriggers(
            [/a/g],
            'a'.repeat(REGEX_MATCH_LIMIT * 2),
            MessageType.Text
        );

        expect(result?.length).toBe(REGEX_MATCH_LIMIT + 1);
    });

    test('should collect regex results when several triggers match', () => {
        const result = matchTriggers(
            [MessageType.Text, /(\d+)/, 'nope'],
            'room 42',
            MessageType.Text
        );

        expect(result?.length).toBe(1);
        expect(result?.[0][1]).toBe('42');
    });
});
