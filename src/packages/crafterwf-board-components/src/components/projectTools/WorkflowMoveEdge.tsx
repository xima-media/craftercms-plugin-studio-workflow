import * as React from 'react';
import { memo, useCallback, useContext, useEffect, useRef } from 'react';
import { BaseEdge, EdgeProps, useReactFlow } from '@xyflow/react';
import { useTheme } from '@mui/material';

import {
  buildQuadraticBezierPath,
  computeControlOffsetFromHandle,
  resolveEdgeControlOffset,
  EdgeControlOffset,
  WORKFLOW_EDGE_INTERACTION_WIDTH
} from './workflowFlowEdges';
import type { WorkflowFlowEdgePath } from '../../api/adminApi';

type WorkflowMoveEdgeContextValue = {
  onControlOffsetDrag(edgeId: string, offset: EdgeControlOffset): void;
  onControlOffsetDragEnd(edgeId: string, offset: EdgeControlOffset): void;
};

export const WorkflowMoveEdgeContext = React.createContext<WorkflowMoveEdgeContextValue | null>(null);

export type WorkflowMoveEdgeData = WorkflowFlowEdgePath & {
  backward?: boolean;
};

function resolveOffset(
  edgeData: WorkflowMoveEdgeData | undefined,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): EdgeControlOffset {
  if (edgeData && typeof edgeData.offsetX === 'number' && typeof edgeData.offsetY === 'number') {
    return { offsetX: edgeData.offsetX, offsetY: edgeData.offsetY };
  }
  return resolveEdgeControlOffset(edgeData, sourceX, sourceY, targetX, targetY, Boolean(edgeData?.backward));
}

const WorkflowMoveEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  selected,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  data
}: EdgeProps) => {
  const theme = useTheme();
  const { screenToFlowPosition } = useReactFlow();
  const edgeContext = useContext(WorkflowMoveEdgeContext);
  const edgeData = data as WorkflowMoveEdgeData | undefined;
  const latestOffsetRef = useRef<EdgeControlOffset>(
    resolveOffset(edgeData, sourceX, sourceY, targetX, targetY)
  );
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const offset = resolveOffset(edgeData, sourceX, sourceY, targetX, targetY);
  latestOffsetRef.current = offset;

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  const { path, handleX, handleY, labelX, labelY } = buildQuadraticBezierPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    offset
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGCircleElement>) => {
      event.stopPropagation();
      event.preventDefault();

      dragCleanupRef.current?.();

      let cleanedUp = false;

      const applyOffset = (handleXPos: number, handleYPos: number) => {
        const next = computeControlOffsetFromHandle(sourceX, sourceY, targetX, targetY, handleXPos, handleYPos);
        latestOffsetRef.current = next;
        edgeContext?.onControlOffsetDrag(id, next);
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        const flow = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        applyOffset(flow.x, flow.y);
      };

      const cleanup = () => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (dragCleanupRef.current === cleanup) {
          dragCleanupRef.current = null;
        }
      };

      const onPointerUp = () => {
        edgeContext?.onControlOffsetDragEnd(id, latestOffsetRef.current);
        cleanup();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      dragCleanupRef.current = cleanup;
    },
    [edgeContext, id, screenToFlowPosition, sourceX, sourceY, targetX, targetY]
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        label={label}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        labelX={labelX}
        labelY={labelY}
        interactionWidth={WORKFLOW_EDGE_INTERACTION_WIDTH}
      />
      {selected ? (
        <circle
          className="crafterwf-workflow-edge-handle nodrag nopan"
          cx={handleX}
          cy={handleY}
          r={10}
          fill={theme.palette.primary.main}
          stroke={theme.palette.background.paper}
          strokeWidth={2}
          style={{ pointerEvents: 'all', cursor: 'grab' }}
          onPointerDown={handlePointerDown}
        />
      ) : null}
    </>
  );
};

export default memo(WorkflowMoveEdge);
