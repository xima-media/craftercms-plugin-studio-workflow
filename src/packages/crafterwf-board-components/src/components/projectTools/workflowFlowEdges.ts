import { MarkerType } from '@xyflow/react';

import type { WorkflowFlowEdgeLayout, WorkflowFlowEdgePath } from '../../api/adminApi';

export const TRANSITION_EDGE_PREFIX = 'transition::';

export const WORKFLOW_EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14
} as const;

export const WORKFLOW_EDGE_INTERACTION_WIDTH = 40;

export type EdgeControlOffset = {
  offsetX: number;
  offsetY: number;
};

export function transitionEdgeId(sourceKey: string, targetKey: string): string {
  return `${TRANSITION_EDGE_PREFIX}${flowEdgeKey(sourceKey, targetKey)}`;
}

export function flowEdgeKey(sourceKey: string, targetKey: string): string {
  return `${sourceKey}::${targetKey}`;
}

export function parseTransitionEdgeId(edgeId: string): { sourceKey: string; targetKey: string } | null {
  if (!edgeId.startsWith(TRANSITION_EDGE_PREFIX)) {
    return null;
  }
  return parseFlowEdgeKey(edgeId.slice(TRANSITION_EDGE_PREFIX.length));
}

export function parseFlowEdgeKey(key: string): { sourceKey: string; targetKey: string } | null {
  const splitAt = key.indexOf('::');
  if (splitAt <= 0) {
    return null;
  }
  const sourceKey = key.slice(0, splitAt);
  const targetKey = key.slice(splitAt + 2);
  if (!sourceKey || !targetKey) {
    return null;
  }
  return { sourceKey, targetKey };
}

export function edgeMidpoint(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  return {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2
  };
}

export function perpendicularUnitVector(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  return { x: -dy / length, y: dx / length };
}

export function defaultEdgeControlOffset(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  backward: boolean
): EdgeControlOffset {
  const { x: perpX, y: perpY } = perpendicularUnitVector(sourceX, sourceY, targetX, targetY);
  const length = Math.hypot(targetX - sourceX, targetY - sourceY) || 1;
  const magnitude = length * (backward ? 0.22 : 0.12);
  const sign = backward ? -1 : 1;
  return {
    offsetX: perpX * magnitude * sign,
    offsetY: perpY * magnitude * sign
  };
}

/** Maps legacy curvature storage to a midpoint offset (approximate migration). */
export function controlOffsetFromCurvature(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  curvature: number
): EdgeControlOffset {
  const { x: perpX, y: perpY } = perpendicularUnitVector(sourceX, sourceY, targetX, targetY);
  const length = Math.hypot(targetX - sourceX, targetY - sourceY) || 1;
  const magnitude = length * (curvature - 0.25) * 0.55;
  return { offsetX: perpX * magnitude, offsetY: perpY * magnitude };
}

export function computeControlOffsetFromHandle(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  handleX: number,
  handleY: number
): EdgeControlOffset {
  const { x: midX, y: midY } = edgeMidpoint(sourceX, sourceY, targetX, targetY);
  return {
    offsetX: handleX - midX,
    offsetY: handleY - midY
  };
}

export function resolveStoredEdgePath(
  layout: WorkflowFlowEdgeLayout | undefined,
  sourceKey: string,
  targetKey: string
): WorkflowFlowEdgePath | undefined {
  return layout?.[flowEdgeKey(sourceKey, targetKey)];
}

export function resolveEdgeControlOffset(
  stored: WorkflowFlowEdgePath | undefined,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  backward: boolean
): EdgeControlOffset {
  if (stored && typeof stored.offsetX === 'number' && typeof stored.offsetY === 'number') {
    return { offsetX: stored.offsetX, offsetY: stored.offsetY };
  }
  if (stored && typeof stored.curvature === 'number' && Number.isFinite(stored.curvature)) {
    return controlOffsetFromCurvature(
      sourceX,
      sourceY,
      targetX,
      targetY,
      Math.max(0.05, Math.min(0.9, stored.curvature))
    );
  }
  return defaultEdgeControlOffset(sourceX, sourceY, targetX, targetY, backward);
}

/** Quadratic bezier with the handle placed on the curve at t = 0.5. */
export function buildQuadraticBezierPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offset: EdgeControlOffset
): { path: string; handleX: number; handleY: number; labelX: number; labelY: number } {
  const { x: midX, y: midY } = edgeMidpoint(sourceX, sourceY, targetX, targetY);
  const handleX = midX + offset.offsetX;
  const handleY = midY + offset.offsetY;
  const controlX = 2 * handleX - midX;
  const controlY = 2 * handleY - midY;
  const path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
  const t = 0.5;
  const labelX = (1 - t) * (1 - t) * sourceX + 2 * (1 - t) * t * controlX + t * t * targetX;
  const labelY = (1 - t) * (1 - t) * sourceY + 2 * (1 - t) * t * controlY + t * t * targetY;
  return { path, handleX, handleY, labelX, labelY };
}

export function mapFlowEdgeLayoutToClientKeys(
  layout: WorkflowFlowEdgeLayout | undefined,
  steps: Array<{ clientKey: string; id?: string }>
): WorkflowFlowEdgeLayout {
  if (!layout) {
    return {};
  }
  const idToClientKey = new Map(steps.filter((step) => step.id).map((step) => [step.id as string, step.clientKey]));
  const mapped: WorkflowFlowEdgeLayout = {};
  Object.entries(layout).forEach(([key, value]) => {
    const parsed = parseFlowEdgeKey(key);
    if (!parsed || !value || typeof value !== 'object') {
      return;
    }
    const sourceKey = idToClientKey.get(parsed.sourceKey) ?? parsed.sourceKey;
    const targetKey = idToClientKey.get(parsed.targetKey) ?? parsed.targetKey;
    if (steps.some((step) => step.clientKey === sourceKey) && steps.some((step) => step.clientKey === targetKey)) {
      mapped[flowEdgeKey(sourceKey, targetKey)] = value;
    }
  });
  return mapped;
}

export function mapFlowEdgeLayoutToStepIds(
  layout: WorkflowFlowEdgeLayout,
  steps: Array<{ clientKey: string; id?: string }>
): WorkflowFlowEdgeLayout {
  const clientKeyToId = new Map(steps.filter((step) => step.id).map((step) => [step.clientKey, step.id as string]));
  const mapped: WorkflowFlowEdgeLayout = {};
  Object.entries(layout).forEach(([key, value]) => {
    const parsed = parseFlowEdgeKey(key);
    if (!parsed) {
      return;
    }
    const sourceId = clientKeyToId.get(parsed.sourceKey) ?? parsed.sourceKey;
    const targetId = clientKeyToId.get(parsed.targetKey) ?? parsed.targetKey;
    mapped[flowEdgeKey(sourceId, targetId)] = value;
  });
  return mapped;
}

export function pruneFlowEdgeLayout(
  layout: WorkflowFlowEdgeLayout,
  removedStepKey: string
): WorkflowFlowEdgeLayout {
  const next: WorkflowFlowEdgeLayout = {};
  Object.entries(layout).forEach(([key, value]) => {
    const parsed = parseFlowEdgeKey(key);
    if (!parsed || parsed.sourceKey === removedStepKey || parsed.targetKey === removedStepKey) {
      return;
    }
    next[key] = value;
  });
  return next;
}
