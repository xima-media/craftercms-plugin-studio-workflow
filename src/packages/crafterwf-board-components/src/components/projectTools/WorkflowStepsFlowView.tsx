import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  ConnectionLineType,
  ConnectionMode,
  PanOnScrollMode,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange
} from '@xyflow/react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';
import { Box, Button, FormControlLabel, Stack, Switch, Tooltip, Typography, useTheme } from '@mui/material';

import type { WorkflowFlowEdgeLayout, WorkflowFlowLayout, WorkflowFlowViewport, WorkflowStepDto } from '../../api/adminApi';
import { DEFAULT_FLOW_VIEWPORT } from '../../api/adminApi';
import { getStepActionLabel, getStepActionDescriptions, hasStepAction, hasPublishStepAction, isArchiveStepAction, SUCCESS_STEP_NONE } from '../../stepActions';
import { hasConfiguredContentRule, hasConfiguredRoleRule } from '../../stepRules';
import WorkflowStepFlowNode, {
  WORKFLOW_STEP_NODE_HEIGHT,
  WORKFLOW_STEP_NODE_WIDTH,
  WorkflowStepFlowNodeData
} from './WorkflowStepFlowNode';
import { useReactFlowStyles } from './useReactFlowStyles';
import WorkflowMoveEdge, { WorkflowMoveEdgeContext } from './WorkflowMoveEdge';
import {
  flowEdgeKey,
  parseTransitionEdgeId,
  resolveStoredEdgePath,
  transitionEdgeId,
  WORKFLOW_EDGE_INTERACTION_WIDTH,
  WORKFLOW_EDGE_MARKER
} from './workflowFlowEdges';

export type FlowEditorStep = WorkflowStepDto & { clientKey: string };

export interface WorkflowStepsFlowViewProps {
  steps: FlowEditorStep[];
  flowLayout: WorkflowFlowLayout;
  flowEdgeLayout: WorkflowFlowEdgeLayout;
  initialFlowViewport?: WorkflowFlowViewport | null;
  selectedClientKey: string | null;
  onSelectStep(clientKey: string): void;
  onFlowLayoutChange(layout: WorkflowFlowLayout): void;
  onFlowEdgeLayoutChange(layout: WorkflowFlowEdgeLayout): void;
  onFlowViewportChange?(viewport: WorkflowFlowViewport): void;
  onTransitionChange(sourceClientKey: string, targetClientKeys: string[]): void;
  onAddStep(): void;
}

const NODE_TYPES = {
  workflowStep: WorkflowStepFlowNode
} as NodeTypes;

const EDGE_TYPES = {
  workflowMove: WorkflowMoveEdge
} as EdgeTypes;

const NODE_GAP_X = 24;
const DEFAULT_ORIGIN = { x: 32, y: 48 };

export function buildDefaultRowLayout(steps: FlowEditorStep[]): WorkflowFlowLayout {
  const layout: WorkflowFlowLayout = {};
  steps.forEach((step, index) => {
    layout[step.clientKey] = defaultPosition(index);
  });
  return layout;
}

export function defaultPosition(index: number): { x: number; y: number } {
  return {
    x: DEFAULT_ORIGIN.x + index * (WORKFLOW_STEP_NODE_WIDTH + NODE_GAP_X),
    y: DEFAULT_ORIGIN.y
  };
}

/** Canvas position for a newly added step without moving existing steps. */
export function positionForAddedStep(
  existingSteps: FlowEditorStep[],
  flowLayout: WorkflowFlowLayout
): { x: number; y: number } {
  const positions = existingSteps
    .map((step) => flowLayout[step.clientKey])
    .filter((position): position is { x: number; y: number } => !!position);

  if (positions.length === 0) {
    return defaultPosition(existingSteps.length);
  }

  const rightmost = positions.reduce((best, current) => (current.x > best.x ? current : best));
  return {
    x: rightmost.x + WORKFLOW_STEP_NODE_WIDTH + NODE_GAP_X,
    y: rightmost.y
  };
}

function resolveSuccessTarget(
  step: FlowEditorStep,
  steps: FlowEditorStep[]
): FlowEditorStep | null {
  if (!hasPublishStepAction(step.actionType)) {
    return null;
  }
  const targetKey = step.actionSuccessStepClientKey || step.actionSuccessStepId;
  if (!targetKey || targetKey === SUCCESS_STEP_NONE) {
    return null;
  }
  return steps.find((candidate) => candidate.clientKey === targetKey || candidate.id === targetKey) ?? null;
}

