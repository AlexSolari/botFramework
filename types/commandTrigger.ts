export enum NonTextMessage {
    Any
}

export type CommandTrigger = string | RegExp | NonTextMessage.Any;
