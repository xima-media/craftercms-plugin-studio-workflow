package plugins.org.rd.plugin.crafterwf.service

import plugins.org.rd.plugin.crafterwf.dao.WorkflowPackageAttachmentDao
import plugins.org.rd.plugin.crafterwf.dao.WorkflowPackageDao
import plugins.org.rd.plugin.crafterwf.model.AuditOperation
import plugins.org.rd.plugin.crafterwf.model.AuditTargetType
import plugins.org.rd.plugin.crafterwf.model.CommentTargetType
import plugins.org.rd.plugin.crafterwf.service.AuditLogService
import plugins.org.rd.plugin.crafterwf.util.ContentTypeSupport
import plugins.org.rd.plugin.crafterwf.util.WorkflowBeanLookup
import plugins.org.rd.plugin.crafterwf.util.WorkflowDefinitionSupport

class WorkflowPackageService {

    private final WorkflowPackageDao packageDao
    private final WorkflowPackageAttachmentDao attachmentDao
    private final CommentService commentService
    private final WorkflowDefinitionService definitionService
    private final AuditLogService auditLogService
    private final StepRuleService stepRuleService
    private final ContentTypeSupport contentTypeSupport
    private final def applicationContext
    private WorkflowStepActionService stepActionService

    WorkflowPackageService(WorkflowPackageDao packageDao, WorkflowPackageAttachmentDao attachmentDao,
                           CommentService commentService, WorkflowDefinitionService definitionService,
                           AuditLogService auditLogService, StepRuleService stepRuleService = null,
                           def applicationContext = null) {
        this.packageDao = packageDao
        this.attachmentDao = attachmentDao
        this.commentService = commentService
        this.definitionService = definitionService
        this.auditLogService = auditLogService
        this.stepRuleService = stepRuleService
        this.applicationContext = applicationContext
        this.contentTypeSupport = applicationContext ? new ContentTypeSupport(applicationContext) : null
    }

    void setStepActionService(WorkflowStepActionService stepActionService) {
        this.stepActionService = stepActionService
    }

    Map getPackage(String siteId, String workflowPackageId, String previewServer) {
        def pkg = requirePackage(siteId, workflowPackageId)
        def contentRefs = attachmentDao.findContentRefs(siteId, workflowPackageId)
        def links = attachmentDao.findLinks(siteId, workflowPackageId)

        return [
            workflowPackage: [
                id              : pkg.id,
                workflowId      : pkg.workflow_id,
                workflowStepId  : pkg.workflow_step_id,
                title           : pkg.title,
                description     : pkg.description,
                coverColor      : pkg.cover_color,
                dueOn           : pkg.due_on,
                status          : pkg.status
            ],
            contentRefs    : contentRefs.collect { ref ->
                [
                    id          : ref.id,
                    contentPath : ref.content_path,
                    displayName : ref.display_name,
                    previewUrl  : buildContentPreviewUrl(previewServer, siteId, ref.content_path),
                    sortOrder   : ref.sort_order
                ]
            },
            links          : links.collect { link ->
                [
                    id        : link.id,
                    name      : link.name,
                    url       : link.url,
                    sortOrder : link.sort_order
                ]
            },
            comments       : listPackageComments(siteId, workflowPackageId, true)
        ]
    }

    /** UI-compatible attachment list (content + links). */
    Map getAttachmentsForUi(String siteId, String workflowPackageId, String previewServer) {
        def contentRefs = attachmentDao.findContentRefs(siteId, workflowPackageId)
        def links = attachmentDao.findLinks(siteId, workflowPackageId)
        def attachments = []

        contentRefs.each { ref ->
            attachments << [
                id   : ref.id,
                name : normalizeDisplayName(ref.display_name, ref.content_path),
                url  : buildContentPreviewUrl(previewServer, siteId, ref.content_path),
                _type: 'content'
            ]
        }
        links.each { link ->
            attachments << [
                id   : link.id,
                name : link.name,
                url  : link.url,
                _type: 'link'
            ]
        }

        return [attachments: attachments]
    }

