export class ActionPermissionsData {
    constructor(
        readonly userIdsWhitelist: number[],
        readonly chatIdsWhitelist: number[],
        readonly chatIdsBlacklist: number[]
    ) {}
}
