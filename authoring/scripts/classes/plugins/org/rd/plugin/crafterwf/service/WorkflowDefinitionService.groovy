package plugins.org.rd.plugin.crafterwf.service

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import plugins.org.rd.plugin.crafterwf.model.StepActionType
import plugins.org.rd.plugin.crafterwf.util.EventListenerJson
import plugins.org.rd.plugin.crafterwf.util.WorkflowBeanLookup
import plugins.org.rd.plugin.crafterwf.util.WorkflowDefinitionSupport

class WorkflowDefinitionService {

    private static final Logger logger = LoggerFactory.getLogger(WorkflowDefinitionService)
    static final String DEFINITIONS_ROOT = '/config/studio/workflow/definitions'
    static final String FILE_SUFFIX = '.workflow.json'

    private final def applicationContext
    private final JsonSlurper jsonSlurper = new JsonSlurper()

    WorkflowDefinitionService(def applicationContext) {
        this.applicationContext = applicationContext
    }

    List<Map> listDefinitionSummaries(String siteId, Closure<Integer> packageCountFn) {
        def summaries = []
        for (String workflowId in listWorkflowIds(siteId)) {
            def definition = tryLoadDefinition(siteId, workflowId)
            if (!definition) {
                logger.warn('Skipping unreadable workflow definition file for id: {}', workflowId)
                continue
            }
            def steps = WorkflowDefinitionSupport.sortedSteps(definition)
            summaries << [
                id            : definition.id,
                name          : definition.name,
                description   : definition.description ?: '',
                backgroundUrl : definition.backgroundUrl,
                position      : definition.position != null ? definition.position : 0,
                isDefault     : definition.isDefault == true,
                stepCount     : steps.size(),
                packageCount  : packageCountFn ? packageCountFn(definition.id as String) : 0
            ]
        }
        return summaries.sort { a, b -> (a.position ?: 0) <=> (b.position ?: 0) }
    }

    Map getWorkflowDetail(String siteId, String workflowId) {
        def definition = loadDefinition(siteId, workflowId)
        return [
            workflow        : WorkflowDefinitionSupport.toWorkflowDto(definition),
            steps           : WorkflowDefinitionSupport.sortedSteps(definition).collect {
                WorkflowDefinitionSupport.toStepDto(it)
            },
            createListeners : EventListenerJson.toListenerDtos(definition.createListeners),
            editListeners   : EventListenerJson.toListenerDtos(definition.editListeners)
        ]
    }

    Map resolveWorkflow(String siteId, String workflowId) {
        if (workflowId) {
            return loadDefinition(siteId, workflowId)
        }
        return findDefaultDefinition(siteId)
    }

    Map findDefaultDefinition(String siteId) {
        def all = []
        for (String workflowId in listWorkflowIds(siteId)) {
            def definition = tryLoadDefinition(siteId, workflowId)
            if (definition) {
                all << definition
            }
        }
        def explicit = all.find { it.isDefault == true }
        if (explicit) {
            return explicit
        }
        if (!all) {
            return null
        }
        return all.sort { a, b -> (a.position ?: 0) <=> (b.position ?: 0) }[0]
    }

    Map findStep(String siteId, String workflowId, String stepId) {
        def definition = loadDefinition(siteId, workflowId)
        def step = WorkflowDefinitionSupport.stepLookup(definition)[stepId]
        if (!step) {
            throw new IllegalArgumentException("WorkflowStep not found: ${stepId}")
        }
        return step
    }

    Map findStepByIdInSite(String siteId, String stepId) {
        for (String workflowId in listWorkflowIds(siteId)) {
            def definition = loadDefinition(siteId, workflowId)
            def step = WorkflowDefinitionSupport.stepLookup(definition)[stepId]
            if (step) {
                return [
                    workflowId: workflowId,
                    step      : step
                ]
            }
        }
        throw new IllegalArgumentException("WorkflowStep not found: ${stepId}")
    }

