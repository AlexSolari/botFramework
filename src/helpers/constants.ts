import { Hours, Milliseconds } from '../types/timeValues';
import { hoursToSeconds } from './timeConvertions';

export const REGEX_MATCH_LIMIT = 100;
export const MESSAGE_HISTORY_LENGTH_LIMIT = 100;
export const DEFAULT_SCHEDULED_ACTION_PERIOD_SECONDS = hoursToSeconds(
    1 as Hours
);
export const DEFAULT_STORAGE_DIRECTORY = 'storage';
export const TELEGRAM_RATELIMIT_DELAY = 35 as Milliseconds;
export const TELEGRAM_ERROR_QUOTE_INVALID = 'QUOTE_TEXT_INVALID';
