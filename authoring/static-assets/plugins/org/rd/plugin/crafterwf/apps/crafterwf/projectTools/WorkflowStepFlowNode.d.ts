import * as React from 'react';
import { type NodeProps } from '@xyflow/react';
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
export declare const WORKFLOW_STEP_NODE_WIDTH = 340;
export declare const WORKFLOW_STEP_NODE_HEIGHT = 140;
declare const _default: React.MemoExoticComponent<({ data, selected }: NodeProps<import("@xyflow/react").Node<Record<string, unknown>, string>>) => JSX.Element>;
export default _default;
