export type StepActionType =
  | 'none'
  | 'request_publish_staging'
  | 'request_publish_live'
  | 'publish_staging'
  | 'publish_live'
  | 'archive_package';

export const STEP_ACTION_NONE: StepActionType = 'none';

export const STEP_ACTION_ARCHIVE_PACKAGE: StepActionType = 'archive_package';

/** Sentinel for "no success step" in the workflow editor Select (MUI needs a non-empty value). */
export const SUCCESS_STEP_NONE = '__none__';

export const PUBLISH_ACTION_OPTIONS: Array<{ value: StepActionType; label: string; requiresStaging?: boolean }> = [
  { value: 'request_publish_staging', label: 'Request publish to staging', requiresStaging: true },
  { value: 'request_publish_live', label: 'Request publish to live' },
  { value: 'publish_staging', label: 'Publish to staging', requiresStaging: true },
  { value: 'publish_live', label: 'Publish to live' }
];

export const ARCHIVE_ACTION_OPTIONS: Array<{ value: StepActionType; label: string }> = [
  { value: 'archive_package', label: 'Archive package' }
];

export const STEP_ACTION_OPTIONS: Array<{ value: StepActionType; label: string; requiresStaging?: boolean }> = [
  { value: 'none', label: 'None' },
  ...PUBLISH_ACTION_OPTIONS,
  ...ARCHIVE_ACTION_OPTIONS
];

const AUTOMATED_ACTION_VALUES = new Set<StepActionType>(
  [...PUBLISH_ACTION_OPTIONS, ...ARCHIVE_ACTION_OPTIONS].map((option) => option.value)
);

export function normalizeStepActionType(value: unknown): StepActionType {
  const type = typeof value === 'string' ? value.trim() : '';
  if (AUTOMATED_ACTION_VALUES.has(type as StepActionType)) {
    return type as StepActionType;
  }
  return 'none';
}

export function stepActionTypeFromLegacy(step: {
  actionRequestPublishStaging?: boolean;
  actionRequestPublishLive?: boolean;
  actionPublishStaging?: boolean;
  actionPublishLive?: boolean;
}): StepActionType {
  if (step.actionRequestPublishStaging) {
    return 'request_publish_staging';
  }
  if (step.actionRequestPublishLive) {
    return 'request_publish_live';
  }
  if (step.actionPublishStaging) {
    return 'publish_staging';
  }
  if (step.actionPublishLive) {
    return 'publish_live';
  }
  return 'none';
}

export function hasStepAction(actionType?: StepActionType | string | null): boolean {
  return normalizeStepActionType(actionType) !== 'none';
}

export function hasPublishStepAction(actionType?: StepActionType | string | null): boolean {
  const normalized = normalizeStepActionType(actionType);
  return normalized !== 'none' && normalized !== STEP_ACTION_ARCHIVE_PACKAGE;
}

export function isArchiveStepAction(actionType?: StepActionType | string | null): boolean {
  return normalizeStepActionType(actionType) === STEP_ACTION_ARCHIVE_PACKAGE;
}

export function getStepActionLabel(actionType?: StepActionType | string | null): string | null {
  const normalized = normalizeStepActionType(actionType);
  if (normalized === 'none') {
    return null;
  }
  return (
    STEP_ACTION_OPTIONS.find((option) => option.value === normalized)?.label ??
    normalized
  );
}

/** Human-readable labels for automatic actions configured on a step (one per step today). */
export function getStepActionDescriptions(actionType?: StepActionType | string | null): string[] {
  const label = getStepActionLabel(actionType);
  return label ? [label] : [];
}
