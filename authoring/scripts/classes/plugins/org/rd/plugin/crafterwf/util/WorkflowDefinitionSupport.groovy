package plugins.org.rd.plugin.crafterwf.util

import plugins.org.rd.plugin.crafterwf.model.StepActionType
import plugins.org.rd.plugin.crafterwf.util.EventListenerJson

class WorkflowDefinitionSupport {

    static String slugify(String value) {
        def text = value?.toString()?.trim()?.toLowerCase()
        if (!text) {
            return ''
        }
        return text.replaceAll(/[^a-z0-9]+/, '-').replaceAll(/^-+|-+$/, '')
    }

    /** Returns a publish action type, or null when the step has no automatic action. */
    static String resolveActionType(Map step) {
        def type = StepActionType.normalize(step?.actionType)
        if (type) {
            return type
        }
        return StepActionType.fromLegacyFlags(step)
    }

    static boolean allowsAddPackage(Map step) {
        return step?.allowAddPackage == true || step?.allowAddPackage == 'true' || step?.allowAddPackage == 1 ||
            step?.allowAddPackage == '1'
    }

    static Map toWorkflowDto(Map definition) {
        return [
            id              : definition.id,
            name            : definition.name,
            description     : definition.description ?: '',
            backgroundUrl   : definition.backgroundUrl,
            backgroundColor : definition.backgroundColor ?: definition.backgroundUrl,
            position        : definition.position != null ? definition.position : 0,
            isDefault       : definition.isDefault == true,
            createListeners       : EventListenerJson.toListenerDtos(definition.createListeners),
            editListeners         : EventListenerJson.toListenerDtos(definition.editListeners),
            bypassWarningMessage  : definition.bypassWarningMessage?.toString() ?: '',
            allowUiBypass         : allowsUiBypass(definition),
            flowLayout            : definition.flowLayout instanceof Map
                ? new LinkedHashMap(definition.flowLayout)
                : (definition.flowLayout ?: [:]),
            flowEdgeLayout        : definition.flowEdgeLayout instanceof Map
                ? new LinkedHashMap(definition.flowEdgeLayout)
                : (definition.flowEdgeLayout ?: [:]),
            flowViewport          : definition.flowViewport instanceof Map
                ? new LinkedHashMap(definition.flowViewport)
                : (definition.flowViewport ?: null)
        ]
    }

    static boolean allowsUiBypass(Map definition) {
        return definition?.allowUiBypass == true || definition?.allowUiBypass == 'true' ||
            definition?.allowUiBypass == 1 || definition?.allowUiBypass == '1'
    }

    static List<String> actionStepIds(Map definition) {
        def ids = [] as LinkedHashSet
        sortedSteps(definition).each { step ->
            def actionType = resolveActionType(step)
            if (StepActionType.isActionStep(actionType)) {
                ids << (step.id as String)
            }
        }
        return ids.toList()
    }

    /** Steps whose automated action is publish/review (used by the Studio bypass guard). */
    static List<String> publishActionStepIds(Map definition) {
        def ids = [] as LinkedHashSet
        sortedSteps(definition).each { step ->
            def actionType = resolveActionType(step)
            if (StepActionType.isPublishAction(actionType)) {
                ids << (step.id as String)
            }
        }
        return ids.toList()
    }

    static String stepName(Map definition, String stepId) {
        if (!stepId) {
            return ''
        }
        def step = stepLookup(definition)[stepId]
        return step?.name?.toString()?.trim() ?: stepId
    }

    static Map toStepDto(Map step) {
        def actionType = resolveActionType(step)
        return [
            id                 : step.id,
            name               : step.name,
            description        : step.description,
            position           : step.position != null ? step.position : 0,
            color              : step.color ?: 'blue',
            isTerminal         : step.isTerminal == true,
            allowAddPackage    : allowsAddPackage(step),
            actionType         : actionType ?: StepActionType.NONE,
            actionSuccessStepId: step.actionSuccessStepId,
            transitionStepIds  : step.transitionStepIds instanceof List
                ? step.transitionStepIds.collect { it?.toString()?.trim() }.findAll { it }
                : [],
            roleRule           : StepRuleJson.toRoleRuleDto(step),
            contentRule        : StepRuleJson.toContentRuleDto(step)
        ]
    }

    static List<Map> sortedSteps(Map definition) {
        def steps = (definition?.steps instanceof List) ? definition.steps.collect { it instanceof Map ? it : [:] } : []
        return steps.sort { a, b ->
            def ap = a.position instanceof Number ? a.position as double : 0d
            def bp = b.position instanceof Number ? b.position as double : 0d
            ap <=> bp
        }
    }

    static Map stepLookup(Map definition) {
        def lookup = [:]
        sortedSteps(definition).each { step ->
            if (step.id) {
                lookup[step.id as String] = step
            }
        }
        return lookup
    }
}
