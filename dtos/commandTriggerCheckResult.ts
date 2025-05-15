export class CommandTriggerCheckResult {
    static get DontTriggerAndSkipCooldown() {
        return new CommandTriggerCheckResult(false, [], true);
    }
    static get DoNotTrigger() {
        return new CommandTriggerCheckResult(false, [], false);
    }

    readonly shouldExecute: boolean;
    readonly matchResults: RegExpExecArray[];
    readonly skipCooldown: boolean;

    constructor(
        shouldExecute: boolean,
        matchResults: RegExpExecArray[],
        skipCooldown: boolean
    ) {
        this.shouldExecute = shouldExecute;
        this.matchResults = matchResults;
        this.skipCooldown = skipCooldown;
    }

    mergeWith(other: CommandTriggerCheckResult) {
        return new CommandTriggerCheckResult(
            this.shouldExecute || other.shouldExecute,
            this.matchResults.concat(other.matchResults),
            this.skipCooldown || other.skipCooldown
        );
    }
}