function buildNodeData(step: FlowEditorStep, selectedClientKey: string | null): WorkflowStepFlowNodeData {
  return {
    label: step.name?.trim() || 'Untitled step',
    color: step.color || '',
    isTerminal: !!step.isTerminal,
    allowAddPackage: !!step.allowAddPackage,
    selected: selectedClientKey === step.clientKey,
    actionType: step.actionType,
    hasRoleRules: hasConfiguredRoleRule(step.roleRule),
    hasContentRules: hasConfiguredContentRule(step.contentRule)
  };
}

function buildNodes(
  steps: FlowEditorStep[],
  flowLayout: WorkflowFlowLayout,
  selectedClientKey: string | null
): Node[] {
  return steps.map((step, index) => {
    const position = flowLayout[step.clientKey] ?? defaultPosition(index);
    return {
      id: step.clientKey,
      type: 'workflowStep',
      position,
      width: WORKFLOW_STEP_NODE_WIDTH,
      height: WORKFLOW_STEP_NODE_HEIGHT,
      data: buildNodeData(step, selectedClientKey),
      draggable: true,
      selectable: true,
      connectable: true
    };
  });
}

function stepOrderIndex(steps: FlowEditorStep[], clientKey: string): number {
  return steps.findIndex((step) => step.clientKey === clientKey);
}

function isBackwardTransition(steps: FlowEditorStep[], sourceKey: string, targetKey: string): boolean {
  const sourceIndex = stepOrderIndex(steps, sourceKey);
  const targetIndex = stepOrderIndex(steps, targetKey);
  if (sourceIndex < 0 || targetIndex < 0) {
    return false;
  }
  return targetIndex < sourceIndex;
}

function buildEdges(
  steps: FlowEditorStep[],
  flowEdgeLayout: WorkflowFlowEdgeLayout,
  transitionColor: string,
  actionColor: string,
  backwardColor: string,
  showBackwardArrows: boolean,
  labelBackground: string
): Edge[] {
  const edges: Edge[] = [];
  const stepByKey = new Map(steps.map((step) => [step.clientKey, step]));

  steps.forEach((step) => {
    const targets = step.transitionStepClientKeys ?? [];
    targets.forEach((targetKey) => {
      if (!stepByKey.has(targetKey) || targetKey === step.clientKey) {
        return;
      }
      const backward = isBackwardTransition(steps, step.clientKey, targetKey);
      if (backward && !showBackwardArrows) {
        return;
      }
      const strokeColor = backward ? backwardColor : transitionColor;
      const storedPath = resolveStoredEdgePath(flowEdgeLayout, step.clientKey, targetKey);
      edges.push({
        id: transitionEdgeId(step.clientKey, targetKey),
        source: step.clientKey,
        target: targetKey,
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'workflowMove',
        selectable: true,
        deletable: true,
        focusable: true,
        interactionWidth: WORKFLOW_EDGE_INTERACTION_WIDTH,
        label: backward ? 'Move (back)' : 'Move',
        labelStyle: { fill: strokeColor, fontWeight: 700, fontSize: 13 },
        labelBgStyle: { fill: labelBackground, fillOpacity: 0.95 },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 4,
        data: { ...storedPath, backward },
        style: {
          stroke: strokeColor,
          strokeWidth: backward ? 2.5 : 3,
          strokeDasharray: backward ? '10 6' : undefined
        },
        markerEnd: { ...WORKFLOW_EDGE_MARKER, color: strokeColor },
        zIndex: backward ? 8 : 10
      });
    });

    const actionTarget = resolveSuccessTarget(step, steps);
    const actionLabel = getStepActionLabel(step.actionType);
    if (!actionTarget || !actionLabel || isArchiveStepAction(step.actionType)) {
      return;
    }

    edges.push({
      id: `action-${step.clientKey}-${actionTarget.clientKey}`,
      source: step.clientKey,
      target: actionTarget.clientKey,
      sourceHandle: 'source',
      targetHandle: 'target',
      type: 'default',
      animated: true,
      selectable: false,
      deletable: false,
      label: actionLabel,
      labelStyle: { fill: actionColor, fontWeight: 700, fontSize: 12 },
      labelBgStyle: { fill: labelBackground, fillOpacity: 0.92 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: actionColor, strokeWidth: 2.5, strokeDasharray: '8 5' },
      markerEnd: { ...WORKFLOW_EDGE_MARKER, color: actionColor },
      zIndex: 1
    });
  });

  return edges;
}