    Map createPackage(String siteId, String workflowStepId, String title, String description,
                      String coverColor, Long userId, String username, boolean systemEnrollment = false) {
        def located = definitionService.findStepByIdInSite(siteId, workflowStepId)
        return createPackageInWorkflow(
            siteId, located.workflowId as String, workflowStepId, title, description,
            coverColor, userId, username, systemEnrollment
        )
    }

    Map createPackageInWorkflow(String siteId, String workflowId, String workflowStepId, String title,
                                String description, String coverColor, Long userId, String username,
                                boolean systemEnrollment = false) {
        def step = definitionService.findStep(siteId, workflowId, workflowStepId)
        if (!systemEnrollment && !WorkflowDefinitionSupport.allowsAddPackage(step)) {
            throw new IllegalArgumentException("Adding packages is not allowed in step \"${step.name}\"")
        }
        def position = new BigDecimal('1000')
        def pkg = packageDao.insert(siteId, workflowId, workflowStepId, title, description, coverColor, position, userId)
        auditLogService.record(
            siteId,
            userId,
            username,
            AuditOperation.PACKAGE_CREATED,
            AuditTargetType.PACKAGE,
            pkg.id as String,
            systemEnrollment
                ? "Auto-enrolled content into package \"${pkg.title}\" in step \"${step.name}\""
                : "Created package \"${pkg.title}\" in step \"${step.name}\""
        )
        def stepActionResult = runStepActionsIfNeeded(siteId, pkg.id as String, userId, username, !systemEnrollment, null)
        return toPackageDto(requirePackage(siteId, pkg.id as String), stepActionResult)
    }

    Map movePackage(String siteId, String workflowPackageId, String workflowStepId, int index, Long userId,
                    String username, boolean executeStepActions = true, boolean recordAudit = true,
                    boolean skipTransitionCheck = false) {
        def pkg = requirePackage(siteId, workflowPackageId)
        def previousStepId = pkg.workflow_step_id as String
        def workflowId = pkg.workflow_id as String
        def step = definitionService.findStep(siteId, workflowId, workflowStepId)
        if (previousStepId != workflowStepId && !skipTransitionCheck) {
            def definition = definitionService.loadDefinition(siteId, workflowId)
            def fromStep = WorkflowDefinitionSupport.stepLookup(definition)[previousStepId]
            def allowedTargets = fromStep?.transitionStepIds
            if (allowedTargets instanceof List && !allowedTargets.isEmpty() &&
                !allowedTargets.contains(workflowStepId)) {
                return toMoveBlockedDto(pkg, [
                    allowed: false,
                    message: 'Packages cannot be moved directly to that step'
                ])
            }
        }
        if (previousStepId != workflowStepId && stepRuleService && !skipTransitionCheck) {
            def ruleCheck = stepRuleService.validateMoveToStep(siteId, step, workflowPackageId, username)
            if (!ruleCheck.allowed) {
                return toMoveBlockedDto(pkg, ruleCheck)
            }
        }
        def position = new BigDecimal((index + 1) * 1000)
        packageDao.move(siteId, workflowPackageId, workflowStepId, position, userId)

        def stepActionResult = [stepActionFailed: false]
        if (previousStepId != workflowStepId) {
            stepActionResult = runStepActionsIfNeeded(
                siteId, workflowPackageId, userId, username, executeStepActions, previousStepId
            )
            if (!stepActionResult.stepActionFailed && recordAudit) {
                def fromName = definitionService.findStepName(siteId, workflowId, previousStepId)
                auditLogService.record(
                    siteId,
                    userId,
                    username,
                    AuditOperation.PACKAGE_STEP_CHANGED,
                    AuditTargetType.PACKAGE,
                    workflowPackageId,
                    "Moved package \"${pkg.title}\" from \"${fromName}\" to \"${step.name}\""
                )
            }
        }
        def updated = packageDao.findById(siteId, workflowPackageId)
        return toPackageDto(updated, stepActionResult)
    }