    Map findStepForPackage(String siteId, String workflowId, String stepId) {
        return findStep(siteId, workflowId, stepId)
    }

    String findStepName(String siteId, String workflowId, String stepId) {
        try {
            return findStep(siteId, workflowId, stepId)?.name ?: stepId
        } catch (Exception ignored) {
            return stepId
        }
    }

    Map createWorkflow(String siteId, String name, String description, boolean withDefaultSteps) {
        def workflowId = generateUniqueWorkflowId(siteId, name)
        def steps = withDefaultSteps ? defaultSteps() : []
        def definition = [
            id          : workflowId,
            name        : name?.trim() ?: 'Workflow',
            description : description ?: '',
            backgroundUrl: null,
            position    : nextWorkflowPosition(siteId),
            isDefault   : listWorkflowIds(siteId).isEmpty(),
            steps       : steps
        ]
        writeDefinition(siteId, workflowId, definition, 'Create workflow definition')
        return definition
    }

    Map saveWorkflowDefinition(String siteId, String workflowId, Map workflowFields, List stepsInput, Long userId,
                               Closure reassignPackagesFn, List createListenersInput = null,
                               List editListenersInput = null) {
        def existing = loadDefinition(siteId, workflowId)
        def existingLookup = WorkflowDefinitionSupport.stepLookup(existing)
        def existingIds = existingLookup.keySet() as Set
        def keptIds = [] as Set
        def firstKeptStepId = null
        def savedStepIds = []
        def clientKeyToStepId = [:]
        def normalizedSteps = []

        stepsInput.eachWithIndex { rawStep, idx ->
            def step = rawStep instanceof Map ? new LinkedHashMap(rawStep) : [:]
            def stepName = step.name?.toString()?.trim()
            if (!stepName) {
                throw new IllegalArgumentException('Each workflow step requires a name')
            }
            def stepId = step.id?.toString()?.trim()
            if (!stepId || !existingIds.contains(stepId)) {
                stepId = stepId ?: WorkflowDefinitionSupport.slugify(stepName)
                if (!stepId) {
                    stepId = "step-${idx + 1}"
                }
                stepId = ensureUniqueStepId(stepId, keptIds)
            }
            step.id = stepId
            step.name = stepName
            step.color = step.color?.toString() ?: 'blue'
            step.isTerminal = step.isTerminal == true || step.isTerminal == 'true' || step.isTerminal == 1
            step.allowAddPackage = WorkflowDefinitionSupport.allowsAddPackage(step)
            step.position = (idx + 1) * 1000
            step.actionType = StepActionType.normalize(step.actionType) ?: StepActionType.NONE
            if (step.actionType == StepActionType.NONE || step.actionType == StepActionType.ARCHIVE_PACKAGE) {
                step.actionSuccessStepId = null
                step.actionSuccessStepClientKey = null
                step.remove('actionSuccessStepIndex')
            }

            keptIds << stepId
            savedStepIds << stepId
            if (step.clientKey) {
                clientKeyToStepId[step.clientKey as String] = stepId
            }
            if (!firstKeptStepId) {
                firstKeptStepId = stepId
            }
            normalizedSteps << step
        }

        normalizedSteps.eachWithIndex { step, idx ->
            def stepActions = extractStepActions(step, true)
            step.actionSuccessStepId = resolveSuccessStepId(step, stepActions, keptIds, clientKeyToStepId, savedStepIds)
            step.transitionStepIds = resolveTransitionStepIds(step, keptIds, clientKeyToStepId)
            step.remove('transitionStepClientKeys')
        }

        def flowLayout = resolveFlowLayout(workflowFields?.flowLayout, existing.flowLayout, clientKeyToStepId, savedStepIds)
        def flowEdgeLayout = resolveFlowEdgeLayout(workflowFields?.flowEdgeLayout, existing.flowEdgeLayout, clientKeyToStepId, savedStepIds)
        def flowViewport = resolveFlowViewport(workflowFields?.flowViewport, existing.flowViewport)

        def removedIds = existingIds - keptIds
        removedIds.each { removedId ->
            if (firstKeptStepId && reassignPackagesFn) {
                reassignPackagesFn(removedId, firstKeptStepId, userId)
            }
        }

        def createListeners = createListenersInput != null
            ? EventListenerJson.normalizeListeners(createListenersInput, normalizedSteps, 'createListeners')
            : EventListenerJson.toListenerDtos(existing.createListeners)
        def editListeners = editListenersInput != null
            ? EventListenerJson.normalizeListeners(editListenersInput, normalizedSteps, 'editListeners')
            : EventListenerJson.toListenerDtos(existing.editListeners)

        def definition = [
            id              : workflowId,
            name            : workflowFields?.name?.toString()?.trim() ?: existing.name,
            description     : workflowFields?.description?.toString() ?: existing.description ?: '',
            backgroundUrl   : (workflowFields?.backgroundUrl ?: workflowFields?.backgroundColor)?.toString() ?:
                existing.backgroundUrl,
            position        : existing.position != null ? existing.position : 0,
            isDefault       : workflowFields?.isDefault != null ? workflowFields.isDefault == true : existing.isDefault == true,
            steps           : normalizedSteps,
            createListeners : createListeners,
            editListeners   : editListeners,
            bypassWarningMessage: workflowFields?.bypassWarningMessage?.toString() ?:
                existing.bypassWarningMessage?.toString() ?: '',
            allowUiBypass       : workflowFields?.allowUiBypass != null
                ? WorkflowDefinitionSupport.allowsUiBypass([allowUiBypass: workflowFields.allowUiBypass])
                : WorkflowDefinitionSupport.allowsUiBypass(existing),
            flowLayout          : flowLayout,
            flowEdgeLayout      : flowEdgeLayout,
            flowViewport        : flowViewport
        ]
        writeDefinition(siteId, workflowId, definition, 'Update workflow definition')
        return definition
    }

