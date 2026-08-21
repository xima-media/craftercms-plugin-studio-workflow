import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';
import { fetchContentTypes } from '@craftercms/studio-ui/services/contentTypes';
import { WorkflowStepDto } from '../../api/adminApi';
import {
  EditorEventListener,
  WorkflowEventListenerKind,
  defaultEventListener,
  newEventListenerClientKey
} from '../../eventListeners';
import { formatContentTypeLabel } from '../../utils/contentTypeLabel';

export interface WorkflowEventListenersSectionProps {
  steps: WorkflowStepDto[];
  createListeners: EditorEventListener[];
  editListeners: EditorEventListener[];
  onCreateListenersChange(listeners: EditorEventListener[]): void;
  onEditListenersChange(listeners: EditorEventListener[]): void;
}

type ContentTypeOption = { id: string; label: string };

const ANY_CONTENT_TYPE = '*';

function resolveContentTypeOption(
  contentType: string,
  options: ContentTypeOption[]
): ContentTypeOption {
  const byId = options.find((option) => option.id === contentType);
  if (byId) {
    return byId;
  }
  // Legacy: listener saved with display name instead of path
  const byLabel = options.find((option) => option.label === contentType);
  if (byLabel) {
    return byLabel;
  }
  return {
    id: contentType,
    label: contentType.startsWith('/') ? formatContentTypeLabel(contentType) : contentType
  };
}

