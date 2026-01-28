import { describe, test, expect } from 'bun:test';
import { CommandTriggerCheckResult } from '../../src/dtos/commandTriggerCheckResult';

describe('CommandTriggerCheckResult', () => {
    describe('static factory methods', () => {
        describe('Trigger', () => {
            test('should create result with shouldExecute true', () => {
                const result = CommandTriggerCheckResult.Trigger();

                expect(result.shouldExecute).toBe(true);
            });

            test('should create result with empty matchResults', () => {
                const result = CommandTriggerCheckResult.Trigger();

                expect(result.matchResults).toEqual([]);
            });

            test('should create result with skipCooldown false', () => {
                const result = CommandTriggerCheckResult.Trigger();

                expect(result.skipCooldown).toBe(false);
            });

            test('should create result with no reason', () => {
                const result = CommandTriggerCheckResult.Trigger();

                expect(result.reason).toBeUndefined();
            });
        });

        describe('DoNotTrigger', () => {
            test('should create result with shouldExecute false', () => {
                const result = CommandTriggerCheckResult.DoNotTrigger('TriggerNotSatisfied');

                expect(result.shouldExecute).toBe(false);
            });

            test('should create result with skipCooldown false', () => {
                const result = CommandTriggerCheckResult.DoNotTrigger('CustomConditionNotMet');

                expect(result.skipCooldown).toBe(false);
            });

            test('should store the reason', () => {
                const result = CommandTriggerCheckResult.DoNotTrigger('UserForbidden');

                expect(result.reason).toBe('UserForbidden');
            });

            test('should create result with empty matchResults', () => {
                const result = CommandTriggerCheckResult.DoNotTrigger('Other');

                expect(result.matchResults).toEqual([]);
            });
        });

        describe('DontTriggerAndSkipCooldown', () => {
            test('should create result with shouldExecute false', () => {
                const result = CommandTriggerCheckResult.DontTriggerAndSkipCooldown('ActionDisabled');

                expect(result.shouldExecute).toBe(false);
            });

            test('should create result with skipCooldown true', () => {
                const result = CommandTriggerCheckResult.DontTriggerAndSkipCooldown('ActionDisabled');

                expect(result.skipCooldown).toBe(true);
            });

            test('should store the reason', () => {
                const result = CommandTriggerCheckResult.DontTriggerAndSkipCooldown('ChatForbidden');

                expect(result.reason).toBe('ChatForbidden');
            });

            test('should create result with empty matchResults', () => {
                const result = CommandTriggerCheckResult.DontTriggerAndSkipCooldown('OnCooldown');

                expect(result.matchResults).toEqual([]);
            });
        });
    });

    describe('constructor', () => {
        test('should set all properties correctly', () => {
            const matchResults = [['test'] as unknown as RegExpExecArray];
            const result = new CommandTriggerCheckResult(true, matchResults, false, 'Other');

            expect(result.shouldExecute).toBe(true);
            expect(result.matchResults).toBe(matchResults);
            expect(result.skipCooldown).toBe(false);
            expect(result.reason).toBe('Other');
        });

        test('should allow undefined reason', () => {
            const result = new CommandTriggerCheckResult(true, [], false);

            expect(result.reason).toBeUndefined();
        });
    });

    describe('mergeWith', () => {
        test('should merge shouldExecute with OR logic - both false', () => {
            const result1 = CommandTriggerCheckResult.DoNotTrigger('Other');
            const result2 = CommandTriggerCheckResult.DoNotTrigger('TriggerNotSatisfied');

            const merged = result1.mergeWith(result2);

            expect(merged.shouldExecute).toBe(false);
        });

        test('should merge shouldExecute with OR logic - first true', () => {
            const result1 = CommandTriggerCheckResult.Trigger();
            const result2 = CommandTriggerCheckResult.DoNotTrigger('Other');

            const merged = result1.mergeWith(result2);

            expect(merged.shouldExecute).toBe(true);
        });

        test('should merge shouldExecute with OR logic - second true', () => {
            const result1 = CommandTriggerCheckResult.DoNotTrigger('Other');
            const result2 = CommandTriggerCheckResult.Trigger();

            const merged = result1.mergeWith(result2);

            expect(merged.shouldExecute).toBe(true);
        });

        test('should merge shouldExecute with OR logic - both true', () => {
            const result1 = CommandTriggerCheckResult.Trigger();
            const result2 = CommandTriggerCheckResult.Trigger();

            const merged = result1.mergeWith(result2);

            expect(merged.shouldExecute).toBe(true);
        });

        test('should concatenate matchResults', () => {
            const match1 = ['match1'] as unknown as RegExpExecArray;
            const match2 = ['match2'] as unknown as RegExpExecArray;
            const result1 = new CommandTriggerCheckResult(true, [match1], false);
            const result2 = new CommandTriggerCheckResult(false, [match2], false);

            const merged = result1.mergeWith(result2);

            expect(merged.matchResults).toEqual([match1, match2]);
        });

        test('should merge skipCooldown with OR logic - both false', () => {
            const result1 = CommandTriggerCheckResult.DoNotTrigger('Other');
            const result2 = CommandTriggerCheckResult.DoNotTrigger('Other');

            const merged = result1.mergeWith(result2);

            expect(merged.skipCooldown).toBe(false);
        });

        test('should merge skipCooldown with OR logic - first true', () => {
            const result1 = CommandTriggerCheckResult.DontTriggerAndSkipCooldown('ActionDisabled');
            const result2 = CommandTriggerCheckResult.DoNotTrigger('Other');

            const merged = result1.mergeWith(result2);

            expect(merged.skipCooldown).toBe(true);
        });

        test('should merge skipCooldown with OR logic - second true', () => {
            const result1 = CommandTriggerCheckResult.DoNotTrigger('Other');
            const result2 = CommandTriggerCheckResult.DontTriggerAndSkipCooldown('ActionDisabled');

            const merged = result1.mergeWith(result2);

            expect(merged.skipCooldown).toBe(true);
        });

        test('should take reason from other result', () => {
            const result1 = CommandTriggerCheckResult.DoNotTrigger('UserForbidden');
            const result2 = CommandTriggerCheckResult.DoNotTrigger('ChatForbidden');

            const merged = result1.mergeWith(result2);

            expect(merged.reason).toBe('ChatForbidden');
        });

        test('should be chainable', () => {
            const result1 = CommandTriggerCheckResult.DoNotTrigger('Other');
            const result2 = CommandTriggerCheckResult.DoNotTrigger('Other');
            const result3 = CommandTriggerCheckResult.Trigger();

            const merged = result1.mergeWith(result2).mergeWith(result3);

            expect(merged.shouldExecute).toBe(true);
        });

        test('should use reduce pattern correctly', () => {
            const results = [
                CommandTriggerCheckResult.DoNotTrigger('Other'),
                CommandTriggerCheckResult.DoNotTrigger('TriggerNotSatisfied'),
                CommandTriggerCheckResult.Trigger()
            ];

            const final = results.reduce(
                (acc, curr) => acc.mergeWith(curr),
                CommandTriggerCheckResult.DoNotTrigger('Other')
            );

            expect(final.shouldExecute).toBe(true);
        });
    });

    describe('SkipTriggerReasons', () => {
        test('should accept UserIdMissing reason', () => {
            const result = CommandTriggerCheckResult.DoNotTrigger('UserIdMissing');
            expect(result.reason).toBe('UserIdMissing');
        });

        test('should accept UserForbidden reason', () => {
            const result = CommandTriggerCheckResult.DoNotTrigger('UserForbidden');
            expect(result.reason).toBe('UserForbidden');
        });

        test('should accept OnCooldown reason', () => {
            const result = CommandTriggerCheckResult.DoNotTrigger('OnCooldown');
            expect(result.reason).toBe('OnCooldown');
        });

        test('should accept CustomConditionNotMet reason', () => {
            const result = CommandTriggerCheckResult.DoNotTrigger('CustomConditionNotMet');
            expect(result.reason).toBe('CustomConditionNotMet');
        });

        test('should accept TriggerNotSatisfied reason', () => {
            const result = CommandTriggerCheckResult.DoNotTrigger('TriggerNotSatisfied');
            expect(result.reason).toBe('TriggerNotSatisfied');
        });

        test('should accept ActionDisabled reason', () => {
            const result = CommandTriggerCheckResult.DontTriggerAndSkipCooldown('ActionDisabled');
            expect(result.reason).toBe('ActionDisabled');
        });

        test('should accept ChatForbidden reason', () => {
            const result = CommandTriggerCheckResult.DontTriggerAndSkipCooldown('ChatForbidden');
            expect(result.reason).toBe('ChatForbidden');
        });
    });
});
