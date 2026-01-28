import { CooldownInfo } from './cooldownInfo';
import {
    CommandActionPropertyProvider,
    ScheduledActionPropertyProvider
} from '../types/propertyProvider';
import { HoursOfDay } from '../types/timeValues';

export type CommandActionProviders = {
    cooldownProvider: CommandActionPropertyProvider<CooldownInfo>;
    isActiveProvider: CommandActionPropertyProvider<boolean>;
    chatsBlacklistProvider: CommandActionPropertyProvider<number[]>;
    chatsWhitelistProvider: CommandActionPropertyProvider<number[]>;
    usersWhitelistProvider: CommandActionPropertyProvider<number[]>;
};

export type ScheduledActionProviders = {
    timeinHoursProvider: ScheduledActionPropertyProvider<HoursOfDay>;
    isActiveProvider: ScheduledActionPropertyProvider<boolean>;
    chatsWhitelistProvider: ScheduledActionPropertyProvider<number[]>;
};
