import * as React from 'react';
import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Chip, Typography, useTheme } from '@mui/material';

import { resolveStepColor } from '../../colors';
import { getStepActionLabel, hasStepAction } from '../../stepActions';
import { Position, WorkflowFlowHandle } from './workflowFlowHandle';

export interface WorkflowStepFlowNodeData extends Record<string, unknown> {
  label: string;
  color: string;
  isTerminal: boolean;
  allowAddPackage: boolean;
  selected: boolean;
  actionType?: string;
  hasRoleRules: boolean;
  hasContentRules: boolean;
}

export const WORKFLOW_STEP_NODE_WIDTH = 340;
export const WORKFLOW_STEP_NODE_HEIGHT = 140;

const WorkflowStepFlowNode = ({ data, selected }: NodeProps) => {
  const theme = useTheme();
  const stepData = data as WorkflowStepFlowNodeData;
  const stepColor = resolveStepColor(stepData.color);
  const isSelected = selected || stepData.selected;
  const actionLabel = hasStepAction(stepData.actionType) ? getStepActionLabel(stepData.actionType) : null;

  const handleStyle: React.CSSProperties = {
    width: 20,
    height: 20,
    border: `3px solid ${theme.palette.background.paper}`,
    background: theme.palette.primary.main,
    boxShadow: theme.shadows[2]
  };

  return (
    <>
      <WorkflowFlowHandle type="target" position={Position.Left} id="target" style={handleStyle} />
      <div
        className="crafterwf-workflow-step-node"
        style={{
          width: WORKFLOW_STEP_NODE_WIDTH,
          minHeight: WORKFLOW_STEP_NODE_HEIGHT,
          boxSizing: 'border-box',
          borderRadius: 12,
          border: `3px solid ${isSelected ? theme.palette.primary.main : theme.palette.divider}`,
          borderTop: `8px solid ${stepColor}`,
          background: theme.palette.background.paper,
          color: theme.palette.text.primary,
          opacity: 1,
          boxShadow: theme.shadows[3],
          padding: '16px 18px',
          cursor: 'grab',
          position: 'relative',
          zIndex: 1
        }}
      >
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.15rem', lineHeight: 1.3, pr: 1 }}>
          {stepData.label}
        </Typography>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {stepData.isTerminal ? (
            <Chip label="Terminal" size="medium" sx={{ height: 28, fontSize: '0.8rem' }} />
          ) : null}
          {stepData.allowAddPackage ? (
            <Chip label="+ Package" size="medium" sx={{ height: 28, fontSize: '0.8rem' }} />
          ) : null}
          {actionLabel ? (
            <Chip
              label={actionLabel}
              size="medium"
              color="primary"
              variant="outlined"
              sx={{ height: 28, fontSize: '0.8rem' }}
            />
          ) : null}
          {stepData.hasRoleRules ? (
            <Chip label="Role rules" size="medium" variant="outlined" sx={{ height: 28, fontSize: '0.8rem' }} />
          ) : null}
          {stepData.hasContentRules ? (
            <Chip label="Content rules" size="medium" variant="outlined" sx={{ height: 28, fontSize: '0.8rem' }} />
          ) : null}
        </div>
      </div>
      <WorkflowFlowHandle type="source" position={Position.Right} id="source" style={handleStyle} />
    </>
  );
};

export default memo(WorkflowStepFlowNode);
