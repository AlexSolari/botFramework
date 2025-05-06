import { MessageType } from './messageTypes';

export type CommandTrigger =
    | (typeof MessageType)[keyof typeof MessageType]
    | string
    | RegExp;
