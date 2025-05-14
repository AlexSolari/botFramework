export class ChatInfo {
    /** Id of a chat that action is executed in. */
    readonly id: number;
    /** Name of a chat that action is executed in. */
    readonly name: string;

    constructor(chatId: number, chatName: string) {
        this.id = chatId;
        this.name = chatName;
    }
}
