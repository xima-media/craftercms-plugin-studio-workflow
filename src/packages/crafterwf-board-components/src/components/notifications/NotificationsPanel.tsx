import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';

import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import { useDispatch } from 'react-redux';

import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';

import useStudioItemPreview from '../../hooks/useStudioItemPreview';
import {
  archiveNotification,
  getNotificationPreferences,
  listNotifications,
  NotificationPreferences,
  notifyNotificationsUpdated,
  resolveNotification,
  saveNotificationPreferences,
  WorkflowNotification
} from '../../api/notificationApi';
import {
  canOpenNotificationTarget,
  notificationTargetLinkLabel,
  notificationTargetTypeLabel,
  openNotificationTarget
} from '../../utils/notificationNavigation';

function formatDate(value?: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

const NotificationsPanel = () => {
  const siteId = useActiveSiteId();
  const dispatch = useDispatch();
  const { previewPath, inspectPath } = useStudioItemPreview();
  const [notifications, setNotifications] = useState<WorkflowNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);

  const loadPreferences = useCallback(() => {
    if (!siteId) {
      setPreferences(null);
      return;
    }
    setPreferencesLoading(true);
    setPreferencesError(null);
    getNotificationPreferences(siteId).subscribe({
      next(response) {
        setPreferences((response.response?.result as NotificationPreferences) ?? null);
        setPreferencesLoading(false);
      },
      error(e) {
        console.error(e);
        setPreferences(null);
        setPreferencesLoading(false);
        setPreferencesError('Unable to load email settings.');
      }
    });
  }, [siteId]);

  const loadNotifications = useCallback(() => {
    if (!siteId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    setError(null);
    listNotifications(siteId, false, true, showArchived, true).subscribe({
      next(response) {
        setNotifications(response.response?.result?.notifications ?? []);
        setLoading(false);
        notifyNotificationsUpdated();
      },
      error(e) {
        console.error(e);
        setError('Unable to load notifications.');
        setNotifications([]);
        setLoading(false);
      }
    });
  }, [showArchived, siteId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleSavePreferences = () => {
    if (!siteId || !preferences) {
      return;
    }
    setPreferencesSaving(true);
    setPreferencesError(null);
    saveNotificationPreferences(siteId, {
      deliveryMode: preferences.deliveryMode,
      summaryTime: preferences.summaryTime,
      emailEnabled: preferences.emailEnabled
    }).subscribe({
      next(response) {
        setPreferences((response.response?.result as NotificationPreferences) ?? preferences);
        setPreferencesSaving(false);
      },
      error(e) {
        console.error(e);
        setPreferencesSaving(false);
        setPreferencesError('Unable to save email settings.');
      }
    });
  };

  const handleOpenTarget = (notification: WorkflowNotification) => {
    if (!canOpenNotificationTarget(notification)) {
      return;
    }
    openNotificationTarget(dispatch, siteId, notification, previewPath, inspectPath);
  };

  const handleResolve = (notificationId: string, resolved: boolean) => {
    resolveNotification(siteId, notificationId, resolved).subscribe({
      next() {
        loadNotifications();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleArchive = (notificationId: string, archived: boolean) => {
    archiveNotification(siteId, notificationId, archived).subscribe({
      next() {
        loadNotifications();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const listInitialLoading = loading && notifications.length === 0;

  return (
    <Stack spacing={1.25} sx={{ p: 2, minWidth: 0 }}>
      <Box
        sx={{
          p: 1.25,
          borderRadius: 1,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
          Email delivery
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Uses the same Crafter Studio SMTP settings as publish/review emails. Custom HTML messages for workflow tasks, mentions, and bypass alerts.
        </Typography>
        {preferencesLoading && !preferences ? (
          <CircularProgress size={20} />
        ) : preferences ? (
          <Stack spacing={1}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={preferences.emailEnabled}
                  onChange={(_, checked) =>
                    setPreferences((prev) => (prev ? { ...prev, emailEnabled: checked } : prev))
                  }
                />
              }
              label="Send email for workflow notifications"
            />
            <TextField
              select
              size="small"
              fullWidth
              label="Delivery"
              value={preferences.deliveryMode}
              disabled={!preferences.emailEnabled}
              onChange={(event) =>
                setPreferences((prev) =>
                  prev
                    ? {
                        ...prev,
                        deliveryMode: event.target.value as NotificationPreferences['deliveryMode']
                      }
                    : prev
                )
              }
            >
              <MenuItem value="immediate">Immediate</MenuItem>
              <MenuItem value="daily_summary">Daily summary (coming soon)</MenuItem>
            </TextField>
            {preferences.deliveryMode === 'daily_summary' && (
              <TextField
                size="small"
                fullWidth
                label="Summary time"
                placeholder="09:00"
                value={preferences.summaryTime ?? ''}
                disabled={!preferences.emailEnabled}
                onChange={(event) =>
                  setPreferences((prev) =>
                    prev ? { ...prev, summaryTime: event.target.value } : prev
                  )
                }
                helperText="Daily digest is not sent yet; immediate email is used until digest is implemented."
              />
            )}
            <Button
              size="small"
              variant="outlined"
              disabled={preferencesSaving}
              onClick={handleSavePreferences}
              sx={{ alignSelf: 'flex-start' }}
            >
              {preferencesSaving ? 'Saving…' : 'Save email settings'}
            </Button>
          </Stack>
        ) : null}
        {preferencesError && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.75 }}>
            {preferencesError}
          </Typography>
        )}
      </Box>

      {/* 22px on purpose: the 10px stack gap above completes the 32px the spinner has below */}
      {listInitialLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2.75, pb: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      ) : notifications.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          No notifications.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {notifications.map((notification) => {
            const typeLabel = notificationTargetTypeLabel(notification.targetType);
            const linkLabel = notificationTargetLinkLabel(notification);
            const canOpen = canOpenNotificationTarget(notification);

            return (
              <Box
                key={notification.id}
                sx={{
                  p: 1,
                  borderRadius: 1,
                  bgcolor: notification.archived ? 'action.disabledBackground' : 'action.hover',
                  opacity: notification.archived ? 0.85 : 1,
                  minWidth: 0
                }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 0.35 }}>
                  <Typography variant="body2" fontWeight={500} sx={{ flex: 1, minWidth: 0 }}>
                    {notification.title}
                  </Typography>
                  {notification.resolved && (
                    <Chip label="Resolved" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                  )}
                  {notification.archived && (
                    <Chip label="Archived" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                  )}
                </Stack>
                {notification.message && (
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 0.5 }}>
                    {notification.message}
                  </Typography>
                )}
                {typeLabel && notification.targetId && (
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{ display: 'block', mb: 0.5, wordBreak: 'break-word' }}
                  >
                    <Box component="span" color="text.secondary">
                      {typeLabel}:{' '}
                    </Box>
                    {canOpen ? (
                      <Box
                        component="button"
                        type="button"
                        title={
                          notification.targetType === 'content' ? 'Open in inspect mode' : undefined
                        }
                        onClick={() => handleOpenTarget(notification)}
                        sx={{
                          display: 'inline',
                          p: 0,
                          border: 'none',
                          background: 'none',
                          font: 'inherit',
                          fontSize: 'inherit',
                          lineHeight: 'inherit',
                          color: 'primary.main',
                          cursor: 'pointer',
                          fontWeight: 600,
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                          wordBreak: 'break-all',
                          '&:hover': { color: 'primary.dark' }
                        }}
                      >
                        {linkLabel}
                      </Box>
                    ) : (
                      <Box component="span" color="text.secondary">
                        {linkLabel}
                      </Box>
                    )}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {formatDate(notification.createdOn)}
                </Typography>
                {!notification.archived && (
                  <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      sx={{ px: 0, minWidth: 0 }}
                      onClick={() => handleResolve(notification.id, !notification.resolved)}
                    >
                      {notification.resolved ? 'Reopen' : 'Resolve'}
                    </Button>
                    <Button size="small" sx={{ px: 0, minWidth: 0 }} onClick={() => handleArchive(notification.id, true)}>
                      Archive
                    </Button>
                  </Stack>
                )}
                {notification.archived && (
                  <Button size="small" sx={{ mt: 0.75, px: 0, minWidth: 0 }} onClick={() => handleArchive(notification.id, false)}>
                    Restore
                  </Button>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {!listInitialLoading && !error && (
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start', px: 0, minWidth: 0 }}
          onClick={() => setShowArchived((prev) => !prev)}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
      )}
    </Stack>
  );
};

export default NotificationsPanel;
