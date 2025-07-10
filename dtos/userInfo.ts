export class UserInfo {
    constructor(
        /** Id of a user that sent a message that triggered this action. */
        readonly id: number,
        /** Name of a user that sent a message that triggered this action. */
        readonly name: string
    ) {}
}
