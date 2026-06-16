package plugins.org.rd.plugin.crafterwf.model

class StepActionType {

    static final String NONE = 'none'
    static final String REQUEST_PUBLISH_STAGING = 'request_publish_staging'
    static final String REQUEST_PUBLISH_LIVE = 'request_publish_live'
    static final String PUBLISH_STAGING = 'publish_staging'
    static final String PUBLISH_LIVE = 'publish_live'
    static final String ARCHIVE_PACKAGE = 'archive_package'

    private static final Set<String> ALL = [
        NONE,
        REQUEST_PUBLISH_STAGING,
        REQUEST_PUBLISH_LIVE,
        PUBLISH_STAGING,
        PUBLISH_LIVE,
        ARCHIVE_PACKAGE
    ] as Set

    static String normalize(def value) {
        def type = value?.toString()?.trim()
        if (!type || type == 'null') {
            return null
        }
        return ALL.contains(type) && type != NONE ? type : null
    }

    static String fromLegacyFlags(Map step) {
        if (asBool(step?.action_request_publish_staging)) {
            return REQUEST_PUBLISH_STAGING
        }
        if (asBool(step?.action_request_publish_live)) {
            return REQUEST_PUBLISH_LIVE
        }
        if (asBool(step?.action_publish_staging)) {
            return PUBLISH_STAGING
        }
        if (asBool(step?.action_publish_live)) {
            return PUBLISH_LIVE
        }
        return null
    }

    static Map toLegacyFlags(String actionType) {
        return [
            action_request_publish_staging: actionType == REQUEST_PUBLISH_STAGING ? 1 : 0,
            action_request_publish_live  : actionType == REQUEST_PUBLISH_LIVE ? 1 : 0,
            action_publish_staging       : actionType == PUBLISH_STAGING ? 1 : 0,
            action_publish_live          : actionType == PUBLISH_LIVE ? 1 : 0
        ]
    }

    static boolean isActionStep(String actionType) {
        return normalize(actionType) != null
    }

    static boolean isPublishAction(String actionType) {
        def type = normalize(actionType)
        return type != null && type != ARCHIVE_PACKAGE
    }

    static boolean isArchiveAction(String actionType) {
        return normalize(actionType) == ARCHIVE_PACKAGE
    }

    static boolean requiresStaging(String actionType) {
        return actionType == REQUEST_PUBLISH_STAGING || actionType == PUBLISH_STAGING
    }

    static String displayLabel(String actionType) {
        switch (actionType) {
            case REQUEST_PUBLISH_STAGING: return 'Request publish to staging'
            case REQUEST_PUBLISH_LIVE: return 'Request publish to live'
            case PUBLISH_STAGING: return 'Publish to staging'
            case PUBLISH_LIVE: return 'Publish to live'
            case ARCHIVE_PACKAGE: return 'Archive package'
            default: return actionType ?: 'Step action'
        }
    }

    private static boolean asBool(def value) {
        return value == true || value == 1 || value == '1' || value == 'true'
    }
}
