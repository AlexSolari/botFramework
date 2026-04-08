export class UserInfo {
    constructor(
        /** Id of a user that sent a message that triggered this action. `null` if the user is unknown. */
        readonly id: number | null,
        /** Name of a user that sent a message that triggered this action. `Unknown user` if the user is unknown. */
        readonly name: string
    ) {}
}
