import * as React from 'react';
import { EdgeProps } from '@xyflow/react';
import { EdgeControlOffset } from './workflowFlowEdges';
import type { WorkflowFlowEdgePath } from '../../api/adminApi';
declare type WorkflowMoveEdgeContextValue = {
    onControlOffsetDrag(edgeId: string, offset: EdgeControlOffset): void;
    onControlOffsetDragEnd(edgeId: string, offset: EdgeControlOffset): void;
};
export declare const WorkflowMoveEdgeContext: React.Context<WorkflowMoveEdgeContextValue>;
export declare type WorkflowMoveEdgeData = WorkflowFlowEdgePath & {
    backward?: boolean;
};
declare const _default: React.MemoExoticComponent<({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, selected, label, labelStyle, labelBgStyle, labelBgPadding, labelBgBorderRadius, data }: EdgeProps<import("@xyflow/react").Edge<Record<string, unknown>, string>>) => JSX.Element>;
export default _default;