function layoutFromNodes(nodes: Node[]): WorkflowFlowLayout {
  const layout: WorkflowFlowLayout = {};
  nodes.forEach((node) => {
    layout[node.id] = { x: node.position.x, y: node.position.y };
  });
  return layout;
}

function FlowZoomToolbar({
  onResetRowLayout,
  onFlowViewportChange
}: {
  onResetRowLayout(): void;
  onFlowViewportChange?(viewport: WorkflowFlowViewport): void;
}) {
  const { zoomIn, zoomOut, setViewport, getViewport } = useReactFlow();

  const stopCanvasPointer = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Panel position="top-left">
      <Stack
        direction="row"
        spacing={0.5}
        onMouseDown={stopCanvasPointer}
        onPointerDown={stopCanvasPointer}
        sx={{
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          boxShadow: 1,
          p: 0.5,
          pointerEvents: 'all'
        }}
      >
        <Tooltip title="Zoom in">
          <Button
            size="small"
            variant="outlined"
            aria-label="Zoom in"
            onClick={() => {
              zoomIn({ duration: 150 });
              window.requestAnimationFrame(() => onFlowViewportChange?.(getViewport()));
            }}
          >
            +
          </Button>
        </Tooltip>
        <Tooltip title="Zoom out">
          <Button
            size="small"
            variant="outlined"
            aria-label="Zoom out"
            onClick={() => {
              zoomOut({ duration: 150 });
              window.requestAnimationFrame(() => onFlowViewportChange?.(getViewport()));
            }}
          >
            −
          </Button>
        </Tooltip>
        <Tooltip title="Reset zoom">
          <Button
            size="small"
            variant="outlined"
            aria-label="Reset zoom"
            onClick={() => {
              setViewport(DEFAULT_FLOW_VIEWPORT, { duration: 150 });
              window.requestAnimationFrame(() => onFlowViewportChange?.(getViewport()));
            }}
          >
            100%
          </Button>
        </Tooltip>
        <Tooltip title="Align steps in a horizontal row">
          <Button size="small" variant="contained" aria-label="Align steps in a row" onClick={onResetRowLayout}>
            Align row
          </Button>
        </Tooltip>
      </Stack>
    </Panel>
  );
}

function FlowDisplayToolbar({
  showBackwardArrows,
  onShowBackwardArrowsChange
}: {
  showBackwardArrows: boolean;
  onShowBackwardArrowsChange(checked: boolean): void;
}) {
  const stopCanvasPointer = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Panel position="top-right">
      <Stack
        direction="row"
        alignItems="center"
        onMouseDown={stopCanvasPointer}
        onPointerDown={stopCanvasPointer}
        sx={{
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          boxShadow: 1,
          px: 1,
          py: 0.25,
          pointerEvents: 'all'
        }}
      >
        <Tooltip title="Show return / backward Move arrows (display only; does not change saved transitions)">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showBackwardArrows}
                onChange={(_, checked) => onShowBackwardArrowsChange(checked)}
                inputProps={{ 'aria-label': 'Show backward arrows' }}
              />
            }
            label={
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                Backward arrows
              </Typography>
            }
            sx={{ m: 0, mr: 0.5 }}
          />
        </Tooltip>
      </Stack>
    </Panel>
  );
}

function FlowViewportInitializer({
  initialFlowViewport
}: {
  initialFlowViewport?: WorkflowFlowViewport | null;
}) {
  const { setViewport } = useReactFlow();
  const initialKey = JSON.stringify(initialFlowViewport ?? null);
  const appliedInitialKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (appliedInitialKeyRef.current === initialKey) {
      return;
    }
    appliedInitialKeyRef.current = initialKey;
    setViewport(initialFlowViewport ?? DEFAULT_FLOW_VIEWPORT, { duration: 0 });
  }, [initialKey, initialFlowViewport, setViewport]);

  return null;
}

