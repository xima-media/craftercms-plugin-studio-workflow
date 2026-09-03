import { get, post } from '@craftercms/studio-ui/utils/ajax';
import { pluginDelete, pluginPost } from './pluginHttp';
import { PLUGIN_SERVICE_BASE } from './workflowApi';

export interface SchemaStatus {
  installed: boolean;
  schemaName: string;
  version: number;
  error?: string;
  remedialAction?: string;
  detail?: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  backgroundUrl?: string;
  position?: number;
  isDefault?: boolean;
  stepCount: number;
  packageCount: number;
}

import { StepActionType } from '../stepActions';
import { StepContentRule, StepRoleRule } from '../stepRules';
import { WorkflowEventListener } from '../eventListeners';

export interface WorkflowFlowNodePosition {
  x: number;
  y: number;
}

/** Canvas positions keyed by step id (persisted in workflow JSON). */
export type WorkflowFlowLayout = Record<string, WorkflowFlowNodePosition>;

/** Curve shape overrides for manual Move edges, keyed by "sourceId::targetId". */
export interface WorkflowFlowEdgePath {
  /** Offset of the curve midpoint from the straight line between endpoints (flow coords). */
  offsetX?: number;
  offsetY?: number;
  /** Legacy scalar curvature; migrated to offsetX/offsetY when the edge is edited. */
  curvature?: number;
}

export type WorkflowFlowEdgeLayout = Record<string, WorkflowFlowEdgePath>;

/** React Flow pan/zoom state (persisted in workflow JSON). */
export interface WorkflowFlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_FLOW_VIEWPORT: WorkflowFlowViewport = { x: 0, y: 0, zoom: 1 };

export function normalizeFlowViewport(value: unknown): WorkflowFlowViewport | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const x = typeof record.x === 'number' ? record.x : Number(record.x);
  const y = typeof record.y === 'number' ? record.y : Number(record.y);
  const zoom = typeof record.zoom === 'number' ? record.zoom : Number(record.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) {
    return null;
  }
  return { x, y, zoom: Math.min(1.75, Math.max(0.5, zoom)) };
}

export interface WorkflowStepDto {
  id?: string;
  name: string;
  description?: string;
  position?: number;
  color?: string;
  isTerminal?: boolean;
  allowAddPackage?: boolean;
  clientKey?: string;
  actionType?: StepActionType;
  actionSuccessStepId?: string;
  actionSuccessStepClientKey?: string;
  /** Step ids packages may be manually dragged to from this step (empty = any step). */
  transitionStepIds?: string[];
  /** Editor-only client keys for transitionStepIds. */
  transitionStepClientKeys?: string[];
  /** @deprecated legacy boolean flags — use actionType */
  actionRequestPublishStaging?: boolean;
  actionRequestPublishLive?: boolean;
  actionPublishStaging?: boolean;
  actionPublishLive?: boolean;
  roleRule?: StepRoleRule;
  contentRule?: StepContentRule;
}

export interface PublishingTargetsInfo {
  stagingEnabled: boolean;
  targets?: string[];
}

export interface WorkflowDetail {
  workflow: {
    id: string;
    name: string;
    description?: string;
    /** Board canvas swatch id, or an http(s) URL for a background image. */
    backgroundUrl?: string;
    position?: number;
    isDefault?: boolean;
    createListeners?: WorkflowEventListener[];
    editListeners?: WorkflowEventListener[];
    bypassWarningMessage?: string;
    /** When true, authors may acknowledge and continue Studio publish/reject off-step. Default false. */
    allowUiBypass?: boolean;
    /** React Flow node positions keyed by step id. */
    flowLayout?: WorkflowFlowLayout;
    /** Saved bezier curvature for Move transition edges keyed by "sourceStepId::targetStepId". */
    flowEdgeLayout?: WorkflowFlowEdgeLayout;
    /** Saved canvas pan/zoom for the workflow flow editor. */
    flowViewport?: WorkflowFlowViewport | null;
  };
  steps: WorkflowStepDto[];
  createListeners?: WorkflowEventListener[];
  editListeners?: WorkflowEventListener[];
}

export function getSchemaStatus(siteId: string) {
  return get(
    `${PLUGIN_SERVICE_BASE}/admin/schema/status.json?siteId=${encodeURIComponent(siteId)}`
  );
}

export function installSchema(siteId: string) {
  return pluginPost(
    `${PLUGIN_SERVICE_BASE}/admin/schema/install.json?siteId=${encodeURIComponent(siteId)}`
  );
}

export function listWorkflows(siteId: string) {
  return get(`${PLUGIN_SERVICE_BASE}/admin/workflow/list.json?siteId=${encodeURIComponent(siteId)}`);
}

export function getWorkflow(siteId: string, workflowId: string) {
  return get(
    `${PLUGIN_SERVICE_BASE}/admin/workflow/get.json?siteId=${encodeURIComponent(siteId)}&workflowId=${encodeURIComponent(workflowId)}`
  );
}

export function createWorkflow(siteId: string, name: string, description = '') {
  const url =
    `${PLUGIN_SERVICE_BASE}/admin/workflow/create.json?siteId=${encodeURIComponent(siteId)}` +
    `&name=${encodeURIComponent(name)}` +
    `&description=${encodeURIComponent(description)}` +
    '&withDefaultSteps=true';
  return pluginPost(url);
}

export function deleteWorkflow(siteId: string, workflowId: string) {
  return pluginDelete(
    `${PLUGIN_SERVICE_BASE}/admin/workflow/delete.json?siteId=${encodeURIComponent(siteId)}&workflowId=${encodeURIComponent(workflowId)}`
  );
}

export function saveWorkflowDefinition(siteId: string, workflowId: string, payload: WorkflowDetail) {
  const createListeners = payload.createListeners ?? payload.workflow.createListeners ?? [];
  const editListeners = payload.editListeners ?? payload.workflow.editListeners ?? [];
  return post(
    `${PLUGIN_SERVICE_BASE}/admin/workflow/save.json?siteId=${encodeURIComponent(siteId)}`,
    {
      siteId,
      workflowId,
      workflow: {
        ...payload.workflow,
        createListeners,
        editListeners
      },
      steps: payload.steps,
      createListeners,
      editListeners
    }
  );
}

export function getPublishingTargets(siteId: string) {
  return get(
    `${PLUGIN_SERVICE_BASE}/admin/publishing/targets.json?siteId=${encodeURIComponent(siteId)}`
  );
}
