import * as React from 'react';
import { useCallback, useEffect, useState, SyntheticEvent } from 'react';

import { Box, Tab, Tabs, Typography } from '@mui/material';

import { ApiResponse, ApiResponseErrorState } from '@craftercms/studio-ui';
import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';
import { getSchemaStatus } from '../../api/adminApi';
import GeneralTab from './GeneralTab';
import WorkflowsTab from './WorkflowsTab';
import AuditLogTab from './AuditLogTab';

export interface ProjectToolsConfigurationProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  mountMode?: string;
  embedded?: boolean;
}

type ProjectToolsTab = 'workflows' | 'audit' | 'admin';

function useInlineProjectToolsShell(props: ProjectToolsConfigurationProps): boolean {
  return typeof props.onMinimize === 'function' || props.mountMode === 'page';
}

function ProjectToolsConfigurationPanel() {
  const siteId = useActiveSiteId();
  const [tab, setTab] = useState<ProjectToolsTab>('workflows');
  const [schemaReady, setSchemaReady] = useState(false);
  const [error, setError] = useState<ApiResponse>();

  useEffect(() => {
    if (!siteId) {
      return;
    }
    setError(undefined);
    const sub = getSchemaStatus(siteId).subscribe({
      next: (response) => {
        const installed = !!response.response.result?.installed;
        setSchemaReady(installed);
        if (!installed) {
          setTab('admin');
        }
      },
      error(e) {
        console.error(e);
        setError(
          e.response?.response ??
            ({ code: '?', message: 'Failed to read the workflow database status.' } as ApiResponse)
        );
      }
    });

    return () => sub.unsubscribe();
  }, [siteId]);

  const handleTabChange = (_: SyntheticEvent, value: ProjectToolsTab) => {
    setTab(value);
  };

  // The admin tab stays put once the schema is ready; it is the place for administration to grow.
  const handleSchemaReady = useCallback(() => {
    setSchemaReady(true);
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        height: '100%'
      }}
    >
      <Box sx={{ flexShrink: 0, px: 2, pt: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Crafter Workflow
        </Typography>
        <Tabs value={tab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
          <Tab label="Workflows" value="workflows" disabled={!schemaReady} />
          <Tab label="Audit Log" value="audit" disabled={!schemaReady} />
          <Tab label="Admin" value="admin" />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {error && (
          <Box sx={{ px: 2, pt: 2 }}>
            <ApiResponseErrorState error={error} />
          </Box>
        )}
        {tab === 'admin' && <GeneralTab onSchemaReady={handleSchemaReady} />}
        {tab === 'workflows' && <WorkflowsTab schemaReady={schemaReady} />}
        {tab === 'audit' && <AuditLogTab schemaReady={schemaReady} />}
      </Box>
    </Box>
  );
}

/**
 * Project Tools panel for Crafter Workflow (Workflows, Audit Log, Admin tabs).
 * Renders inline when mounted from Site Tools; legacy isolated mounts still work.
 */
export default function ProjectToolsConfiguration(props: ProjectToolsConfigurationProps) {
  const inlineShell = useInlineProjectToolsShell(props);

  if (inlineShell) {
    return <ProjectToolsConfigurationPanel />;
  }

  return (
    <Box sx={{ p: 2 }}>
      <ProjectToolsConfigurationPanel />
    </Box>
  );
}
