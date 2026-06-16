import { MarkerType } from '@xyflow/react';
import type { WorkflowFlowEdgeLayout, WorkflowFlowEdgePath } from '../../api/adminApi';
export declare const TRANSITION_EDGE_PREFIX = "transition::";
export declare const WORKFLOW_EDGE_MARKER: {
    readonly type: MarkerType.ArrowClosed;
    readonly width: 14;
    readonly height: 14;
};
export declare const WORKFLOW_EDGE_INTERACTION_WIDTH = 40;
export declare type EdgeControlOffset = {
    offsetX: number;
    offsetY: number;
};
export declare function transitionEdgeId(sourceKey: string, targetKey: string): string;
export declare function flowEdgeKey(sourceKey: string, targetKey: string): string;
export declare function parseTransitionEdgeId(edgeId: string): {
    sourceKey: string;
    targetKey: string;
} | null;
export declare function parseFlowEdgeKey(key: string): {
    sourceKey: string;
    targetKey: string;
} | null;
export declare function edgeMidpoint(sourceX: number, sourceY: number, targetX: number, targetY: number): {
    x: number;
    y: number;
};
export declare function perpendicularUnitVector(sourceX: number, sourceY: number, targetX: number, targetY: number): {
    x: number;
    y: number;
};
export declare function defaultEdgeControlOffset(sourceX: number, sourceY: number, targetX: number, targetY: number, backward: boolean): EdgeControlOffset;
/** Maps legacy curvature storage to a midpoint offset (approximate migration). */
export declare function controlOffsetFromCurvature(sourceX: number, sourceY: number, targetX: number, targetY: number, curvature: number): EdgeControlOffset;
export declare function computeControlOffsetFromHandle(sourceX: number, sourceY: number, targetX: number, targetY: number, handleX: number, handleY: number): EdgeControlOffset;
export declare function resolveStoredEdgePath(layout: WorkflowFlowEdgeLayout | undefined, sourceKey: string, targetKey: string): WorkflowFlowEdgePath | undefined;
export declare function resolveEdgeControlOffset(stored: WorkflowFlowEdgePath | undefined, sourceX: number, sourceY: number, targetX: number, targetY: number, backward: boolean): EdgeControlOffset;
/** Quadratic bezier with the handle placed on the curve at t = 0.5. */
export declare function buildQuadraticBezierPath(sourceX: number, sourceY: number, targetX: number, targetY: number, offset: EdgeControlOffset): {
    path: string;
    handleX: number;
    handleY: number;
    labelX: number;
    labelY: number;
};
export declare function mapFlowEdgeLayoutToClientKeys(layout: WorkflowFlowEdgeLayout | undefined, steps: Array<{
    clientKey: string;
    id?: string;
}>): WorkflowFlowEdgeLayout;
export declare function mapFlowEdgeLayoutToStepIds(layout: WorkflowFlowEdgeLayout, steps: Array<{
    clientKey: string;
    id?: string;
}>): WorkflowFlowEdgeLayout;
export declare function pruneFlowEdgeLayout(layout: WorkflowFlowEdgeLayout, removedStepKey: string): WorkflowFlowEdgeLayout;
