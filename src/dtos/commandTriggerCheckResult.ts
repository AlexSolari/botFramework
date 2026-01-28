const _SkipTriggerReasonsObject = {
    UserIdMissing: 'UserIdMissing',
    UserForbidden: 'UserForbidden',
    OnCooldown: 'OnCooldown',
    CustomConditionNotMet: 'CustomConditionNotMet',
    TriggerNotSatisfied: 'TriggerNotSatisfied',
    Other: 'Other',
    ActionDisabled: 'ActionDisabled',
    ChatForbidden: 'ChatForbidden'
} as const;

export type SkipTriggerReasons = keyof typeof _SkipTriggerReasonsObject;

export class CommandTriggerCheckResult {
    static DontTriggerAndSkipCooldown(reason: SkipTriggerReasons) {
        return new CommandTriggerCheckResult(false, [], true, reason);
    }
    static DoNotTrigger(reason: SkipTriggerReasons) {
        return new CommandTriggerCheckResult(false, [], false, reason);
    }
    static Trigger() {
        return new CommandTriggerCheckResult(true, [], false);
    }

    constructor(
        readonly shouldExecute: boolean,
        readonly matchResults: RegExpExecArray[],
        readonly skipCooldown: boolean,
        readonly reason?: SkipTriggerReasons
    ) {}

    mergeWith(other: CommandTriggerCheckResult) {
        return new CommandTriggerCheckResult(
            this.shouldExecute || other.shouldExecute,
            this.matchResults.concat(other.matchResults),
            this.skipCooldown || other.skipCooldown,
            other.reason
        );
    }
}
