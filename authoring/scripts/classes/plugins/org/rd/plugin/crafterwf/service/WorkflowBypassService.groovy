package plugins.org.rd.plugin.crafterwf.service

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import plugins.org.rd.plugin.crafterwf.dao.CommentDao
import plugins.org.rd.plugin.crafterwf.dao.TaskDao
import plugins.org.rd.plugin.crafterwf.dao.WorkflowPackageAttachmentDao
import plugins.org.rd.plugin.crafterwf.dao.WorkflowPackageDao
import plugins.org.rd.plugin.crafterwf.model.AuditOperation
import plugins.org.rd.plugin.crafterwf.model.AuditTargetType
import plugins.org.rd.plugin.crafterwf.model.CommentTargetType
import plugins.org.rd.plugin.crafterwf.util.MentionParser
import plugins.org.rd.plugin.crafterwf.util.WorkflowBeanLookup
import plugins.org.rd.plugin.crafterwf.util.WorkflowDefinitionSupport

class WorkflowBypassService {

    private static final Logger logger = LoggerFactory.getLogger(WorkflowBypassService)

    private static final String DEFAULT_BYPASS_ALLOWED_MESSAGE =
        'This content is in a workflow package that is not on the correct publish or review step. ' +
        'Move the package to the appropriate step when possible. You may continue after acknowledging this warning.'

    private static final String DEFAULT_BLOCK_MESSAGE =
        'This content is in a workflow package that is not on the correct publish or review step. ' +
        'Move the package to the appropriate step before using Studio publish or reject actions.'

    private static final Set<String> ALLOWED_ACTIONS = ['publish', 'request_publish', 'reject'] as Set

    private final WorkflowDefinitionService definitionService
    private final WorkflowPackageDao packageDao
    private final WorkflowPackageAttachmentDao attachmentDao
    private final TaskDao taskDao
    private final CommentDao commentDao
    private final AuditLogService auditLogService
    private final NotificationService notificationService
    private final def applicationContext

    WorkflowBypassService(WorkflowDefinitionService definitionService,
                          WorkflowPackageDao packageDao,
                          WorkflowPackageAttachmentDao attachmentDao,
                          TaskDao taskDao,
                          CommentDao commentDao,
                          AuditLogService auditLogService,
                          NotificationService notificationService,
                          def applicationContext) {
        this.definitionService = definitionService
        this.packageDao = packageDao
        this.attachmentDao = attachmentDao
        this.taskDao = taskDao
        this.commentDao = commentDao
        this.auditLogService = auditLogService
        this.notificationService = notificationService
        this.applicationContext = applicationContext
    }

    Map check(String siteId, List<String> contentPaths, String studioAction) {
        def action = normalizeStudioAction(studioAction)
        def violations = collectViolations(siteId, contentPaths, action)
        def allowUiBypass = violations && violations.every { it.allowUiBypass == true }
        return [
            action               : action,
            requiresAcknowledgement: !violations.isEmpty(),
            allowUiBypass        : allowUiBypass,
            violations           : violations
        ]
    }

    List<Map> recordAcknowledgements(String siteId, List<Map> violations, String studioAction,
                                     Long userId, String username) {
        def action = normalizeStudioAction(studioAction)
        def entries = []
        violations?.each { violation ->
            def safe = normalizeViolation(violation)
            if (!safe) {
                return
            }
            entries << auditLogService.record(
                siteId,
                userId,
                username,
                AuditOperation.WORKFLOW_BYPASS_ACKNOWLEDGED,
                AuditTargetType.PACKAGE,
                safe.packageId,
                buildAckNote(safe, action, username)
            )
        }
        return entries
    }

    List<Map> recordBypassActions(String siteId, List<Map> violations, String studioAction,
                                  Long userId, String username) {
        def action = normalizeStudioAction(studioAction)
        def entries = []
        violations?.each { violation ->
            def safe = normalizeViolation(violation)
            if (!safe) {
                return
            }
            entries << auditLogService.record(
                siteId,
                userId,
                username,
                AuditOperation.WORKFLOW_BYPASS_ACTION,
                AuditTargetType.PACKAGE,
                safe.packageId,
                buildActionNote(safe, action, username)
            )
            notifyStakeholders(siteId, safe, action, userId, username)
        }
        return entries
    }

    private List<Map> collectViolations(String siteId, List<String> contentPaths, String studioAction) {
        def violations = []
        def seenPackages = [] as Set
        (contentPaths ?: []).each { rawPath ->
            def path = rawPath?.toString()?.trim()
            if (!path) {
                return
            }
            attachmentDao.findPackagesByContentPath(siteId, path).each { row ->
                def packageId = row.workflow_package_id as String
                if (!packageId || seenPackages.contains(packageId)) {
                    return
                }
                def violation = evaluatePackage(siteId, packageId, row, path, studioAction)
                if (violation) {
                    violations << violation
                    seenPackages << packageId
                }
            }
        }
        return violations
    }

