import { User } from './botApi.generated';

/** Result of `getMe`: bots always have a username. */
export type BotInfo = User & { username: string };
