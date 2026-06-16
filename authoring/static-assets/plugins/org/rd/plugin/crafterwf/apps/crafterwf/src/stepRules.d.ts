export declare type StepRoleRuleMode = 'all' | 'include' | 'exclude';
export declare type StepContentRuleMode = 'all' | 'any';
export interface StepRoleRule {
    mode: StepRoleRuleMode;
    roles: string[];
}
export interface StepContentRule {
    mode: StepContentRuleMode;
    pathPatterns: string[];
    contentTypes: string[];
}
export declare const CONTENT_RULE_BLOCKED_MESSAGE = "Content associated with package not allowed in Step";
export declare const ROLE_RULE_BLOCKED_MESSAGE = "Your role is not allowed to move packages into this step";
export declare function defaultRoleRule(): StepRoleRule;
export declare function defaultContentRule(): StepContentRule;
export declare function pathMatchesPattern(path: string, pattern: string): boolean;
export declare function evaluateRoleRule(rule: StepRoleRule | undefined, userGroups: string[]): {
    allowed: boolean;
    message?: string;
};
export declare function evaluateContentRule(rule: StepContentRule | undefined, contentPaths: string[], contentTypes: string[]): {
    allowed: boolean;
    message?: string;
};
export declare function evaluateStepMove(roleRule: StepRoleRule | undefined, contentRule: StepContentRule | undefined, userGroups: string[], contentPaths: string[], contentTypes: string[]): {
    allowed: boolean;
    message?: string;
};
export declare function hasConfiguredRoleRule(rule?: StepRoleRule): boolean;
export declare function hasConfiguredContentRule(rule?: StepContentRule): boolean;
