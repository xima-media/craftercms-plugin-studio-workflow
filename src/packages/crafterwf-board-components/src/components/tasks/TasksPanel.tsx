import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import SendRoundedIcon from '@mui/icons-material/SendRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';
import { fetchAll as fetchAllUsers, me } from '@craftercms/studio-ui/services/users';
import { useDispatch } from 'react-redux';

import {
  archiveTask,
  completeTask,
  createTask,
  extractTaskListResult,
  listAllTasks,
  notifyTasksUpdated,
  openWorkflowPackage,
  TASK_TARGET,
  TaskPriority,
  updateTask,
  WorkflowTask
} from '../../api/taskApi';
import {
  AssigneeMenuItem,
  findAssigneeOption,
  resolveAssigneeLabel,
  TaskAssigneeOption,
  UserAvatarLabel,
  userLabel
} from '../users/studioUserDisplay';
import { organizeTasksByAssignee, TaskSortMode } from '../../utils/taskListOrganization';
import { formatDateTime, toDateTimeInputValue } from '../../utils/dateTimeFormatting';

export type { TaskAssigneeOption };

function dateTimeInputToApiValue(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00`;
  }
  return trimmed;
}

// Viewport breakpoints never fire inside the narrow ICE panel, so the fields wrap on container width instead.
const taskFieldRowSx = {
  display: 'grid',
  // min() caps the track floor at the container width, otherwise the fields overflow the narrowest panel.
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
  gap: 1
} as const;

const TasksPanel = () => {
  const siteId = useActiveSiteId();
  const dispatch = useDispatch();
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newDueOn, setNewDueOn] = useState('');
  const [newStartOn, setNewStartOn] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<TaskAssigneeOption[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [editingDueTaskId, setEditingDueTaskId] = useState<string | null>(null);
  const [editingStartTaskId, setEditingStartTaskId] = useState<string | null>(null);
  const [editingTitleTaskId, setEditingTitleTaskId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [sortBy, setSortBy] = useState<TaskSortMode>('due');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const assigneeById = useMemo(() => {
    const map = new Map<number, TaskAssigneeOption>();
    assigneeOptions.forEach((option) => map.set(option.id, option));
    return map;
  }, [assigneeOptions]);

  const loadAssignees = useCallback(() => {
    setAssigneesLoading(true);
    me().subscribe({
      next(currentUser) {
        if (currentUser?.id != null) {
          setCurrentUserId(currentUser.id);
        }
        fetchAllUsers({ limit: 500, offset: 0 }).subscribe({
          next(users) {
            const enabled = (users ?? []).filter((user) => user.enabled !== false);
            const options = enabled.map((user) => ({
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              label: userLabel(user)
            }));
            setAssigneeOptions(options);
            if (currentUser?.id != null) {
              setNewAssigneeId(currentUser.id);
            } else if (options.length > 0) {
              setNewAssigneeId(options[0].id);
            }
            setAssigneesLoading(false);
          },
          error(e) {
            console.error(e);
            if (currentUser?.id != null) {
              const fallback = {
                id: currentUser.id,
                username: currentUser.username,
                firstName: currentUser.firstName,
                lastName: currentUser.lastName,
                label: userLabel(currentUser)
              };
              setAssigneeOptions([fallback]);
              setNewAssigneeId(currentUser.id);
            }
            setAssigneesLoading(false);
          }
        });
      },
      error(e) {
        console.error(e);
        setAssigneesLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    loadAssignees();
  }, [loadAssignees]);

  const loadTasks = useCallback(() => {
    if (!siteId) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError(null);
    listAllTasks(siteId, true, showArchived).subscribe({
      next(response) {
        setTasks(extractTaskListResult(response));
        setLoading(false);
      },
      error(e) {
        console.error(e);
        setError('Unable to load tasks.');
        setTasks([]);
        setLoading(false);
      }
    });
  }, [showArchived, siteId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const selectedNewAssignee = typeof newAssigneeId === 'number' ? assigneeById.get(newAssigneeId) : undefined;

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title || !siteId || creating || typeof newAssigneeId !== 'number') {
      return;
    }
    setCreating(true);
    createTask(
      siteId,
      title,
      newPriority,
      dateTimeInputToApiValue(newDueOn) || undefined,
      undefined,
      undefined,
      newAssigneeId,
      selectedNewAssignee?.username,
      dateTimeInputToApiValue(newStartOn) || undefined
    ).subscribe({
      next() {
        setNewTitle('');
        setNewDueOn('');
        setNewStartOn('');
        setNewPriority('medium');
        setCreating(false);
        setShowAddForm(false);
        loadTasks();
        notifyTasksUpdated();
      },
      error(e) {
        console.error(e);
        setCreating(false);
      }
    });
  };

  const handleAssigneeChange = (task: WorkflowTask, assigneeId: number) => {
    const assignee = assigneeById.get(assigneeId);
    updateTask(siteId, task.id, {
      assigneeId,
      assigneeUsername: assignee?.username ?? task.assigneeUsername
    }).subscribe({
      next() {
        loadTasks();
        notifyTasksUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handlePriorityChange = (task: WorkflowTask, priority: TaskPriority) => {
    updateTask(siteId, task.id, { priority }).subscribe({
      next() {
        loadTasks();
        notifyTasksUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleDueDateChange = (task: WorkflowTask, dueOn: string | null) => {
    updateTask(siteId, task.id, { dueOn: dateTimeInputToApiValue(dueOn) }).subscribe({
      next() {
        setEditingDueTaskId(null);
        loadTasks();
        notifyTasksUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleStartDateChange = (task: WorkflowTask, startOn: string | null) => {
    updateTask(siteId, task.id, { startOn: dateTimeInputToApiValue(startOn) }).subscribe({
      next() {
        setEditingStartTaskId(null);
        loadTasks();
        notifyTasksUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const startTitleEdit = (task: WorkflowTask) => {
    setEditingTitleTaskId(task.id);
    setTitleDraft(task.title);
  };

  const cancelTitleEdit = () => {
    setEditingTitleTaskId(null);
    setTitleDraft('');
  };

  const saveTitleEdit = (task: WorkflowTask) => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      cancelTitleEdit();
      return;
    }
    if (trimmed === task.title) {
      cancelTitleEdit();
      return;
    }
    updateTask(siteId, task.id, { title: trimmed }).subscribe({
      next() {
        cancelTitleEdit();
        loadTasks();
        notifyTasksUpdated();
      },
      error(e) {
        console.error(e);
        cancelTitleEdit();
      }
    });
  };

  const handleComplete = (taskId: string, complete: boolean) => {
    completeTask(siteId, taskId, complete).subscribe({
      next() {
        loadTasks();
        notifyTasksUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleArchive = (taskId: string, archived: boolean) => {
    archiveTask(siteId, taskId, archived).subscribe({
      next() {
        loadTasks();
        notifyTasksUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleCreateKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleCreate();
    }
  };

  const resolveAssigneeLabelForTask = (task: WorkflowTask): string =>
    resolveAssigneeLabel(task.assigneeId, task.assigneeUsername, assigneeOptions);

  const groupedTasks = useMemo(
    () =>
      organizeTasksByAssignee(tasks, sortBy, currentUserId, (group) =>
        resolveAssigneeLabel(group.assigneeId, group.assigneeUsername, assigneeOptions)
      ),
    [tasks, sortBy, currentUserId, assigneeOptions]
  );

  const listInitialLoading =
    (loading && tasks.length === 0) || (assigneesLoading && assigneeOptions.length === 0);

  const showSortControl = !listInitialLoading && !error && tasks.length > 0;
  const showActionRow = !listInitialLoading && !error && (!showAddForm || showSortControl);

  return (
    <Stack spacing={1.5} sx={{ p: 2, minWidth: 0, width: '100%', height: '100%', minHeight: 0 }}>
      {showActionRow && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ flexShrink: 0 }}>
          {/* Placeholder keeps the sort control on the right edge while the add form replaces the button */}
          {showAddForm ? (
            <Box />
          ) : (
            <Button size="small" sx={{ px: 0, minWidth: 0 }} onClick={() => setShowAddForm(true)}>
              Add task
            </Button>
          )}
          {showSortControl && (
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="tasks-sort-label">Sort by</InputLabel>
              <Select
                labelId="tasks-sort-label"
                label="Sort by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as TaskSortMode)}
              >
                <MenuItem value="due">Due date</MenuItem>
                <MenuItem value="priority">Priority</MenuItem>
              </Select>
            </FormControl>
          )}
        </Stack>
      )}

      {listInitialLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, pb: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!listInitialLoading && error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      {!listInitialLoading && !error && showAddForm && (
      <Box
        sx={{
          px: 1,
          py: 1.25,
          borderRadius: 1,
          bgcolor: 'action.hover',
          minWidth: 0
        }}
      >
        <Stack spacing={1.25}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="New task..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            disabled={creating}
          />

          <Box sx={taskFieldRowSx}>
            <FormControl size="small" fullWidth>
              <InputLabel id="task-priority-label">Priority</InputLabel>
              <Select
                labelId="task-priority-label"
                label="Priority"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
              >
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="task-assignee-label">Assignee</InputLabel>
              <Select
                labelId="task-assignee-label"
                label="Assignee"
                value={newAssigneeId === '' ? '' : newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value as number)}
                disabled={assigneeOptions.length === 0}
                renderValue={(value) => {
                  const option = assigneeById.get(value as number);
                  if (!option) {
                    return '';
                  }
                  return <UserAvatarLabel user={option} label={option.label} size={20} typographyVariant="body2" />;
                }}
              >
                {assigneeOptions.map((option) => (
                  <AssigneeMenuItem key={option.id} option={option} />
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={taskFieldRowSx}>
            <TextField
              size="small"
              type="datetime-local"
              label="Start date & time"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={newStartOn}
              onChange={(e) => setNewStartOn(e.target.value)}
            />
            <TextField
              size="small"
              type="datetime-local"
              label="Due date & time"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={newDueOn}
              onChange={(e) => setNewDueOn(e.target.value)}
            />
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
            <IconButton
              aria-label="Create task"
              color="primary"
              onClick={handleCreate}
              disabled={!newTitle.trim() || creating || typeof newAssigneeId !== 'number'}
              sx={{ flexShrink: 0 }}
            >
              <SendRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Button
            size="small"
            sx={{ alignSelf: 'flex-start', px: 0, minWidth: 0 }}
            onClick={() => {
              setNewTitle('');
              setNewDueOn('');
              setNewStartOn('');
              setNewPriority('medium');
              setShowAddForm(false);
            }}
          >
            Cancel
          </Button>
        </Stack>
      </Box>
      )}

      {!listInitialLoading && !error && (
        tasks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          No tasks.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {groupedTasks.map((group) => {
            const assigneeOption = findAssigneeOption(
              assigneeOptions,
              group.assigneeId,
              group.assigneeUsername
            );
            const groupUser = assigneeOption ?? {
              id: group.assigneeId,
              username: group.assigneeUsername ?? `user-${group.assigneeId}`,
              firstName: undefined,
              lastName: undefined,
              label: resolveAssigneeLabel(group.assigneeId, group.assigneeUsername, assigneeOptions)
            };
            const groupTitle =
              currentUserId != null && group.assigneeId === currentUserId
                ? 'My tasks'
                : groupUser.label;
            return (
              <Stack key={group.assigneeId} spacing={0.75}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <UserAvatarLabel user={groupUser} label={groupTitle} size={28} typographyVariant="subtitle2" fontWeight={600} />
                  <Chip label={group.tasks.length} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                </Stack>
                <Stack spacing={1}>
                  {group.tasks.map((task) => (
            <Box
              key={task.id}
              sx={{
                p: 1.25,
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
                bgcolor: task.archived ? 'action.disabledBackground' : 'background.paper',
                opacity: task.archived ? 0.85 : 1,
                minWidth: 0
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                  <Checkbox
                    size="small"
                    checked={task.complete}
                    disabled={task.archived}
                    onChange={(e) => handleComplete(task.id, e.target.checked)}
                    sx={{ p: 0, mt: 0.15, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ mb: 0.75 }}>
                      {editingTitleTaskId === task.id ? (
                        <TextField
                          size="small"
                          fullWidth
                          autoFocus
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onBlur={() => saveTitleEdit(task)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveTitleEdit(task);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelTitleEdit();
                            }
                          }}
                          sx={{ flex: 1, minWidth: 0 }}
                        />
                      ) : (
                        <Box
                          role="button"
                          tabIndex={task.archived ? -1 : 0}
                          onClick={() => !task.archived && startTitleEdit(task)}
                          onKeyDown={(e) => {
                            if (!task.archived && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              startTitleEdit(task);
                            }
                          }}
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 0.5,
                            cursor: task.archived ? 'default' : 'pointer',
                            borderRadius: 0.5,
                            '&:hover .task-title-edit-icon': {
                              opacity: task.archived ? 0 : 1
                            },
                            '&:hover .task-title-text': task.archived
                              ? undefined
                              : {
                                  textDecoration: task.complete ? 'line-through underline' : 'underline',
                                  textUnderlineOffset: 2
                                }
                          }}
                        >
                          <Typography
                            className="task-title-text"
                            variant="body2"
                            fontWeight={600}
                            sx={{
                              flex: 1,
                              minWidth: 0,
                              wordBreak: 'break-word',
                              textDecoration: task.complete ? 'line-through' : 'none',
                              color: task.complete ? 'text.secondary' : 'text.primary'
                            }}
                          >
                            {task.title}
                          </Typography>
                          {!task.archived && (
                            <EditRoundedIcon
                              className="task-title-edit-icon"
                              sx={{
                                fontSize: 14,
                                opacity: 0,
                                transition: 'opacity 0.15s ease',
                                mt: 0.2,
                                flexShrink: 0,
                                color: 'text.secondary'
                              }}
                            />
                          )}
                        </Box>
                      )}
                      {task.archived && (
                        <Chip label="Archived" size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem', flexShrink: 0 }} />
                      )}
                    </Stack>

                    {task.targetType === TASK_TARGET.WORKFLOW_PACKAGE && task.targetId && (
                      <Typography
                        variant="caption"
                        component="div"
                        sx={{ display: 'block', mb: 0.35, wordBreak: 'break-word' }}
                      >
                        <Box component="span" color="text.secondary">
                          Workflow Package:{' '}
                        </Box>
                        <Box
                          component="button"
                          type="button"
                          onClick={() => {
                            if (task.targetWorkflowId) {
                              openWorkflowPackage(dispatch, task.targetWorkflowId, task.targetId!);
                            }
                          }}
                          disabled={!task.targetWorkflowId}
                          sx={{
                            display: 'inline',
                            p: 0,
                            border: 'none',
                            background: 'none',
                            font: 'inherit',
                            fontSize: 'inherit',
                            lineHeight: 'inherit',
                            color: task.targetWorkflowId ? 'primary.main' : 'text.secondary',
                            cursor: task.targetWorkflowId ? 'pointer' : 'default',
                            fontWeight: 600,
                            textDecoration: task.targetWorkflowId ? 'underline' : 'none',
                            textUnderlineOffset: 2,
                            '&:hover': task.targetWorkflowId ? { color: 'primary.dark' } : undefined
                          }}
                        >
                          {task.targetTitle || 'Untitled package'}
                        </Box>
                      </Typography>
                    )}

                    <Stack spacing={0.35} sx={{ mb: 0.75 }}>
                      <Typography variant="caption" color="text.secondary">
                        Created {formatDateTime(task.createdOn)}
                      </Typography>

                      {editingStartTaskId === task.id ? (
                        <TextField
                          size="small"
                          type="datetime-local"
                          autoFocus
                          disabled={task.archived}
                          value={toDateTimeInputValue(task.startOn)}
                          onChange={(e) => handleStartDateChange(task, e.target.value || null)}
                          onBlur={() => setEditingStartTaskId(null)}
                          InputLabelProps={{ shrink: true }}
                          sx={{ maxWidth: 240, '& .MuiInputBase-input': { fontWeight: 700, py: 0.5 } }}
                        />
                      ) : (
                        <Typography
                          variant="caption"
                          component="button"
                          type="button"
                          disabled={task.archived}
                          onClick={() => !task.archived && setEditingStartTaskId(task.id)}
                          sx={{
                            fontWeight: 700,
                            border: 0,
                            bgcolor: 'transparent',
                            p: 0,
                            m: 0,
                            cursor: task.archived ? 'default' : 'pointer',
                            color: task.startOn ? 'text.primary' : 'primary.main',
                            textAlign: 'left',
                            textDecoration: task.archived ? 'none' : 'underline',
                            textUnderlineOffset: 2,
                            '&:hover': task.archived ? undefined : { color: 'primary.main' }
                          }}
                        >
                          {task.startOn ? `Start ${formatDateTime(task.startOn)}` : 'Add start date'}
                        </Typography>
                      )}

                      {editingDueTaskId === task.id ? (
                        <TextField
                          size="small"
                          type="datetime-local"
                          autoFocus
                          disabled={task.archived}
                          value={toDateTimeInputValue(task.dueOn)}
                          onChange={(e) => handleDueDateChange(task, e.target.value || null)}
                          onBlur={() => setEditingDueTaskId(null)}
                          InputLabelProps={{ shrink: true }}
                          sx={{ maxWidth: 240, '& .MuiInputBase-input': { fontWeight: 700, py: 0.5 } }}
                        />
                      ) : (
                        <Typography
                          variant="caption"
                          component="button"
                          type="button"
                          disabled={task.archived}
                          onClick={() => !task.archived && setEditingDueTaskId(task.id)}
                          sx={{
                            fontWeight: 700,
                            border: 0,
                            bgcolor: 'transparent',
                            p: 0,
                            m: 0,
                            cursor: task.archived ? 'default' : 'pointer',
                            color: task.dueOn ? 'text.primary' : 'primary.main',
                            textAlign: 'left',
                            textDecoration: task.archived ? 'none' : 'underline',
                            textUnderlineOffset: 2,
                            '&:hover': task.archived ? undefined : { color: 'primary.main' }
                          }}
                        >
                          {task.dueOn ? `Due ${formatDateTime(task.dueOn)}` : 'Add due date'}
                        </Typography>
                      )}
                    </Stack>

                    <Box sx={{ ...taskFieldRowSx, mb: 0.75 }}>
                      <FormControl size="small" fullWidth>
                        <InputLabel id={`task-${task.id}-priority-label`}>Priority</InputLabel>
                        <Select
                          labelId={`task-${task.id}-priority-label`}
                          label="Priority"
                          value={task.priority}
                          onChange={(e) => handlePriorityChange(task, e.target.value as TaskPriority)}
                          disabled={task.archived}
                        >
                          <MenuItem value="high">High</MenuItem>
                          <MenuItem value="medium">Medium</MenuItem>
                          <MenuItem value="low">Low</MenuItem>
                        </Select>
                      </FormControl>

                      {assigneeOptions.length > 0 ? (
                        <FormControl size="small" fullWidth>
                          <InputLabel id={`task-${task.id}-assignee-label`}>Assignee</InputLabel>
                          <Select
                            labelId={`task-${task.id}-assignee-label`}
                            label="Assignee"
                            value={task.assigneeId}
                            onChange={(e) => handleAssigneeChange(task, e.target.value as number)}
                            disabled={task.archived}
                            renderValue={(value) => {
                              const option = assigneeById.get(value as number);
                              const user = option ?? {
                                username: task.assigneeUsername ?? `user-${task.assigneeId}`,
                                firstName: undefined,
                                lastName: undefined
                              };
                              return (
                                <UserAvatarLabel
                                  user={user}
                                  label={option?.label ?? resolveAssigneeLabelForTask(task)}
                                  size={20}
                                  typographyVariant="body2"
                                />
                              );
                            }}
                          >
                            {assigneeOptions.map((option) => (
                              <AssigneeMenuItem key={option.id} option={option} />
                            ))}
                            {!assigneeById.has(task.assigneeId) && (
                              <MenuItem value={task.assigneeId}>
                                <UserAvatarLabel
                                  user={{
                                    username: task.assigneeUsername ?? `user-${task.assigneeId}`,
                                    firstName: undefined,
                                    lastName: undefined
                                  }}
                                  label={resolveAssigneeLabelForTask(task)}
                                  size={22}
                                />
                              </MenuItem>
                            )}
                          </Select>
                        </FormControl>
                      ) : (
                        <UserAvatarLabel
                          user={{
                            username: task.assigneeUsername ?? `user-${task.assigneeId}`,
                            firstName: undefined,
                            lastName: undefined
                          }}
                          label={resolveAssigneeLabelForTask(task)}
                          size={20}
                          typographyVariant="caption"
                        />
                      )}
                    </Box>

                    {!task.archived ? (
                      <Button size="small" sx={{ px: 0, minWidth: 0, alignSelf: 'flex-start' }} onClick={() => handleArchive(task.id, true)}>
                        Archive
                      </Button>
                    ) : (
                      <Button size="small" sx={{ px: 0, minWidth: 0, alignSelf: 'flex-start' }} onClick={() => handleArchive(task.id, false)}>
                        Restore
                      </Button>
                    )}
                  </Box>
                </Stack>
              </Stack>
            </Box>
                  ))}
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      ))}

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

export default TasksPanel;
