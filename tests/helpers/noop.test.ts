import { describe, test, expect } from 'bun:test';
import { Noop } from '../../src/helpers/noop';

describe('Noop', () => {
    test('NoResponse is an empty array', () => {
        expect(Noop.NoResponse).toEqual([]);
        expect(Array.isArray(Noop.NoResponse)).toBe(true);
        expect(Noop.NoResponse.length).toBe(0);
    });

    test('true returns true for any argument', () => {
        expect(Noop.true('anything')).toBe(true);
        expect(Noop.true(null)).toBe(true);
        expect(Noop.true(0)).toBe(true);
    });

    test('false returns false for any argument', () => {
        expect(Noop.false('anything')).toBe(false);
        expect(Noop.false(null)).toBe(false);
        expect(Noop.false(1)).toBe(false);
    });

    test('emptyString returns empty string', () => {
        expect(Noop.emptyString()).toBe('');
    });

    test('call returns a resolved promise', async () => {
        const result = await Noop.call('anything');

        expect(result).toBeUndefined();
    });

    test('call with two arguments returns a resolved promise', async () => {
        const result = await Noop.call('arg1', 'arg2');

        expect(result).toBeUndefined();
    });
});
