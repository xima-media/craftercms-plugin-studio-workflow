import {
  getStepActionLabel,
  hasPublishStepAction,
  hasStepAction,
  isArchiveStepAction,
  normalizeStepActionType,
  STEP_ACTION_ARCHIVE_PACKAGE,
  STEP_ACTION_NONE
} from './stepActions';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(normalizeStepActionType('archive_package') === STEP_ACTION_ARCHIVE_PACKAGE, 'archive action type');
assert(hasStepAction('archive_package'), 'archive is a step action');
assert(!hasPublishStepAction('archive_package'), 'archive is not a publish action');
assert(isArchiveStepAction('archive_package'), 'archive step action check');
assert(getStepActionLabel('archive_package') === 'Archive package', 'archive label');
assert(hasPublishStepAction('publish_live'), 'publish_live is publish action');
assert(hasStepAction('publish_live'), 'publish_live is step action');
assert(normalizeStepActionType('invalid') === STEP_ACTION_NONE, 'unknown action -> none');

console.log('stepActions tests passed');
