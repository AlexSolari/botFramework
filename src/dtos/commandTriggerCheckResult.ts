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
        public shouldExecute: boolean,
        public matchResults: RegExpExecArray[],
        public skipCooldown: boolean,
        public reason?: SkipTriggerReasons
    ) {}

    mergeWith(other: CommandTriggerCheckResult): this {
        this.shouldExecute = this.shouldExecute || other.shouldExecute;
        this.matchResults.push(...other.matchResults);
        this.skipCooldown = this.skipCooldown || other.skipCooldown;
        this.reason = other.reason;
        return this;
    }
}
