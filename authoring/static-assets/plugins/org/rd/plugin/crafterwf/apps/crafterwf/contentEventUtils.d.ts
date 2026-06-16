import type { WorkflowContentEventType } from '../api/contentEventApi';
/** Map Studio socket/lifecycle hints to plugin create|edit; preview saves default to edit. */
export declare function resolveBridgeEventType(payload: {
    eventType?: string;
}): WorkflowContentEventType;