const WorkflowEventListenersSection = ({
  steps,
  createListeners,
  editListeners,
  onCreateListenersChange,
  onEditListenersChange
}: WorkflowEventListenersSectionProps) => {
  const siteId = useActiveSiteId();
  const [tab, setTab] = useState<WorkflowEventListenerKind>('create');
  const [contentTypeOptions, setContentTypeOptions] = useState<ContentTypeOption[]>([]);

  const defaultStepId = steps[0]?.id || '';

  const onCreateListenersChangeRef = useRef(onCreateListenersChange);
  const onEditListenersChangeRef = useRef(onEditListenersChange);
  useEffect(() => {
    onCreateListenersChangeRef.current = onCreateListenersChange;
    onEditListenersChangeRef.current = onEditListenersChange;
  });

  useEffect(() => {
    if (!siteId) {
      return;
    }
    const subscription = fetchContentTypes(siteId).subscribe({
      next(types) {
        const mapped = (types ?? [])
          .map((type) => ({
            id: (type.id || type.name || '').trim(),
            label: (type.name || type.id || '').trim()
          }))
          .filter((type) => type.id)
          .sort((a, b) => a.label.localeCompare(b.label));
        setContentTypeOptions(mapped);
      },
      error() {
        setContentTypeOptions([]);
      }
    });
    return () => subscription.unsubscribe();
  }, [siteId]);

  // Normalize legacy listeners that stored display names (e.g. "Article") instead of paths
  useEffect(() => {
    if (!contentTypeOptions.length) {
      return;
    }
    const normalize = (listeners: EditorEventListener[], apply: (next: EditorEventListener[]) => void) => {
      let changed = false;
      const next = listeners.map((listener) => {
        if (!listener.contentType || listener.contentType.startsWith('/')) {
          return listener;
        }
        const resolved = resolveContentTypeOption(listener.contentType, contentTypeOptions);
        if (resolved.id !== listener.contentType && resolved.id.startsWith('/')) {
          changed = true;
          return { ...listener, contentType: resolved.id };
        }
        return listener;
      });
      if (changed) {
        apply(next);
      }
    };
    normalize(createListeners, onCreateListenersChangeRef.current);
    normalize(editListeners, onEditListenersChangeRef.current);
  }, [contentTypeOptions, createListeners, editListeners]);

  const stepOptions = useMemo(
    () =>
      steps
        .filter((step) => step.id)
        .map((step) => ({
          id: step.id as string,
          name: step.name?.trim() || step.id || 'Step'
        })),
    [steps]
  );

  const listeners = tab === 'create' ? createListeners : editListeners;
  const setListeners = tab === 'create' ? onCreateListenersChange : onEditListenersChange;

  const handleAdd = () => {
    setListeners([
      ...listeners,
      {
        ...defaultEventListener(defaultStepId),
        clientKey: newEventListenerClientKey()
      }
    ]);
  };

  const handleRemove = (index: number) => {
    setListeners(listeners.filter((_, i) => i !== index));
  };

  const updateListener = (index: number, patch: Partial<EditorEventListener>) => {
    setListeners(listeners.map((listener, i) => (i === index ? { ...listener, ...patch } : listener)));
  };

  return (
    <Stack spacing={1.5} sx={{ flexShrink: 0 }}>
      <Typography variant="body2" color="text.secondary">
        On matching create or edit events, attach content to a package (created when needed) and move it to the
        selected step. If no Edit listeners are configured, Create listeners also run when content is saved.
      </Typography>

      <Tabs value={tab} onChange={(_, value: WorkflowEventListenerKind) => setTab(value)}>
        <Tab value="create" label={`Create (${createListeners.length})`} />
        <Tab value="edit" label={`Edit (${editListeners.length})`} />
      </Tabs>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" startIcon={<AddRoundedIcon />} onClick={handleAdd}>
          Add listener
        </Button>
      </Box>

      <Stack spacing={1.25}>
        {listeners.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No {tab} listeners configured.
          </Typography>
        )}
        {listeners.map((listener, index) => (
          <Box
            key={listener.clientKey}
            sx={(theme) => ({
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.2fr 1.2fr 1fr 1fr auto' },
              gap: 1,
              alignItems: 'start',
              p: 1.25,
              borderRadius: 1,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper'
            })}
          >
            <Autocomplete<ContentTypeOption, false, false, false>
              size="small"
              options={[{ id: ANY_CONTENT_TYPE, label: 'Any content type' }, ...contentTypeOptions]}
              value={
                listener.contentType
                  ? resolveContentTypeOption(listener.contentType, contentTypeOptions)
                  : { id: ANY_CONTENT_TYPE, label: 'Any content type' }
              }
              onChange={(_, option) =>
                updateListener(index, {
                  contentType: option?.id === ANY_CONTENT_TYPE ? '' : option?.id || ''
                })
              }
              getOptionLabel={(option) => option.label || option.id}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Stack spacing={0}>
                    <Typography variant="body2">{option.label}</Typography>
                    {option.id !== ANY_CONTENT_TYPE && option.id !== option.label && (
                      <Typography variant="caption" color="text.secondary">
                        {option.id}
                      </Typography>
                    )}
                  </Stack>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Content type" />}
            />
            <TextField
              size="small"
              label="Path regex"
              placeholder="^/site/website/.*"
              value={listener.pathRegex}
              onChange={(e) => updateListener(index, { pathRegex: e.target.value })}
              helperText="Java regex; leave empty to match any path"
            />
            <TextField
              size="small"
              label="Package name prefix"
              required
              value={listener.packageNamePrefix}
              onChange={(e) => updateListener(index, { packageNamePrefix: e.target.value })}
              helperText="Used when creating a new package"
            />
            <FormControl size="small" required>
              <InputLabel id={`listener-step-${listener.clientKey}`}>Target step</InputLabel>
              <Select
                labelId={`listener-step-${listener.clientKey}`}
                label="Target step"
                value={listener.stepId || ''}
                onChange={(e) => updateListener(index, { stepId: e.target.value as string })}
              >
                {stepOptions.map((step) => (
                  <MenuItem key={step.id} value={step.id}>
                    {step.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton aria-label="Remove listener" onClick={() => handleRemove(index)} sx={{ mt: { xs: 0, md: 0.5 } }}>
              <DeleteOutlineRoundedIcon />
            </IconButton>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
};

export default WorkflowEventListenersSection;
