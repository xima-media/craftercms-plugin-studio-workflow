import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Toolbar,
  Typography
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';

import { ApiResponse, ApiResponseErrorState } from '@craftercms/studio-ui';
import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';
import { saveWorkflowDefinition, getPublishingTargets, WorkflowDetail, WorkflowFlowEdgeLayout, WorkflowFlowLayout, WorkflowFlowViewport, WorkflowStepDto, DEFAULT_FLOW_VIEWPORT, normalizeFlowViewport } from '../../api/adminApi';
import {
  BOARD_BACKGROUND_SWATCHES,
  normalizeBoardBackgroundId,
  normalizeStepColorId,
  resolveBoardBackgroundColor,
  STEP_COLOR_SWATCHES
} from '../../colors';
import ColorSwatchPicker from '../ColorSwatchPicker';
import { STEP_NAME_MAX_LENGTH, WORKFLOW_NAME_MAX_LENGTH } from '../../consts';
import {
  ARCHIVE_ACTION_OPTIONS,
  isArchiveStepAction,
  normalizeStepActionType,
  PUBLISH_ACTION_OPTIONS,
  STEP_ACTION_ARCHIVE_PACKAGE,
  STEP_ACTION_NONE,
  SUCCESS_STEP_NONE,
  StepActionType,
  stepActionTypeFromLegacy
} from '../../stepActions';
import { defaultContentRule, defaultRoleRule } from '../../stepRules';
import { EditorEventListener, mapDetailListeners } from '../../eventListeners';
import WorkflowEventListenersSection from './WorkflowEventListenersSection';
import WorkflowStepRulesDialog from './WorkflowStepRulesDialog';
import WorkflowStepsFlowView, {
  buildDefaultRowLayout,
  FlowEditorStep,
  positionForAddedStep
} from './WorkflowStepsFlowView';
import {
  mapFlowEdgeLayoutToClientKeys,
  mapFlowEdgeLayoutToStepIds,
  parseFlowEdgeKey,
  flowEdgeKey,
  pruneFlowEdgeLayout
} from './workflowFlowEdges';

type EditorStep = FlowEditorStep;

export interface WorkflowEditorDialogProps {
  open: boolean;
  detail: WorkflowDetail;
  onClose(): void;
  onSaved(): void;
}

function mapFlowLayoutToClientKeys(
  layout: WorkflowFlowLayout | undefined,
  steps: EditorStep[]
): WorkflowFlowLayout {
  if (!layout) {
    return {};
  }
  const idToClientKey = new Map(steps.filter((step) => step.id).map((step) => [step.id as string, step.clientKey]));
  const mapped: WorkflowFlowLayout = {};
  Object.entries(layout).forEach(([key, position]) => {
    const clientKey = idToClientKey.get(key) ?? key;
    if (steps.some((step) => step.clientKey === clientKey)) {
      mapped[clientKey] = position;
    }
  });
  return mapped;
}

function mapFlowLayoutToStepIds(flowLayout: WorkflowFlowLayout, steps: EditorStep[]): WorkflowFlowLayout {
  const clientKeyToId = new Map(steps.filter((step) => step.id).map((step) => [step.clientKey, step.id as string]));
  const mapped: WorkflowFlowLayout = {};
  Object.entries(flowLayout).forEach(([clientKey, position]) => {
    const stepId = clientKeyToId.get(clientKey) ?? clientKey;
    mapped[stepId] = position;
  });
  return mapped;
}

function mapDetailSteps(steps: WorkflowStepDto[]): EditorStep[] {
  const mapped = (steps || []).map((step, index) => {
    const actionType = normalizeStepActionType(step.actionType);
    const resolvedAction =
      actionType !== STEP_ACTION_NONE ? actionType : stepActionTypeFromLegacy(step);
    return {
      ...step,
      clientKey: step.id || `existing-${index}`,
      color: normalizeStepColorId(step.color),
      isTerminal: !!step.isTerminal,
      allowAddPackage: step.allowAddPackage === true,
      actionType: resolvedAction
    };
  });

  mapped.forEach((step) => {
    if (step.actionSuccessStepId) {
      const target = mapped.find((candidate) => candidate.id === step.actionSuccessStepId);
      if (target) {
        step.actionSuccessStepClientKey = target.clientKey;
      }
    }
    const transitionIds = step.transitionStepIds ?? [];
    if (transitionIds.length) {
      step.transitionStepClientKeys = transitionIds
        .map((stepId) => mapped.find((candidate) => candidate.id === stepId)?.clientKey)
        .filter((clientKey): clientKey is string => !!clientKey);
    }
  });

  return mapped;
}