    private Map evaluatePackage(String siteId, String packageId, Map row, String contentPath, String studioAction) {
        def workflowId = row.workflow_id as String
        def definition = definitionService.tryLoadDefinition(siteId, workflowId)
        if (!definition) {
            return null
        }
        def actionStepIds = WorkflowDefinitionSupport.publishActionStepIds(definition)
        if (!actionStepIds) {
            return null
        }
        def currentStepId = row.workflow_step_id as String
        if (actionStepIds.contains(currentStepId)) {
            return null
        }
        def workflowName = definition.name?.toString()?.trim() ?: workflowId
        def packageTitle = row.title?.toString()?.trim() ?: packageId
        def currentStepName = WorkflowDefinitionSupport.stepName(definition, currentStepId)
        def allowUiBypass = WorkflowDefinitionSupport.allowsUiBypass(definition)
        def customMessage = definition.bypassWarningMessage?.toString()?.trim()
        def defaultMessage = allowUiBypass ? DEFAULT_BYPASS_ALLOWED_MESSAGE : DEFAULT_BLOCK_MESSAGE
        return [
            contentPath     : contentPath,
            packageId       : packageId,
            packageTitle    : packageTitle,
            workflowId      : workflowId,
            workflowName    : workflowName,
            currentStepId   : currentStepId,
            currentStepName : currentStepName,
            actionStepIds   : actionStepIds,
            studioAction    : studioAction,
            allowUiBypass   : allowUiBypass,
            warningMessage  : customMessage ?: defaultMessage
        ]
    }

    private void notifyStakeholders(String siteId, Map violation, String studioAction,
                                    Long actorUserId, String actorUsername) {
        def recipients = resolveRecipientUserIds(siteId, violation.packageId as String, actorUserId, actorUsername)
        if (!recipients) {
            return
        }
        def actionLabel = studioActionLabel(studioAction)
        def title = "Workflow bypass: ${actionLabel}"
        def message = "${actorUsername ?: 'A user'} ${actionLabel.toLowerCase()} content outside the workflow step for " +
            "package \"${violation.packageTitle}\" (${violation.workflowName} — ${violation.currentStepName})."
        recipients.each { recipientId ->
            try {
                notificationService.createNotification(
                    siteId,
                    recipientId,
                    title,
                    message,
                    CommentTargetType.WORKFLOW_PACKAGE,
                    violation.packageId as String
                )
            } catch (Exception e) {
                logger.debug('Could not notify user {} of workflow bypass: {}', recipientId, e.message)
            }
        }
    }

    private Set<Long> resolveRecipientUserIds(String siteId, String packageId, Long actorUserId, String actorUsername) {
        def recipients = [] as LinkedHashSet<Long>
        def pkg = packageDao.findById(siteId, packageId)
        if (!pkg) {
            return recipients
        }
        addUserId(recipients, pkg.created_by)
        addUserId(recipients, pkg.modified_by)
        taskDao.findByTarget(siteId, CommentTargetType.WORKFLOW_PACKAGE, packageId, true, true).each { task ->
            addUserId(recipients, task.assignee_id)
        }
        commentDao.findByTarget(siteId, CommentTargetType.WORKFLOW_PACKAGE, packageId, true, false).each { comment ->
            addUserId(recipients, comment.author_id)
            MentionParser.extractUsernames(comment.body as String).each { mentioned ->
                def mentionedId = WorkflowContext.resolveUserIdByUsername(applicationContext, mentioned)
                addUserId(recipients, mentionedId)
            }
        }
        listSiteAdminUserIds(siteId, actorUsername).each { addUserId(recipients, it) }
        if (actorUserId != null) {
            recipients.remove(actorUserId)
        }
        return recipients
    }

    private List<Long> listSiteAdminUserIds(String siteId, String actorUsername) {
        def adminIds = [] as LinkedHashSet<Long>
        def securityService = WorkflowBeanLookup.resolve(applicationContext, 'securityService')
        def userService = WorkflowBeanLookup.resolve(applicationContext, 'userService')
        if (!securityService || !userService) {
            return adminIds.toList()
        }
        try {
            def users = userService.getAllUsersForSite(siteId, '', 0, 500, 'username')
            users?.each { user ->
                def username = user?.username?.toString()?.trim()
                if (!username) {
                    return
                }
                try {
                    if (securityService.isSystemAdmin(username) || securityService.isSiteAdmin(username, siteId)) {
                        addUserId(adminIds, user.id)
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
            logger.debug('Could not list site admins for bypass notification: {}', e.message)
        }
        return adminIds.toList()
    }

    private static void addUserId(Set<Long> recipients, def userId) {
        if (userId == null) {
            return
        }
        try {
            def id = userId instanceof Number ? (userId as Long) : Long.parseLong(userId.toString())
            if (id > 0) {
                recipients << id
            }
        } catch (Exception ignored) {
        }
    }

    private static Map normalizeViolation(Map violation) {
        if (!(violation instanceof Map)) {
            return null
        }
        def packageId = violation.packageId?.toString()?.trim()
        if (!packageId) {
            return null
        }
        return violation
    }

    private static String normalizeStudioAction(String studioAction) {
        def action = studioAction?.toString()?.trim()?.toLowerCase()
        if (!action || !ALLOWED_ACTIONS.contains(action)) {
            throw new IllegalArgumentException("action must be one of: ${ALLOWED_ACTIONS.join(', ')}")
        }
        return action
    }

    private static String studioActionLabel(String action) {
        switch (action) {
            case 'request_publish': return 'Requested publish'
            case 'reject': return 'Rejected content'
            default: return 'Published content'
        }
    }

    private static String buildAckNote(Map violation, String action, String username) {
        return "${username ?: 'User'} acknowledged bypass warning before ${studioActionLabel(action).toLowerCase()} " +
            "for content ${violation.contentPath} in workflow \"${violation.workflowName}\", " +
            "package \"${violation.packageTitle}\", step \"${violation.currentStepName}\"."
    }

    private static String buildActionNote(Map violation, String action, String username) {
        return "${username ?: 'User'} ${studioActionLabel(action).toLowerCase()} outside workflow step for " +
            "content ${violation.contentPath} in workflow \"${violation.workflowName}\", " +
            "package \"${violation.packageTitle}\", step \"${violation.currentStepName}\"."
    }
}