function FlowCanvas({
  steps,
  flowLayout,
  flowEdgeLayout,
  initialFlowViewport,
  selectedClientKey,
  onSelectStep,
  onFlowLayoutChange,
  onFlowEdgeLayoutChange,
  onFlowViewportChange,
  onTransitionChange,
  onAddStep
}: WorkflowStepsFlowViewProps) {
  const siteId = useActiveSiteId();
  useReactFlowStyles(siteId);
  const theme = useTheme();
  const transitionColor = theme.palette.text.secondary;
  const actionColor = theme.palette.primary.main;
  const backwardColor = theme.palette.warning.dark;
  const labelBackground = theme.palette.background.paper;
  const backgroundDotColor =
    theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[300];
  const isDraggingRef = useRef(false);
  const [showBackwardArrows, setShowBackwardArrows] = React.useState(false);

  const stepKeys = useMemo(() => steps.map((step) => step.clientKey).join('|'), [steps]);
  const layoutKey = useMemo(() => JSON.stringify(flowLayout), [flowLayout]);
  const stepLabels = useMemo(
    () =>
      steps
        .map(
          (step) =>
            `${step.clientKey}:${step.name}:${step.color}:${step.actionType ?? ''}:${step.isTerminal}:${step.allowAddPackage}:${hasConfiguredRoleRule(step.roleRule)}:${hasConfiguredContentRule(step.contentRule)}`
        )
        .join('|'),
    [steps]
  );

  const [flowNodes, setFlowNodes] = React.useState<Node[]>(() =>
    buildNodes(steps, flowLayout, selectedClientKey)
  );

  const builtEdges = useMemo(
    () =>
      buildEdges(
        steps,
        flowEdgeLayout,
        transitionColor,
        actionColor,
        backwardColor,
        showBackwardArrows,
        labelBackground
      ),
    [steps, flowEdgeLayout, transitionColor, actionColor, backwardColor, showBackwardArrows, labelBackground]
  );

  const edgeSignature = useMemo(
    () =>
      steps
        .map(
          (step) =>
            `${step.clientKey}:${(step.transitionStepClientKeys ?? []).join(',')}:${step.actionType ?? ''}:${
              step.actionSuccessStepClientKey ?? step.actionSuccessStepId ?? ''
            }`
        )
        .join('|') + `|backward=${showBackwardArrows}`,
    [steps, showBackwardArrows]
  );

  const flowEdgeLayoutKey = useMemo(() => JSON.stringify(flowEdgeLayout), [flowEdgeLayout]);

  const [flowEdges, setFlowEdges] = React.useState<Edge[]>(builtEdges);

  useEffect(() => {
    setFlowEdges((current) => {
      const selectedById = new Map(current.filter((edge) => edge.selected).map((edge) => [edge.id, true]));
      return builtEdges.map((edge) => ({
        ...edge,
        selected: selectedById.get(edge.id) ?? false
      }));
    });
  }, [edgeSignature, flowEdgeLayoutKey, builtEdges]);

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }
    setFlowNodes(buildNodes(steps, flowLayout, selectedClientKey));
  }, [stepKeys, layoutKey, steps, flowLayout]);

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }
    setFlowNodes((current) =>
      current.map((node) => ({
        ...node,
        selected: node.id === selectedClientKey,
        data: buildNodeData(
          steps.find((step) => step.clientKey === node.id) ?? {
            clientKey: node.id,
            name: String(node.data?.label ?? '')
          },
          selectedClientKey
        )
      }))
    );
  }, [selectedClientKey, stepLabels, steps]);

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    setFlowNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleNodeDragStop = useCallback(() => {
    isDraggingRef.current = false;
    setFlowNodes((current) => {
      onFlowLayoutChange(layoutFromNodes(current));
      return current;
    });
  }, [onFlowLayoutChange]);

  const handleResetRowLayout = useCallback(() => {
    onFlowLayoutChange(buildDefaultRowLayout(steps));
  }, [onFlowLayoutChange, steps]);

  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: WorkflowFlowViewport) => {
      onFlowViewportChange?.(viewport);
    },
    [onFlowViewportChange]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const source = connection.source;
      const target = connection.target;
      if (!source || !target || source === target) {
        return;
      }
      const sourceStep = steps.find((step) => step.clientKey === source);
      if (!sourceStep) {
        return;
      }
      const existing = sourceStep.transitionStepClientKeys ?? [];
      if (existing.includes(target)) {
        return;
      }
      onTransitionChange(source, [...existing, target]);
    },
    [onTransitionChange, steps]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setFlowEdges((current) => applyEdgeChanges(changes, current));

      changes.forEach((change) => {
        if (change.type !== 'remove') {
          return;
        }
        const parsed = parseTransitionEdgeId(change.id);
        if (!parsed) {
          return;
        }
        const sourceStep = steps.find((step) => step.clientKey === parsed.sourceKey);
        if (!sourceStep) {
          return;
        }
        const nextTargets = (sourceStep.transitionStepClientKeys ?? []).filter(
          (key) => key !== parsed.targetKey
        );
        onTransitionChange(parsed.sourceKey, nextTargets);
      });
    },
    [onTransitionChange, steps]
  );

  const handleControlOffsetDrag = useCallback((edgeId: string, offset: { offsetX: number; offsetY: number }) => {
    setFlowEdges((current) =>
      current.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              data: {
                ...(edge.data as Record<string, unknown>),
                offsetX: offset.offsetX,
                offsetY: offset.offsetY
              }
            }
          : edge
      )
    );
  }, []);

  const handleControlOffsetDragEnd = useCallback(
    (edgeId: string, offset: { offsetX: number; offsetY: number }) => {
      const parsed = parseTransitionEdgeId(edgeId);
      if (!parsed) {
        return;
      }
      onFlowEdgeLayoutChange({
        ...flowEdgeLayout,
        [flowEdgeKey(parsed.sourceKey, parsed.targetKey)]: {
          offsetX: offset.offsetX,
          offsetY: offset.offsetY
        }
      });
    },
    [flowEdgeLayout, onFlowEdgeLayoutChange]
  );

  const edgeContextValue = useMemo(
    () => ({
      onControlOffsetDrag: handleControlOffsetDrag,
      onControlOffsetDragEnd: handleControlOffsetDragEnd
    }),
    [handleControlOffsetDrag, handleControlOffsetDragEnd]
  );

  return (
    <WorkflowMoveEdgeContext.Provider value={edgeContextValue}>
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        bgcolor: 'background.default',
        overflow: 'hidden'
      }}
    >
      <Box
        className="crafterwf-workflow-flow-canvas"
        onPointerDown={(event) => {
          // Prevent the scrollable dialog from hijacking canvas pan drags.
          event.stopPropagation();
        }}
        sx={{
          height: { xs: 360, sm: 420 },
          maxHeight: 'min(50vh, 480px)',
          width: '100%',
          position: 'relative',
          touchAction: 'none',
          userSelect: 'none',
          '& .react-flow': {
            width: '100%',
            height: '100%',
            bgcolor: 'background.default'
          }
        }}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeClick={(_, node) => onSelectStep(node.id)}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onMoveEnd={handleMoveEnd}
          nodesConnectable
          nodesDraggable
          elementsSelectable
          edgesFocusable
          selectNodesOnDrag={false}
          panOnDrag
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          panOnScrollSpeed={0.75}
          panActivationKeyCode="Space"
          zoomOnScroll={false}
          zoomOnPinch
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Bezier}
          connectionRadius={48}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultViewport={initialFlowViewport ?? DEFAULT_FLOW_VIEWPORT}
          minZoom={0.5}
          maxZoom={1.75}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            gap={24}
            size={1.5}
            color={backgroundDotColor}
            bgColor={theme.palette.background.default}
          />
          <FlowViewportInitializer initialFlowViewport={initialFlowViewport} />
          <FlowZoomToolbar
            onResetRowLayout={handleResetRowLayout}
            onFlowViewportChange={onFlowViewportChange}
          />
          <FlowDisplayToolbar
            showBackwardArrows={showBackwardArrows}
            onShowBackwardArrowsChange={setShowBackwardArrows}
          />
        </ReactFlow>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 2,
          py: 1,
          borderTop: 1,
          borderColor: 'divider',
          flexWrap: 'wrap'
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Drag empty canvas to pan (or hold Space while dragging). Scroll wheel pans when zoom is off.
          Drag steps to move. Connect via the blue dots. Click a Move line, then drag the blue handle to reposition
          the curve midpoint (forward and backward lines). Press Delete to remove a selected Move line.
        </Typography>
        <Button size="small" startIcon={<AddRoundedIcon />} onClick={onAddStep}>
          Add step
        </Button>
      </Box>
    </Box>
    </WorkflowMoveEdgeContext.Provider>
  );
}

const WorkflowStepsFlowView = (props: WorkflowStepsFlowViewProps) => (
  <ReactFlowProvider>
    <FlowCanvas {...props} />
  </ReactFlowProvider>
);

export default WorkflowStepsFlowView;
