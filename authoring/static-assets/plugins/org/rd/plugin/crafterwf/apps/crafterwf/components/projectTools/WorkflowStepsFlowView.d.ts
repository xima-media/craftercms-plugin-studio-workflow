import type { WorkflowFlowEdgeLayout, WorkflowFlowLayout, WorkflowFlowViewport, WorkflowStepDto } from '../../api/adminApi';
export declare type FlowEditorStep = WorkflowStepDto & {
    clientKey: string;
};
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
export declare function buildDefaultRowLayout(steps: FlowEditorStep[]): WorkflowFlowLayout;
export declare function defaultPosition(index: number): {
    x: number;
    y: number;
};
/** Canvas position for a newly added step without moving existing steps. */
export declare function positionForAddedStep(existingSteps: FlowEditorStep[], flowLayout: WorkflowFlowLayout): {
    x: number;
    y: number;
};
declare const WorkflowStepsFlowView: (props: WorkflowStepsFlowViewProps) => JSX.Element;
export default WorkflowStepsFlowView;
