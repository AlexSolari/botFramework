import { describe, test, expect } from 'bun:test';
import {
    secondsToMilliseconds,
    hoursToMilliseconds,
    hoursToSeconds
} from '../../src/helpers/timeConvertions';
import { Hours, Milliseconds, Seconds } from '../../src/types/timeValues';

describe('timeConvertions', () => {
    describe('secondsToMilliseconds', () => {
        test('should convert 1 second to 1000 milliseconds', () => {
            const result = secondsToMilliseconds(1 as Seconds);
            expect(result).toBe(1000 as Milliseconds);
        });

        test('should convert 0 seconds to 0 milliseconds', () => {
            const result = secondsToMilliseconds(0 as Seconds);
            expect(result).toBe(0 as Milliseconds);
        });

        test('should convert fractional seconds', () => {
            const result = secondsToMilliseconds(0.5 as Seconds);
            expect(result).toBe(500 as Milliseconds);
        });

        test('should convert large values', () => {
            const result = secondsToMilliseconds(3600 as Seconds); // 1 hour in seconds
            expect(result).toBe(3600000 as Milliseconds);
        });

        test('should handle decimal precision', () => {
            const result = secondsToMilliseconds(1.234 as Seconds);
            expect(result).toBe(1234 as Milliseconds);
        });

        // Real usage: ScheduledActionProcessor uses this for period conversion
        test('should convert period for scheduled action processor', () => {
            const periodInSeconds = 3600 as Seconds; // Default 1 hour
            const result = secondsToMilliseconds(periodInSeconds);
            expect(result).toBe(3600000 as Milliseconds);
        });
    });

    describe('hoursToMilliseconds', () => {
        test('should convert 1 hour to 3600000 milliseconds', () => {
            const result = hoursToMilliseconds(1 as Hours);
            expect(result).toBe(3600000 as Milliseconds);
        });

        test('should convert 0 hours to 0 milliseconds', () => {
            const result = hoursToMilliseconds(0 as Hours);
            expect(result).toBe(0 as Milliseconds);
        });

        test('should convert 24 hours to correct milliseconds', () => {
            const result = hoursToMilliseconds(24 as Hours);
            expect(result).toBe(86400000 as Milliseconds); // 24 * 60 * 60 * 1000
        });

        test('should convert fractional hours', () => {
            const result = hoursToMilliseconds(0.5 as Hours);
            expect(result).toBe(1800000 as Milliseconds); // 30 minutes
        });

        test('should convert quarter hour', () => {
            const result = hoursToMilliseconds(0.25 as Hours);
            expect(result).toBe(900000 as Milliseconds); // 15 minutes
        });
    });

    describe('hoursToSeconds', () => {
        test('should convert 1 hour to 3600 seconds', () => {
            const result = hoursToSeconds(1 as Hours);
            expect(result).toBe(3600 as Seconds);
        });

        test('should convert 0 hours to 0 seconds', () => {
            const result = hoursToSeconds(0 as Hours);
            expect(result).toBe(0 as Seconds);
        });

        test('should convert 24 hours to correct seconds', () => {
            const result = hoursToSeconds(24 as Hours);
            expect(result).toBe(86400 as Seconds);
        });

        test('should convert fractional hours', () => {
            const result = hoursToSeconds(0.5 as Hours);
            expect(result).toBe(1800 as Seconds); // 30 minutes
        });

        // Real usage: ActionProcessingService default scheduledPeriod
        test('should convert default scheduled period', () => {
            const defaultPeriod = hoursToSeconds(1 as Hours);
            expect(defaultPeriod).toBe(3600 as Seconds);
        });
    });

    describe('conversion consistency', () => {
        test('hoursToMilliseconds should equal hoursToSeconds * 1000', () => {
            const hours = 2 as Hours;
            const viaMilliseconds = hoursToMilliseconds(hours);
            const viaSeconds = secondsToMilliseconds(hoursToSeconds(hours));

            expect(viaMilliseconds).toBe(viaSeconds);
        });

        test('should maintain precision for common values', () => {
            // Common scheduling intervals
            expect(hoursToSeconds(1 as Hours)).toBe(3600 as Seconds);
            expect(hoursToSeconds(6 as Hours)).toBe(21600 as Seconds);
            expect(hoursToSeconds(12 as Hours)).toBe(43200 as Seconds);
            expect(hoursToSeconds(24 as Hours)).toBe(86400 as Seconds);
        });
    });

    describe('type safety', () => {
        test('return types are correctly branded', () => {
            const ms: Milliseconds = secondsToMilliseconds(1 as Seconds);
            const s: Seconds = hoursToSeconds(1 as Hours);
            const msFromHours: Milliseconds = hoursToMilliseconds(1 as Hours);

            // These should compile and be usable
            expect(typeof ms).toBe('number');
            expect(typeof s).toBe('number');
            expect(typeof msFromHours).toBe('number');
        });
    });
});
