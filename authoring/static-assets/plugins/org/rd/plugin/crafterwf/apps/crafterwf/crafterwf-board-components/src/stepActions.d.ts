export declare type StepActionType = 'none' | 'request_publish_staging' | 'request_publish_live' | 'publish_staging' | 'publish_live' | 'archive_package';
export declare const STEP_ACTION_NONE: StepActionType;
export declare const STEP_ACTION_ARCHIVE_PACKAGE: StepActionType;
/** Sentinel for "no success step" in the workflow editor Select (MUI needs a non-empty value). */
export declare const SUCCESS_STEP_NONE = "__none__";
export declare const PUBLISH_ACTION_OPTIONS: Array<{
    value: StepActionType;
    label: string;
    requiresStaging?: boolean;
}>;
export declare const ARCHIVE_ACTION_OPTIONS: Array<{
    value: StepActionType;
    label: string;
}>;
export declare const STEP_ACTION_OPTIONS: Array<{
    value: StepActionType;
    label: string;
    requiresStaging?: boolean;
}>;
export declare function normalizeStepActionType(value: unknown): StepActionType;
export declare function stepActionTypeFromLegacy(step: {
    actionRequestPublishStaging?: boolean;
    actionRequestPublishLive?: boolean;
    actionPublishStaging?: boolean;
    actionPublishLive?: boolean;
}): StepActionType;
export declare function hasStepAction(actionType?: StepActionType | string | null): boolean;
export declare function hasPublishStepAction(actionType?: StepActionType | string | null): boolean;
export declare function isArchiveStepAction(actionType?: StepActionType | string | null): boolean;
export declare function getStepActionLabel(actionType?: StepActionType | string | null): string | null;
/** Human-readable labels for automatic actions configured on a step (one per step today). */
export declare function getStepActionDescriptions(actionType?: StepActionType | string | null): string[];