    void deleteWorkflow(String siteId, String workflowId) {
        def path = definitionPath(workflowId)
        def contentService = requireContentService()
        if (contentService.contentExists(siteId, path)) {
            contentService.deleteContent(siteId, path, 'Delete workflow definition')
        }
    }

    List<String> listWorkflowIds(String siteId) {
        def contentService = requireContentService()
        ensureDefinitionsFolder(siteId)
        if (!contentService.contentExists(siteId, DEFINITIONS_ROOT)) {
            return []
        }
        def children = contentService.getChildItems(siteId, [DEFINITIONS_ROOT])
        def ids = []
        def childList = children ?: []
        for (def item in childList) {
            def path = resolveChildItemPath(item)
            if (path && path.endsWith(FILE_SUFFIX)) {
                ids << workflowIdFromPath(path)
            }
        }
        return ids.unique().sort()
    }

    Map loadDefinition(String siteId, String workflowId) {
        def definition = tryLoadDefinition(siteId, workflowId)
        if (!definition) {
            throw new IllegalArgumentException("Workflow definition not found: ${workflowId}")
        }
        return definition
    }

    Map tryLoadDefinition(String siteId, String workflowId) {
        def path = definitionPath(workflowId)
        def text = readDefinitionText(siteId, path)
        if (!text?.trim()) {
            return null
        }
        try {
            def definition = jsonSlurper.parseText(text) as Map
            def fileId = workflowIdFromPath(path)
            if (!definition.id) {
                definition.id = fileId
            }
            if (definition.id != fileId) {
                logger.warn(
                    "Workflow id '{}' does not match file '{}'; using file id",
                    definition.id, fileId
                )
                definition.id = fileId
            }
            return definition
        } catch (Exception e) {
            logger.warn('Invalid workflow definition JSON at {}: {}', path, e.message ?: e.class.simpleName)
            return null
        }
    }

