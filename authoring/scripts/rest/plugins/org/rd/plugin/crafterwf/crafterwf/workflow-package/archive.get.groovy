import plugins.org.rd.plugin.crafterwf.WorkflowContext

def siteId = WorkflowContext.requireSiteId(params)
def ctx = WorkflowContext.create(applicationContext, pluginConfig, false)
def userId = WorkflowContext.resolveUserId(applicationContext)
def username = WorkflowContext.resolveUsername(applicationContext, request)

def workflowPackageId = params.workflowPackageId ?: params.cardId
if (!workflowPackageId) {
    throw new IllegalArgumentException('workflowPackageId is required')
}

ctx.packageService.archivePackage(siteId, workflowPackageId, userId, username)
return [archived: true, workflowPackageId: workflowPackageId]