const WorkflowEditorDialog = ({ open, detail, onClose, onSaved }: WorkflowEditorDialogProps) => {
  const siteId = useActiveSiteId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [bypassWarningMessage, setBypassWarningMessage] = useState('');
  const [allowUiBypass, setAllowUiBypass] = useState(false);
  const [boardBackground, setBoardBackground] = useState(BOARD_BACKGROUND_SWATCHES[0].id);
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [flowLayout, setFlowLayout] = useState<WorkflowFlowLayout>({});
  const [flowEdgeLayout, setFlowEdgeLayout] = useState<WorkflowFlowEdgeLayout>({});
  const [flowViewport, setFlowViewport] = useState<WorkflowFlowViewport>(DEFAULT_FLOW_VIEWPORT);
  const [initialFlowViewport, setInitialFlowViewport] = useState<WorkflowFlowViewport | null>(null);
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [stagingEnabled, setStagingEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiResponse>();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [rulesStepIndex, setRulesStepIndex] = useState<number | null>(null);
  const [createListeners, setCreateListeners] = useState<EditorEventListener[]>([]);
  const [editListeners, setEditListeners] = useState<EditorEventListener[]>([]);
  const stepSettingsRef = useRef<HTMLDivElement>(null);

  const selectedStepIndex = useMemo(
    () => (selectedClientKey ? steps.findIndex((step) => step.clientKey === selectedClientKey) : -1),
    [selectedClientKey, steps]
  );

  useEffect(() => {
    if (open && detail) {
      setName(detail.workflow.name || '');
      setDescription(detail.workflow.description || '');
      setBypassWarningMessage(detail.workflow.bypassWarningMessage || '');
      setAllowUiBypass(detail.workflow.allowUiBypass === true);
      setBoardBackground(normalizeBoardBackgroundId(detail.workflow.backgroundUrl));
      const mappedSteps = mapDetailSteps(detail.steps || []);
      setSteps(mappedSteps);
      const loadedLayout = mapFlowLayoutToClientKeys(detail.workflow.flowLayout, mappedSteps);
      setFlowLayout({ ...buildDefaultRowLayout(mappedSteps), ...loadedLayout });
      setFlowEdgeLayout(mapFlowEdgeLayoutToClientKeys(detail.workflow.flowEdgeLayout, mappedSteps));
      const loadedViewport = normalizeFlowViewport(detail.workflow.flowViewport) ?? DEFAULT_FLOW_VIEWPORT;
      setFlowViewport(loadedViewport);
      setInitialFlowViewport(loadedViewport);
      setSelectedClientKey(mappedSteps[0]?.clientKey ?? null);
      const defaultStepId = mappedSteps[0]?.id || '';
      setCreateListeners(
        mapDetailListeners(detail.createListeners ?? detail.workflow.createListeners, defaultStepId)
      );
      setEditListeners(mapDetailListeners(detail.editListeners ?? detail.workflow.editListeners, defaultStepId));
      setError(undefined);
      setValidationError(null);
    }
  }, [open, detail]);

  useEffect(() => {
    if (!open || !siteId) {
      return;
    }
    getPublishingTargets(siteId).subscribe({
      next(response) {
        setStagingEnabled(!!response.response?.result?.stagingEnabled);
      },
      error() {
        setStagingEnabled(false);
      }
    });
  }, [open, siteId]);

  const handleSelectStep = (clientKey: string) => {
    setSelectedClientKey(clientKey);
    window.requestAnimationFrame(() => {
      stepSettingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleFlowLayoutChange = (layout: WorkflowFlowLayout) => {
    setFlowLayout(layout);
  };

  const handleFlowViewportChange = (viewport: WorkflowFlowViewport) => {
    setFlowViewport(viewport);
  };

  const handleFlowEdgeLayoutChange = (layout: WorkflowFlowEdgeLayout) => {
    setFlowEdgeLayout(layout);
  };

  const handleTransitionChange = (sourceClientKey: string, targetClientKeys: string[]) => {
    setSteps((current) =>
      current.map((step) =>
        step.clientKey === sourceClientKey ? { ...step, transitionStepClientKeys: targetClientKeys } : step
      )
    );
    setFlowEdgeLayout((current) => {
      const allowed = new Set(
        targetClientKeys.map((targetKey) => flowEdgeKey(sourceClientKey, targetKey))
      );
      const next: WorkflowFlowEdgeLayout = {};
      Object.entries(current).forEach(([key, value]) => {
        const parsed = parseFlowEdgeKey(key);
        if (!parsed) {
          return;
        }
        if (parsed.sourceKey === sourceClientKey && !allowed.has(key)) {
          return;
        }
        next[key] = value;
      });
      return next;
    });
  };

  const handleAddStep = () => {
    const clientKey = `new-${Date.now()}-${Math.random()}`;
    setFlowLayout((current) => ({
      ...current,
      [clientKey]: positionForAddedStep(steps, current)
    }));
    setSteps([
      ...steps,
      {
        clientKey,
        name: 'New Step',
        color: STEP_COLOR_SWATCHES[0].id,
        isTerminal: false,
        allowAddPackage: false,
        actionType: STEP_ACTION_NONE
      }
    ]);
    handleSelectStep(clientKey);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) {
      setValidationError('A workflow must have at least one step.');
      return;
    }
    setValidationError(null);
    const removedKey = steps[index].clientKey;
    const nextSteps = steps
      .filter((_, i) => i !== index)
      .map((step) => ({
        ...step,
        ...(step.actionSuccessStepClientKey === removedKey
          ? { actionSuccessStepClientKey: undefined, actionSuccessStepId: undefined }
          : {}),
        transitionStepClientKeys: (step.transitionStepClientKeys ?? []).filter((key) => key !== removedKey)
      }));
    setFlowLayout((current) => {
      const next = { ...current };
      delete next[removedKey];
      return next;
    });
    setFlowEdgeLayout((current) => pruneFlowEdgeLayout(current, removedKey));
    setSteps(nextSteps);
    if (selectedClientKey === removedKey) {
      setSelectedClientKey(nextSteps[Math.min(index, nextSteps.length - 1)]?.clientKey ?? null);
    }
  };

  const updateStep = (index: number, patch: Partial<WorkflowStepDto>) => {
    setSteps(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  const handleActionTypeChange = (index: number, actionType: StepActionType) => {
    const patch: Partial<EditorStep> = { actionType };
    if (actionType === STEP_ACTION_NONE) {
      patch.actionSuccessStepClientKey = undefined;
      patch.actionSuccessStepId = undefined;
    } else if (actionType === STEP_ACTION_ARCHIVE_PACKAGE) {
      patch.actionSuccessStepClientKey = undefined;
      patch.actionSuccessStepId = undefined;
    } else {
      const current = steps[index];
      if (!current.actionSuccessStepClientKey && !current.actionSuccessStepId) {
        const nextStep = steps[index + 1];
        if (nextStep) {
          patch.actionSuccessStepClientKey = nextStep.clientKey;
        }
      }
    }
    updateStep(index, patch);
  };

  const handleSave = () => {
    if (!name.trim()) {
      setValidationError('Workflow name is required.');
      return;
    }
    if (steps.some((step) => !step.name?.trim())) {
      setValidationError('Every step needs a name.');
      return;
    }
    if (steps.some((step) => (step.name?.trim().length ?? 0) > STEP_NAME_MAX_LENGTH)) {
      setValidationError(`Step names must be ${STEP_NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (!siteId) {
      setValidationError('No active site selected.');
      return;
    }
    const invalidListener = [...createListeners, ...editListeners].find(
      (listener) => !listener.packageNamePrefix?.trim() || !listener.stepId
    );
    if (invalidListener) {
      setValidationError('Every event listener needs a package name prefix and target step.');
      return;
    }

    setValidationError(null);
    setSaving(true);
    setError(undefined);
    saveWorkflowDefinition(siteId, detail.workflow.id, {
      workflow: {
        ...detail.workflow,
        name: name.trim(),
        description: description.trim(),
        backgroundUrl: boardBackground,
        bypassWarningMessage: bypassWarningMessage.trim(),
        allowUiBypass,
        flowLayout: mapFlowLayoutToStepIds(flowLayout, steps),
        flowEdgeLayout: mapFlowEdgeLayoutToStepIds(flowEdgeLayout, steps),
        flowViewport
      },
      createListeners: createListeners.map((listener) => ({
        id: listener.id,
        contentType: listener.contentType?.trim() || '',
        pathRegex: listener.pathRegex?.trim() || '',
        packageNamePrefix: listener.packageNamePrefix.trim(),
        stepId: listener.stepId
      })),
      editListeners: editListeners.map((listener) => ({
        id: listener.id,
        contentType: listener.contentType?.trim() || '',
        pathRegex: listener.pathRegex?.trim() || '',
        packageNamePrefix: listener.packageNamePrefix.trim(),
        stepId: listener.stepId
      })),
      steps: steps.map((step, index) => ({
        id: step.id,
        clientKey: step.clientKey,
        name: step.name.trim(),
        color: normalizeStepColorId(step.color),
        isTerminal: !!step.isTerminal,
        allowAddPackage: !!step.allowAddPackage,
        actionType:
          !step.actionType || step.actionType === STEP_ACTION_NONE ? STEP_ACTION_NONE : step.actionType,
        actionSuccessStepId: step.actionSuccessStepId,
        actionSuccessStepClientKey: step.actionSuccessStepClientKey,
        transitionStepClientKeys: step.transitionStepClientKeys ?? [],
        roleRule: step.roleRule,
        contentRule: step.contentRule,
        position: (index + 1) * 1000
      }))
    }).subscribe({
      next: () => {
        setSaving(false);
        onSaved();
      },
      error(e) {
        console.error(e);
        setSaving(false);
        setError(
          e.response?.response ?? ({ code: '?', message: 'Unable to save workflow.' } as ApiResponse)
        );
      }
    });
  };

  const selectedStep = selectedStepIndex >= 0 ? steps[selectedStepIndex] : null;

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      scroll="paper"
      PaperProps={{ sx: { display: 'flex', flexDirection: 'column' } }}
    >
      <AppBar sx={{ position: 'sticky', top: 0, zIndex: (theme) => theme.zIndex.appBar + 1 }} color="default" elevation={1}>
        <Toolbar>
          <IconButton edge="start" aria-label="Close workflow editor" onClick={onClose} disabled={saving}>
            <CloseRoundedIcon />
          </IconButton>
          <Typography sx={{ flex: 1, ml: 1 }} variant="h6" component="div" noWrap>
            Edit workflow — {name.trim() || 'Untitled'}
          </Typography>
          <Button onClick={onClose} disabled={saving} sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save workflow'}
          </Button>
        </Toolbar>
      </AppBar>

      <DialogContent sx={{ flex: 1, p: 0, overflow: 'auto' }}>
        <Box
          sx={{
            px: 3,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider'
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <TextField
              label="Workflow name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              size="small"
              inputProps={{ maxLength: WORKFLOW_NAME_MAX_LENGTH }}
              sx={{ width: { xs: '100%', md: 280 } }}
            />
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                Board background
              </Typography>
              <ColorSwatchPicker
                swatches={BOARD_BACKGROUND_SWATCHES}
                value={boardBackground}
                onChange={setBoardBackground}
                resolveColor={resolveBoardBackgroundColor}
                size={24}
              />
            </Stack>
          </Stack>
        </Box>

        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Workflow flow
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Drag steps to move them. Use the toolbar to zoom. Connect steps with the blue dots on each card.
          </Typography>
          <WorkflowStepsFlowView
            steps={steps}
            flowLayout={flowLayout}
            flowEdgeLayout={flowEdgeLayout}
            initialFlowViewport={initialFlowViewport}
            selectedClientKey={selectedClientKey}
            onSelectStep={handleSelectStep}
            onFlowLayoutChange={handleFlowLayoutChange}
            onFlowEdgeLayoutChange={handleFlowEdgeLayoutChange}
            onFlowViewportChange={handleFlowViewportChange}
            onTransitionChange={handleTransitionChange}
            onAddStep={handleAddStep}
          />
        </Box>

        <Box sx={{ px: 3, py: 2, pb: 4 }}>
          <Stack spacing={2}>
              {validationError && (
                <Alert severity="warning" onClose={() => setValidationError(null)}>
                  {validationError}
                </Alert>
              )}
              {error && <ApiResponseErrorState error={error} />}

              <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Workflow details &amp; guard settings
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <TextField
                      label="Description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox checked={allowUiBypass} onChange={(e) => setAllowUiBypass(e.target.checked)} />
                      }
                      label="Allow publish/reject bypass with acknowledgement"
                    />
                    <TextField
                      label="Workflow guard message"
                      value={bypassWarningMessage}
                      onChange={(e) => setBypassWarningMessage(e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                      helperText="Optional message when publish/reject is blocked or bypass acknowledgement is required."
                    />
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {selectedStep && selectedStepIndex >= 0 ? (
                <Box
                  ref={stepSettingsRef}
                  sx={{
                    border: 2,
                    borderColor: 'primary.main',
                    borderRadius: 1.5,
                    bgcolor: 'background.paper',
                    p: 2
                  }}
                >
                  <Stack spacing={2}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Step settings — {selectedStep.name?.trim() || 'Untitled step'}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<RuleRoundedIcon />}
                          onClick={() => setRulesStepIndex(selectedStepIndex)}
                        >
                          Rules
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<DeleteOutlineRoundedIcon />}
                          onClick={() => handleRemoveStep(selectedStepIndex)}
                        >
                          Remove step
                        </Button>
                      </Stack>
                    </Stack>

                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={2}
                      alignItems={{ sm: 'flex-start' }}
                      flexWrap="wrap"
                    >
                      <TextField
                        label="Step name"
                        value={selectedStep.name}
                        onChange={(e) => updateStep(selectedStepIndex, { name: e.target.value })}
                        size="small"
                        inputProps={{ maxLength: STEP_NAME_MAX_LENGTH }}
                        sx={{ width: { xs: '100%', sm: 260 } }}
                      />
                      <ColorSwatchPicker
                        label="Color"
                        swatches={STEP_COLOR_SWATCHES}
                        value={normalizeStepColorId(selectedStep.color)}
                        onChange={(color) => updateStep(selectedStepIndex, { color })}
                        size={22}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={!!selectedStep.isTerminal}
                            onChange={(e) => updateStep(selectedStepIndex, { isTerminal: e.target.checked })}
                          />
                        }
                        label="Terminal"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={!!selectedStep.allowAddPackage}
                            onChange={(e) => updateStep(selectedStepIndex, { allowAddPackage: e.target.checked })}
                          />
                        }
                        label="Allow add package"
                      />
                    </Stack>

                    <RadioGroup
                      value={selectedStep.actionType || STEP_ACTION_NONE}
                      onChange={(event) =>
                        handleActionTypeChange(selectedStepIndex, event.target.value as StepActionType)
                      }
                    >
                      <FormControlLabel
                        value={STEP_ACTION_NONE}
                        control={<Radio size="small" />}
                        label="No Action"
                      />
                      <FormControl component="fieldset" variant="standard" sx={{ mt: 0.5 }}>
                        <FormLabel component="legend" sx={{ typography: 'caption', color: 'text.secondary' }}>
                          Publish action (arrow to next step on success)
                        </FormLabel>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pl: 0.5, pt: 0.25 }}>
                          {PUBLISH_ACTION_OPTIONS.map((option) => (
                            <FormControlLabel
                              key={option.value}
                              value={option.value}
                              control={<Radio size="small" />}
                              label={option.label}
                              disabled={option.requiresStaging && !stagingEnabled}
                              sx={{ mr: 1.5 }}
                            />
                          ))}
                        </Box>
                      </FormControl>
                      <FormControl component="fieldset" variant="standard" sx={{ mt: 1 }}>
                        <FormLabel component="legend" sx={{ typography: 'caption', color: 'text.secondary' }}>
                          Other automated actions
                        </FormLabel>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pl: 0.5, pt: 0.25 }}>
                          {ARCHIVE_ACTION_OPTIONS.map((option) => (
                            <FormControlLabel
                              key={option.value}
                              value={option.value}
                              control={<Radio size="small" />}
                              label={option.label}
                              sx={{ mr: 1.5 }}
                            />
                          ))}
                        </Box>
                      </FormControl>
                    </RadioGroup>

                    {isArchiveStepAction(selectedStep.actionType) ? (
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
                        Archiving removes the package from the board. It is no longer in the workflow — no success
                        step is used.
                      </Typography>
                    ) : (
                      <FormControl
                        size="small"
                        sx={{ maxWidth: 360 }}
                        disabled={
                          !selectedStep.actionType || selectedStep.actionType === STEP_ACTION_NONE
                        }
                      >
                        <InputLabel id={`success-step-label-${selectedStep.clientKey}`}>Step on success</InputLabel>
                        <Select
                          labelId={`success-step-label-${selectedStep.clientKey}`}
                          label="Step on success"
                          value={
                            selectedStep.actionSuccessStepClientKey ||
                            selectedStep.actionSuccessStepId ||
                            SUCCESS_STEP_NONE
                          }
                          onChange={(event) => {
                            const value = event.target.value as string;
                            if (value === SUCCESS_STEP_NONE) {
                              updateStep(selectedStepIndex, {
                                actionSuccessStepClientKey: undefined,
                                actionSuccessStepId: undefined
                              });
                            } else {
                              updateStep(selectedStepIndex, {
                                actionSuccessStepClientKey: value,
                                actionSuccessStepId: undefined
                              });
                            }
                          }}
                        >
                          <MenuItem value={SUCCESS_STEP_NONE}>None — stay on current step</MenuItem>
                          {steps
                            .filter((candidate) => candidate.clientKey !== selectedStep.clientKey)
                            .map((candidate) => (
                              <MenuItem key={candidate.clientKey} value={candidate.clientKey}>
                                {candidate.name?.trim() || 'Untitled step'}
                              </MenuItem>
                            ))}
                        </Select>
                      </FormControl>
                    )}
                  </Stack>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Click a step in the flow canvas above to edit its settings.
                </Typography>
              )}

              <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Content event listeners
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <WorkflowEventListenersSection
                    steps={steps}
                    createListeners={createListeners}
                    editListeners={editListeners}
                    onCreateListenersChange={setCreateListeners}
                    onEditListenersChange={setEditListeners}
                  />
                </AccordionDetails>
              </Accordion>
          </Stack>
        </Box>
      </DialogContent>

      {rulesStepIndex != null && steps[rulesStepIndex] && (
        <WorkflowStepRulesDialog
          open
          stepName={steps[rulesStepIndex].name?.trim() || 'Step'}
          roleRule={steps[rulesStepIndex].roleRule ?? defaultRoleRule()}
          contentRule={steps[rulesStepIndex].contentRule ?? defaultContentRule()}
          onClose={() => setRulesStepIndex(null)}
          onSave={(roleRule, contentRule) => {
            updateStep(rulesStepIndex, { roleRule, contentRule });
            setRulesStepIndex(null);
          }}
        />
      )}
    </Dialog>
  );
};

export default WorkflowEditorDialog;