    void writeDefinition(String siteId, String workflowId, Map definition, String comment) {
        def path = definitionPath(workflowId)
        definition.id = workflowId
        ensureDefinitionsFolder(siteId)
        def json = JsonOutput.prettyPrint(JsonOutput.toJson(definition))
        def legacy = requireLegacyContentService()
        legacy.writeContent(siteId, path, new ByteArrayInputStream(json.getBytes('UTF-8')))
    }

    void ensureDefinitionsFolder(String siteId) {
        def contentService = requireContentService()
        if (contentService.contentExists(siteId, DEFINITIONS_ROOT)) {
            return
        }
        def legacy = requireLegacyContentService()
        def parts = DEFINITIONS_ROOT.tokenize('/').findAll { it }
        def built = ''
        for (String name in parts) {
            def parent = built ?: '/'
            built = built ? "${built}/${name}" : "/${name}"
            if (!contentService.contentExists(siteId, built)) {
                legacy.createFolder(siteId, parent, name)
            }
        }
    }

    String readDefinitionText(String siteId, String path) {
        def contentService = requireContentService()
        if (!contentService.contentExists(siteId, path)) {
            return null
        }
        def text = readTextFromContentService(contentService, siteId, path)
        if (text?.trim()) {
            return text
        }
        text = readTextFromLegacyContentService(siteId, path)
        if (text?.trim()) {
            return text
        }
        return null
    }

    String readTextFromContentService(def contentService, String siteId, String path) {
        try {
            def resource = contentService.getContentAsResource(siteId, path)
            return readUtf8FromResource(resource, path, 'getContentAsResource')
        } catch (Exception e) {
            logger.warn(
                'Failed to read workflow definition at {} (getContentAsResource): {}',
                path, e.message ?: e.class.simpleName
            )
            return null
        }
    }

    String readTextFromLegacyContentService(String siteId, String path) {
        try {
            def legacy = WorkflowBeanLookup.resolve(applicationContext, 'cstudioContentService')
            if (legacy) {
                def text = legacy.getContentAsString(siteId, path)
                if (text?.trim()) {
                    return text
                }
            }
        } catch (Exception e) {
            logger.warn(
                'Failed to read workflow definition at {} (cstudioContentService): {}',
                path, e.message ?: e.class.simpleName
            )
        }
        return null
    }

    static String readUtf8FromResource(def resource, String path, String source) {
        if (!resource) {
            return null
        }
        def stream = resource.inputStream
        return readUtf8FromStream(stream, path, source)
    }

    static String readUtf8FromStream(def stream, String path, String source) {
        if (!stream) {
            return null
        }
        try {
            return stream.getText('UTF-8')
        } catch (Exception e) {
            LoggerFactory.getLogger(WorkflowDefinitionService).warn(
                'Failed to read workflow definition stream at {} ({}): {}',
                path, source, e.message ?: e.class.simpleName
            )
            return null
        } finally {
            try {
                stream.close()
            } catch (Exception ignored) {
            }
        }
    }

    def requireContentService() {
        def service = WorkflowBeanLookup.resolve(applicationContext, 'contentService')
        if (!service) {
            throw new IllegalStateException('contentService bean is not available')
        }
        return service
    }

    def requireLegacyContentService() {
        def service = WorkflowBeanLookup.resolve(applicationContext, 'cstudioContentService')
        if (!service) {
            throw new IllegalStateException('cstudioContentService bean is not available')
        }
        return service
    }

    static String definitionPath(String workflowId) {
        return "${DEFINITIONS_ROOT}/${workflowId}${FILE_SUFFIX}"
    }

    static String workflowIdFromPath(String path) {
        def name = path.tokenize('/').last()
        return name.replace(FILE_SUFFIX, '')
    }