    private Map runStepActionsIfNeeded(String siteId, String workflowPackageId, Long userId, String username,
                                       boolean executeStepActions, String previousStepId) {
        if (executeStepActions && stepActionService) {
            return stepActionService.onPackageEnteredStep(
                siteId, workflowPackageId, userId, username, previousStepId
            ) ?: [stepActionFailed: false]
        }
        return [stepActionFailed: false]
    }

    void archivePackage(String siteId, String workflowPackageId, Long userId, String username = null) {
        def pkg = requirePackage(siteId, workflowPackageId)
        if ((pkg.status as String) == 'archived') {
            return
        }
        def title = pkg.title as String
        packageDao.archive(siteId, workflowPackageId, userId)
        auditLogService.record(
            siteId,
            userId,
            username ?: 'system',
            AuditOperation.PACKAGE_MODIFIED,
            AuditTargetType.PACKAGE,
            workflowPackageId,
            "Archived package \"${title}\""
        )
    }

    Map updatePackageTitle(String siteId, String workflowPackageId, String title, Long userId, String username) {
        def pkg = requirePackage(siteId, workflowPackageId)
        def trimmed = title?.trim()
        if (!trimmed) {
            throw new IllegalArgumentException('Package title is required')
        }
        if (trimmed.length() > 512) {
            throw new IllegalArgumentException('Package title must be 512 characters or fewer')
        }
        if (trimmed == pkg.title) {
            return [
                id             : pkg.id,
                workflowId     : pkg.workflow_id,
                workflowStepId : pkg.workflow_step_id,
                title          : pkg.title,
                description    : pkg.description,
                coverColor     : pkg.cover_color,
                dueOn          : pkg.due_on,
                status         : pkg.status
            ]
        }
        def previousTitle = pkg.title
        packageDao.updateTitle(siteId, workflowPackageId, trimmed, userId)
        auditLogService.record(
            siteId,
            userId,
            username,
            AuditOperation.PACKAGE_MODIFIED,
            AuditTargetType.PACKAGE,
            workflowPackageId,
            "Renamed package from \"${previousTitle}\" to \"${trimmed}\""
        )
        def updated = packageDao.findById(siteId, workflowPackageId)
        return [
            id             : updated.id,
            workflowId     : updated.workflow_id,
            workflowStepId : updated.workflow_step_id,
            title          : updated.title,
            description    : updated.description,
            coverColor     : updated.cover_color,
            dueOn          : updated.due_on,
            status         : updated.status
        ]
    }

    List<Map> listCalendarPackages(String siteId) {
        return packageDao.findScheduledForCalendar(siteId).collect { row ->
            def workflowId = row.workflow_id as String
            def definition = resolveDefinitionSummary(siteId, workflowId)
            [
                id                     : row.id,
                workflowId             : workflowId,
                title                  : row.title,
                dueOn                  : row.due_on,
                workflowName           : definition.name,
                workflowBackgroundUrl  : definition.backgroundUrl
            ]
        }
    }

    Map updatePackageDueOn(String siteId, String workflowPackageId, Date dueOn, Long userId, String username) {
        def pkg = requirePackage(siteId, workflowPackageId)
        packageDao.updateDueOn(siteId, workflowPackageId, dueOn, userId)
        auditLogService.record(
            siteId,
            userId,
            username,
            AuditOperation.PACKAGE_MODIFIED,
            AuditTargetType.PACKAGE,
            workflowPackageId,
            dueOn ? "Set package due date to ${dueOn}" : 'Cleared package due date'
        )
        def updated = packageDao.findById(siteId, workflowPackageId)
        return [
            id             : updated.id,
            workflowId     : updated.workflow_id,
            workflowStepId : updated.workflow_step_id,
            title          : updated.title,
            description    : updated.description,
            coverColor     : updated.cover_color,
            dueOn          : updated.due_on,
            status         : updated.status
        ]
    }

