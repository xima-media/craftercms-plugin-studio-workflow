import { useTheme } from '@mui/material';
import { useEffect } from 'react';

const REACT_FLOW_STYLES_ID = 'crafterwf-react-flow-styles';
const REACT_FLOW_CRITICAL_ID = 'crafterwf-react-flow-critical';

function buildCriticalReactFlowCss(canvasBg: string, nodeBg: string, handleBorder: string, handleBg: string): string {
  return `
.crafterwf-workflow-flow-canvas .react-flow {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: ${canvasBg};
}
.crafterwf-workflow-flow-canvas .react-flow__container {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}
.crafterwf-workflow-flow-canvas .react-flow__background {
  pointer-events: none !important;
  z-index: 0 !important;
}
.crafterwf-workflow-flow-canvas .react-flow__pane {
  z-index: 1 !important;
  touch-action: none;
  pointer-events: all !important;
  cursor: grab;
}
.crafterwf-workflow-flow-canvas .react-flow__pane.draggable {
  cursor: grab;
}
.crafterwf-workflow-flow-canvas .react-flow__pane.dragging {
  cursor: grabbing;
}
.crafterwf-workflow-flow-canvas .react-flow__viewport {
  z-index: 2 !important;
  pointer-events: none !important;
  touch-action: none;
}
.crafterwf-workflow-flow-canvas .react-flow__renderer {
  position: relative;
  z-index: 4 !important;
  touch-action: none;
}
.crafterwf-workflow-flow-canvas .react-flow__nodes {
  pointer-events: none !important;
}
.crafterwf-workflow-flow-canvas .react-flow__node {
  pointer-events: all !important;
  cursor: grab;
  z-index: 2 !important;
}
.crafterwf-workflow-flow-canvas .react-flow__node.dragging {
  cursor: grabbing;
  z-index: 3 !important;
}
.crafterwf-workflow-flow-canvas .react-flow__node .crafterwf-workflow-step-node {
  background: ${nodeBg} !important;
  opacity: 1 !important;
}
.crafterwf-workflow-flow-canvas .react-flow__panel {
  z-index: 10 !important;
  pointer-events: all !important;
}
.crafterwf-workflow-flow-canvas .react-flow__handle {
  width: 18px !important;
  height: 18px !important;
  min-width: 18px !important;
  min-height: 18px !important;
  border-radius: 50%;
  border: 2px solid ${handleBorder} !important;
  background: ${handleBg} !important;
  z-index: 10;
  pointer-events: all !important;
  cursor: crosshair;
}
.crafterwf-workflow-flow-canvas .react-flow__handle.connectable,
.crafterwf-workflow-flow-canvas .react-flow__handle.connectionindicator,
.crafterwf-workflow-flow-canvas .react-flow__handle.connectingfrom {
  pointer-events: all !important;
  cursor: crosshair;
}
.crafterwf-workflow-flow-canvas .react-flow__edges {
  pointer-events: none !important;
  z-index: 5 !important;
}
.crafterwf-workflow-flow-canvas .react-flow__edges svg {
  pointer-events: none !important;
  overflow: visible !important;
}
.crafterwf-workflow-flow-canvas .react-flow__edges svg g.react-flow__edge {
  pointer-events: all !important;
}
.crafterwf-workflow-flow-canvas .react-flow__edge.selectable {
  cursor: pointer;
}
.crafterwf-workflow-flow-canvas .react-flow__edge-interaction {
  pointer-events: stroke !important;
  cursor: pointer;
}
.crafterwf-workflow-flow-canvas .react-flow__edge-textwrapper {
  pointer-events: all !important;
  cursor: pointer;
}
.crafterwf-workflow-flow-canvas .react-flow__edge.selected .react-flow__edge-path {
  stroke-width: 3.5px !important;
}
.crafterwf-workflow-flow-canvas .crafterwf-workflow-edge-handle {
  pointer-events: all !important;
}
.crafterwf-workflow-flow-canvas .react-flow__edge-path {
  stroke-width: 2.5px;
}
`;
}

function getReactFlowCssPath(siteId?: string | null): string {
  const base =
    '/studio/static-assets/plugins/org/rd/plugin/crafterwf/apps/crafterwf/react-flow.css';
  if (!siteId) {
    return base;
  }
  return `${base}?siteId=${encodeURIComponent(siteId)}`;
}

export function useReactFlowStyles(siteId?: string | null) {
  const theme = useTheme();

  useEffect(() => {
    const canvasBg = theme.palette.background.default;
    const nodeBg = theme.palette.background.paper;
    const handleBorder = theme.palette.background.paper;
    const handleBg = theme.palette.primary.main;

    let style = document.getElementById(REACT_FLOW_CRITICAL_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = REACT_FLOW_CRITICAL_ID;
      document.head.appendChild(style);
    }
    style.textContent = buildCriticalReactFlowCss(canvasBg, nodeBg, handleBorder, handleBg);

    const linkId = REACT_FLOW_STYLES_ID;
    const href = getReactFlowCssPath(siteId);
    const existing = document.getElementById(linkId) as HTMLLinkElement | null;
    if (existing) {
      if (existing.href !== href && !existing.href.endsWith(href.replace(/^\//, ''))) {
        existing.href = href;
      }
      return;
    }
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }, [
    siteId,
    theme.palette.mode,
    theme.palette.background.default,
    theme.palette.background.paper,
    theme.palette.primary.main
  ]);
}