    static String resolveChildItemPath(def item) {
        if (item == null) {
            return null
        }
        if (item instanceof String) {
            def text = (item as String).trim()
            return text ?: null
        }
        if (item instanceof Map) {
            def fromMap = item.path ?: item['path']
            if (fromMap instanceof String && fromMap.trim()) {
                return fromMap.trim()
            }
        }
        try {
            def path = item.path
            if (path instanceof String && path.trim()) {
                return path.trim()
            }
        } catch (Exception ignored) {
        }
        try {
            def meta = item.metaData
            if (meta != null && meta.path instanceof String && meta.path.trim()) {
                return meta.path.trim()
            }
        } catch (Exception ignored) {
        }
        try {
            def fromGetter = item.getPath()
            if (fromGetter instanceof String && fromGetter.trim()) {
                return fromGetter.trim()
            }
        } catch (Exception ignored) {
        }
        return null
    }

    String generateUniqueWorkflowId(String siteId, String name) {
        def base = WorkflowDefinitionSupport.slugify(name) ?: 'workflow'
        def candidate = base
        def counter = 2
        while (listWorkflowIds(siteId).contains(candidate)) {
            candidate = "${base}-${counter}"
            counter++
        }
        return candidate
    }

    static String ensureUniqueStepId(String stepId, Set existing) {
        def candidate = stepId
        def counter = 2
        while (existing.contains(candidate)) {
            candidate = "${stepId}-${counter}"
            counter++
        }
        return candidate
    }

    int nextWorkflowPosition(String siteId) {
        def ids = listWorkflowIds(siteId)
        if (!ids) {
            return 0
        }
        def max = ids.collect { loadDefinition(siteId, it).position ?: 0 }.max() ?: 0
        return (max as int) + 100
    }

    static List<Map> defaultSteps() {
        return [
            [
                id: 'backlog', name: 'Backlog', position: 1000, color: 'blue', isTerminal: false,
                allowAddPackage: true, actionType: StepActionType.NONE, actionSuccessStepId: null,
                roleRule: [mode: 'all', roles: []], contentRule: [mode: 'all', pathPatterns: [], contentTypes: []]
            ],
            [
                id: 'in-progress', name: 'In Progress', position: 2000, color: 'orange', isTerminal: false,
                allowAddPackage: false, actionType: StepActionType.NONE, actionSuccessStepId: null,
                roleRule: [mode: 'all', roles: []], contentRule: [mode: 'all', pathPatterns: [], contentTypes: []]
            ],
            [
                id: 'done', name: 'Done', position: 3000, color: 'green', isTerminal: true,
                allowAddPackage: false, actionType: StepActionType.NONE, actionSuccessStepId: null,
                roleRule: [mode: 'all', roles: []], contentRule: [mode: 'all', pathPatterns: [], contentTypes: []]
            ]
        ]
    }

    static Map extractStepActions(Map step, boolean includeSuccessStep) {
        def actionType = StepActionType.normalize(step.actionType)
        def result = [actionType: actionType]
        if (includeSuccessStep) {
            result.actionSuccessStepId = step.actionSuccessStepId?.toString()?.trim()
            result.actionSuccessStepClientKey = step.actionSuccessStepClientKey?.toString()?.trim()
        }
        return result
    }

    static String resolveSuccessStepId(Map step, Map stepActions, Set keptIds,
                                               Map clientKeyToStepId, List savedStepIds) {
        if (!stepActions.actionType || StepActionType.isArchiveAction(stepActions.actionType)) {
            return null
        }
        def successStepId = stepActions.actionSuccessStepId
        if (successStepId && keptIds.contains(successStepId)) {
            return successStepId
        }
        def clientKey = stepActions.actionSuccessStepClientKey
        if (clientKey && clientKeyToStepId[clientKey]) {
            return String.valueOf(clientKeyToStepId[clientKey])
        }
        if (step.actionSuccessStepIndex != null) {
            def index = step.actionSuccessStepIndex instanceof Number
                ? (step.actionSuccessStepIndex as Number).intValue()
                : Integer.parseInt(step.actionSuccessStepIndex as String)
            if (index >= 0 && index < savedStepIds.size()) {
                return String.valueOf(savedStepIds[index])
            }
        }
        return null
    }