    Map updatePackageDescription(String siteId, String workflowPackageId, String description, Long userId, String username) {
        def pkg = requirePackage(siteId, workflowPackageId)
        def normalized = description?.trim() ?: ''
        if (normalized.length() > 10000) {
            throw new IllegalArgumentException('Package description must be 10,000 characters or fewer')
        }
        def previous = pkg.description?.trim() ?: ''
        if (normalized == previous) {
            return [
                id             : pkg.id,
                workflowId     : pkg.workflow_id,
                workflowStepId : pkg.workflow_step_id,
                title          : pkg.title,
                description    : pkg.description,
                coverColor     : pkg.cover_color,
                dueOn          : pkg.due_on,
                status         : pkg.status
            ]
        }
        packageDao.updateDescription(siteId, workflowPackageId, normalized, userId)
        auditLogService.record(
            siteId,
            userId,
            username,
            AuditOperation.PACKAGE_MODIFIED,
            AuditTargetType.PACKAGE,
            workflowPackageId,
            describePackageDescriptionChange(previous, normalized)
        )
        def updated = packageDao.findById(siteId, workflowPackageId)
        return [
            id             : updated.id,
            workflowId     : updated.workflow_id,
            workflowStepId : updated.workflow_step_id,
            title          : updated.title,
            description    : updated.description,
            coverColor     : updated.cover_color,
            dueOn          : updated.due_on,
            status         : updated.status
        ]
    }

    List<Map> findPackagesWithCommentsByContentPath(String siteId, String contentPath,
                                                    boolean includeResolved = true, boolean includeArchived = false) {
        if (!contentPath?.trim()) {
            return []
        }
        def packages = attachmentDao.findPackagesByContentPath(siteId, contentPath.trim())
        return packages.collect { pkg ->
            [
                workflowPackageId : pkg.workflow_package_id,
                workflowId        : pkg.workflow_id,
                workflowName      : pkg.workflow_name,
                title             : pkg.title,
                coverColor        : pkg.cover_color,
                workflowStepId    : pkg.workflow_step_id,
                workflowStepName  : pkg.workflow_step_name,
                dueOn             : pkg.due_on,
                comments          : listPackageComments(
                    siteId, pkg.workflow_package_id as String, includeResolved, includeArchived
                )
            ]
        }
    }

    Map enrollContentFromListener(String siteId, String workflowId, Map listener, String contentPath,
                                  String contentType, Long userId, String username) {
        def stepId = listener?.stepId?.toString()?.trim()
        def prefix = listener?.packageNamePrefix?.toString()?.trim()
        if (!stepId || !prefix) {
            throw new IllegalArgumentException('Listener action requires stepId and packageNamePrefix')
        }
        definitionService.findStep(siteId, workflowId, stepId)
        def displayName = resolveContentDisplayName(siteId, contentPath)
        def packageTitle = buildListenerPackageTitle(prefix, displayName, contentPath)
        def pkg = packageDao.findActiveByWorkflowAndContentPath(siteId, workflowId, contentPath)
        if (!pkg) {
            pkg = packageDao.findActiveByWorkflowAndTitle(siteId, workflowId, packageTitle)
        }
        def created = false
        if (!pkg) {
            def createdDto = createPackageInWorkflow(
                siteId, workflowId, stepId, packageTitle, '', null, userId, username, true
            )
            pkg = packageDao.findById(siteId, createdDto.id as String)
            created = true
        }
        def packageId = pkg.id as String
        def refs = attachmentDao.findContentRefs(siteId, packageId)
        def alreadyAttached = refs.any { (it.content_path as String) == contentPath }
        if (!alreadyAttached) {
            attachContent(siteId, packageId, contentPath, displayName, null, userId, username)
        }
        def currentStepId = pkg.workflow_step_id as String
        def moved = false
        if (currentStepId != stepId) {
            movePackage(siteId, packageId, stepId, 0, userId, username, true, !created)
            moved = true
        }
        def updated = packageDao.findById(siteId, packageId)
        return [
            workflowPackageId: packageId,
            title            : updated.title,
            workflowStepId   : updated.workflow_step_id,
            created          : created,
            attached         : !alreadyAttached,
            moved            : moved
        ]
    }

