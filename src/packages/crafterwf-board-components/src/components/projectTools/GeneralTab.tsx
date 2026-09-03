import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

import { ApiResponse, ApiResponseErrorState } from '@craftercms/studio-ui';
import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';
import { getSchemaStatus, SchemaStatus } from '../../api/adminApi';
import SchemaInstallDialog from './SchemaInstallDialog';

export interface GeneralTabProps {
  onSchemaReady?: () => void;
}

const GeneralTab = ({ onSchemaReady }: GeneralTabProps) => {
  const siteId = useActiveSiteId();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SchemaStatus | null>(null);
  const [error, setError] = useState<ApiResponse>();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const onSchemaReadyRef = useRef(onSchemaReady);
  onSchemaReadyRef.current = onSchemaReady;

  const refreshStatus = useCallback(() => {
    if (!siteId) {
      return;
    }
    setLoading(true);
    setError(undefined);
    getSchemaStatus(siteId).subscribe({
      next: (response) => {
        const result = response.response.result as SchemaStatus;
        setStatus(result);
        setLoading(false);
        if (result.installed) {
          onSchemaReadyRef.current?.();
        }
      },
      error(e) {
        console.error(e);
        setLoading(false);
        setStatus(null);
        setError(
          e.response?.response ??
            ({ code: '?', message: 'Failed to read the workflow database status.' } as ApiResponse)
        );
      }
    });
  }, [siteId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleInstalled = (result: SchemaStatus) => {
    setStatus(result);
    onSchemaReadyRef.current?.();
  };

  const handleDialogClose = () => {
    setInstallDialogOpen(false);
    refreshStatus();
  };

  return (
    <Box sx={{ p: 2, maxWidth: 720 }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
        <Typography variant="body1" component="span">
          Workflow Database:
        </Typography>

        {loading && <CircularProgress size={18} />}

        {!loading && status?.installed && (
          <>
            <CheckCircleRoundedIcon color="success" fontSize="small" aria-hidden />
            <Typography variant="body1" component="span" color="success.main" fontWeight={500}>
              Installed
            </Typography>
          </>
        )}

        {!loading && status && !status.installed && (
          <Button variant="contained" size="small" onClick={() => setInstallDialogOpen(true)}>
            Install
          </Button>
        )}

        {/* Without a status the install button is the bootstrap path, but never after a failed read:
            the dialog starts the installation right away, with nothing known about the schema. */}
        {!loading && !status && !error && siteId && (
          <Button variant="contained" size="small" onClick={() => setInstallDialogOpen(true)}>
            Install
          </Button>
        )}
      </Stack>

      {error && (
        <Box sx={{ mt: 2 }}>
          <ApiResponseErrorState error={error} />
        </Box>
      )}

      {siteId && (
        <SchemaInstallDialog
          open={installDialogOpen}
          siteId={siteId}
          onClose={handleDialogClose}
          onInstalled={handleInstalled}
        />
      )}
    </Box>
  );
};

export default GeneralTab;
