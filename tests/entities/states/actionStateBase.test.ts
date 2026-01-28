import { describe, test, expect } from 'bun:test';
import { ActionStateBase } from '../../../src/entities/states/actionStateBase';
import { IActionState } from '../../../src/types/actionState';

describe('ActionStateBase', () => {
    describe('default values', () => {
        test('should have empty pinnedMessages array', () => {
            const state = new ActionStateBase();

            expect(state.pinnedMessages).toEqual([]);
        });

        test('should have lastExecutedDate as 0', () => {
            const state = new ActionStateBase();

            expect(state.lastExecutedDate).toBe(0);
        });
    });

    describe('pinnedMessages', () => {
        test('should allow adding message ids', () => {
            const state = new ActionStateBase();
            state.pinnedMessages.push(123, 456);

            expect(state.pinnedMessages).toEqual([123, 456]);
        });

        test('should allow setting to new array', () => {
            const state = new ActionStateBase();
            state.pinnedMessages = [1, 2, 3];

            expect(state.pinnedMessages).toEqual([1, 2, 3]);
        });

        test('should allow clearing', () => {
            const state = new ActionStateBase();
            state.pinnedMessages = [100, 200];
            state.pinnedMessages = [];

            expect(state.pinnedMessages).toEqual([]);
        });
    });

    describe('lastExecutedDate', () => {
        test('should allow setting timestamp', () => {
            const state = new ActionStateBase();
            const now = Date.now();
            state.lastExecutedDate = now;

            expect(state.lastExecutedDate).toBe(now);
        });

        test('should allow updating to new timestamp', () => {
            const state = new ActionStateBase();
            state.lastExecutedDate = 1000;
            state.lastExecutedDate = 2000;

            expect(state.lastExecutedDate).toBe(2000);
        });

        test('should handle epoch timestamp', () => {
            const state = new ActionStateBase();
            state.lastExecutedDate = 0;

            expect(state.lastExecutedDate).toBe(0);
        });
    });

    describe('IActionState interface compliance', () => {
        test('should implement IActionState interface', () => {
            const state: IActionState = new ActionStateBase();

            expect(state.pinnedMessages).toBeDefined();
            expect(state.lastExecutedDate).toBeDefined();
        });

        test('should be assignable to IActionState', () => {
            const state = new ActionStateBase();
            const assignable: IActionState = state;

            expect(assignable).toBe(state);
        });
    });

    describe('inheritance/extension', () => {
        test('should be extensible for custom state', () => {
            class CustomActionState extends ActionStateBase {
                customProperty: string = 'default';
                counter: number = 0;
            }

            const state = new CustomActionState();
            state.customProperty = 'modified';
            state.counter = 5;
            state.pinnedMessages = [1, 2];
            state.lastExecutedDate = Date.now();

            expect(state.customProperty).toBe('modified');
            expect(state.counter).toBe(5);
            expect(state.pinnedMessages).toEqual([1, 2]);
        });

        test('extended class should still implement IActionState', () => {
            class ExtendedState extends ActionStateBase {
                extra: boolean = true;
            }

            const state: IActionState = new ExtendedState();

            expect(state.pinnedMessages).toEqual([]);
            expect(state.lastExecutedDate).toBe(0);
        });
    });

    describe('isolation', () => {
        test('should have separate pinnedMessages arrays per instance', () => {
            const state1 = new ActionStateBase();
            const state2 = new ActionStateBase();

            state1.pinnedMessages.push(1);
            state2.pinnedMessages.push(2);

            expect(state1.pinnedMessages).toEqual([1]);
            expect(state2.pinnedMessages).toEqual([2]);
        });

        test('should have separate lastExecutedDate per instance', () => {
            const state1 = new ActionStateBase();
            const state2 = new ActionStateBase();

            state1.lastExecutedDate = 1000;
            state2.lastExecutedDate = 2000;

            expect(state1.lastExecutedDate).toBe(1000);
            expect(state2.lastExecutedDate).toBe(2000);
        });
    });
});