    Map attachContent(String siteId, String workflowPackageId, String contentPath, String displayName,
                      String previewServer, Long userId, String username) {
        requirePackage(siteId, workflowPackageId)
        def refs = attachmentDao.findContentRefs(siteId, workflowPackageId)
        if (refs.any { (it.content_path as String) == contentPath }) {
            def existing = refs.find { (it.content_path as String) == contentPath }
            return [
                id   : existing.id,
                name : normalizeDisplayName(existing.display_name as String, existing.content_path as String),
                url  : buildContentPreviewUrl(previewServer, siteId, existing.content_path as String),
                _type: 'content'
            ]
        }
        def safeName = normalizeDisplayName(displayName, contentPath)
        def contentType = contentTypeSupport?.resolveContentType(siteId, contentPath)
        def ref = attachmentDao.insertContentRef(siteId, workflowPackageId, contentPath, safeName, userId, contentType)
        def pkg = requirePackage(siteId, workflowPackageId)
        auditLogService.record(
            siteId,
            userId,
            username,
            AuditOperation.PACKAGE_MODIFIED,
            AuditTargetType.PACKAGE,
            workflowPackageId,
            "Added content \"${safeName}\" (${contentPath}) to package \"${pkg.title}\""
        )
        return [
            id   : ref.id,
            name : normalizeDisplayName(ref.display_name, ref.content_path),
            url  : buildContentPreviewUrl(previewServer, siteId, ref.content_path),
            _type: 'content'
        ]
    }

    void removeAttachment(String siteId, String workflowPackageId, String attachmentId, String attachmentType,
                          Long userId, String username) {
        def pkg = requirePackage(siteId, workflowPackageId)
        def attachmentLabel = resolveAttachmentLabel(siteId, workflowPackageId, attachmentId, attachmentType)
        if (attachmentType == 'link') {
            attachmentDao.deleteLink(siteId, attachmentId)
        } else {
            attachmentDao.deleteContentRef(siteId, attachmentId)
        }
        auditLogService.record(
            siteId,
            userId,
            username,
            AuditOperation.PACKAGE_MODIFIED,
            AuditTargetType.PACKAGE,
            workflowPackageId,
            "Removed ${attachmentType == 'link' ? 'link' : 'content'} \"${attachmentLabel}\" from package \"${pkg.title}\""
        )
    }

    List<Map> listPackageComments(String siteId, String workflowPackageId,
                                  boolean includeResolved = true, boolean includeArchived = false) {
        return commentService.listComments(
            siteId, CommentTargetType.WORKFLOW_PACKAGE, workflowPackageId, includeResolved, includeArchived
        )
    }

    Map createPackageComment(String siteId, String workflowPackageId, String body, Long userId, String authorUsername) {
        return commentService.createComment(
            siteId, CommentTargetType.WORKFLOW_PACKAGE, workflowPackageId, body, userId, authorUsername
        )
    }

    Map resolveDefinitionSummary(String siteId, String workflowId) {
        try {
            def definition = definitionService.loadDefinition(siteId, workflowId)
            return [
                name          : definition.name ?: workflowId,
                backgroundUrl : definition.backgroundUrl
            ]
        } catch (Exception ignored) {
            return [name: workflowId, backgroundUrl: null]
        }
    }

    private Map requirePackage(String siteId, String workflowPackageId) {
        def pkg = packageDao.findById(siteId, workflowPackageId)
        if (!pkg) {
            throw new IllegalArgumentException("WorkflowPackage not found: ${workflowPackageId}")
        }
        return pkg
    }

