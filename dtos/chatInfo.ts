import { IncomingMessage } from './incomingMessage';

export class ChatInfo {
    constructor(
        /** Id of a chat that action is executed in. */
        readonly id: number,
        /** Name of a chat that action is executed in. */
        readonly name: string,
        /** Last 100 messages in chat where action is executed */
        readonly messageHistory: IncomingMessage[]
    ) {}
}