    static List<String> resolveTransitionStepIds(Map step, Set keptIds, Map clientKeyToStepId) {
        def resolved = [] as LinkedHashSet
        def rawIds = step.transitionStepIds instanceof List ? step.transitionStepIds : []
        rawIds.each { rawId ->
            def id = rawId?.toString()?.trim()
            if (id && keptIds.contains(id)) {
                resolved << id
            }
        }
        def clientKeys = step.transitionStepClientKeys instanceof List ? step.transitionStepClientKeys : []
        clientKeys.each { rawKey ->
            def key = rawKey?.toString()?.trim()
            if (key && clientKeyToStepId[key]) {
                def id = String.valueOf(clientKeyToStepId[key])
                if (keptIds.contains(id)) {
                    resolved << id
                }
            }
        }
        return resolved.toList()
    }

    static Map resolveFlowLayout(def incomingLayout, def existingLayout, Map clientKeyToStepId, List savedStepIds) {
        def source = incomingLayout instanceof Map ? incomingLayout : (existingLayout instanceof Map ? existingLayout : [:])
        def layout = [:]
        source.each { key, value ->
            def stepId = key?.toString()?.trim()
            if (!stepId) {
                return
            }
            if (clientKeyToStepId[stepId]) {
                stepId = String.valueOf(clientKeyToStepId[stepId])
            }
            if (!savedStepIds.contains(stepId)) {
                return
            }
            if (!(value instanceof Map)) {
                return
            }
            def x = value.x instanceof Number ? (value.x as Number).doubleValue() : null
            def y = value.y instanceof Number ? (value.y as Number).doubleValue() : null
            if (x != null && y != null) {
                layout[stepId] = [x: x, y: y]
            }
        }
        return layout
    }

    static Map resolveFlowEdgeLayout(def incomingLayout, def existingLayout, Map clientKeyToStepId, List savedStepIds) {
        def source = incomingLayout instanceof Map ? incomingLayout : (existingLayout instanceof Map ? existingLayout : [:])
        def layout = [:]
        source.each { key, value ->
            def edgeKey = key?.toString()?.trim()
            if (!edgeKey || !(value instanceof Map)) {
                return
            }
            def parts = edgeKey.split('::', 2)
            if (parts.length != 2) {
                return
            }
            def sourceId = parts[0]?.trim()
            def targetId = parts[1]?.trim()
            if (clientKeyToStepId[sourceId]) {
                sourceId = String.valueOf(clientKeyToStepId[sourceId])
            }
            if (clientKeyToStepId[targetId]) {
                targetId = String.valueOf(clientKeyToStepId[targetId])
            }
            if (!savedStepIds.contains(sourceId) || !savedStepIds.contains(targetId)) {
                return
            }
            def offsetX = value.offsetX instanceof Number ? (value.offsetX as Number).doubleValue() : null
            def offsetY = value.offsetY instanceof Number ? (value.offsetY as Number).doubleValue() : null
            def curvature = value.curvature instanceof Number ? (value.curvature as Number).doubleValue() : null
            def entry = [:]
            if (offsetX != null && offsetY != null) {
                entry.offsetX = offsetX
                entry.offsetY = offsetY
            }
            if (curvature != null) {
                entry.curvature = Math.max(0.05d, Math.min(0.9d, curvature))
            }
            if (!entry.isEmpty()) {
                layout["${sourceId}::${targetId}"] = entry
            }
        }
        return layout
    }

    static Map resolveFlowViewport(def incomingViewport, def existingViewport) {
        def source = incomingViewport instanceof Map ? incomingViewport
            : (existingViewport instanceof Map ? existingViewport : null)
        if (!source) {
            return null
        }
        def x = source.x instanceof Number ? (source.x as Number).doubleValue() : null
        def y = source.y instanceof Number ? (source.y as Number).doubleValue() : null
        def zoom = source.zoom instanceof Number ? (source.zoom as Number).doubleValue() : null
        if (x == null || y == null || zoom == null || zoom <= 0) {
            return null
        }
        return [
            x    : x,
            y    : y,
            zoom : Math.max(0.5d, Math.min(1.75d, zoom))
        ]
    }
}