    static String buildContentPreviewUrl(String server, String siteId, String contentPath) {
        if (!contentPath) {
            return contentPath
        }
        if (contentPath.startsWith('/static-assets/')) {
            return contentPath
        }
        if (!server) {
            return contentPath
        }
        def base = server.endsWith('/') ? server[0..-2] : server
        def encodedPath = java.net.URLEncoder.encode(contentPath, 'UTF-8').replace('+', '%20')
        return "${base}/studio/plugin%3Fsite%3D${siteId}%26type%3Dapps%26pluginId%3Dorg.rd.plugin.crafterwf%26name%3Dcrafterwf%26file%3Dapp.js%23/preview%3FcontentId%3D${encodedPath}%26siteId%3D${siteId}"
    }

    private String resolveContentDisplayName(String siteId, String contentPath) {
        try {
            def contentService = WorkflowBeanLookup.resolve(applicationContext, 'contentService')
            if (contentService?.metaClass?.respondsTo(contentService, 'getContent', String, String)) {
                def item = contentService.getContent(siteId, contentPath)
                def name = item?.internalName ?: item?.internal_name ?: item?.'internal-name'
                if (name) {
                    return name.toString().trim()
                }
            }
        } catch (Exception ignored) {
        }
        return normalizeDisplayName(null, contentPath)
    }

    private static String buildListenerPackageTitle(String prefix, String displayName, String contentPath) {
        def safeName = normalizeDisplayName(displayName, contentPath)
        return "${prefix}${safeName}"
    }

    private static String normalizeDisplayName(String displayName, String contentPath) {
        def name = displayName?.trim()
        if (!name || name.equalsIgnoreCase('undefined') || name.equalsIgnoreCase('null')) {
            name = null
        }
        if (!name && contentPath) {
            def segments = contentPath.tokenize('/')
            if (segments && segments.last() in ['index.xml', 'index.html']) {
                segments = segments[0..-2]
            }
            name = segments ? segments.last() : contentPath
        }
        return name ?: 'Attachment'
    }

    private String resolveAttachmentLabel(String siteId, String workflowPackageId, String attachmentId, String attachmentType) {
        if (attachmentType == 'link') {
            def link = attachmentDao.findLinkById(siteId, attachmentId)
            return link?.name ?: link?.url ?: attachmentId
        }
        def ref = attachmentDao.findContentRefById(siteId, attachmentId)
        return normalizeDisplayName(ref?.display_name as String, ref?.content_path as String) ?: attachmentId
    }

    private static String describePackageDescriptionChange(String previous, String next) {
        if (!previous && next) {
            return 'Set package description'
        }
        if (previous && !next) {
            return 'Cleared package description'
        }
        return 'Updated package description'
    }

    private static Map toMoveBlockedDto(Map pkg, Map ruleCheck) {
        def message = ruleCheck.userMessage ?: ruleCheck.reason ?: StepRuleService.CONTENT_BLOCKED_MESSAGE
        return [
            id             : pkg.id,
            workflowId     : pkg.workflow_id,
            workflowStepId : pkg.workflow_step_id,
            title          : pkg.title,
            description    : pkg.description,
            coverColor     : pkg.cover_color,
            dueOn          : pkg.due_on,
            status         : pkg.status,
            moveBlocked    : true,
            moveBlockedReason: message,
            stepActionFailed: true,
            stepActionStatus: 'failed',
            stepActionMessage: message,
            userMessage    : message,
            reverted       : true
        ]
    }

    private static Map toPackageDto(Map pkg, Map stepActionResult = [:]) {
        def dto = [
            id             : pkg.id,
            workflowId     : pkg.workflow_id,
            workflowStepId : stepActionResult.workflowStepId ?: pkg.workflow_step_id,
            title          : pkg.title,
            description    : pkg.description,
            coverColor     : pkg.cover_color,
            dueOn          : pkg.due_on,
            status         : pkg.status
        ]
        if (stepActionResult.stepActionFailed) {
            def failureMessage = stepActionResult.message as String
            dto.stepActionFailed = true
            dto.stepActionStatus = 'failed'
            dto.stepActionMessage = failureMessage
            dto.userMessage = failureMessage
            dto.reverted = stepActionResult.reverted == true
        }
        return dto
    }

    private static Map toCreatedDto(Map pkg) {
        return toPackageDto(pkg, [:])
    }
}
