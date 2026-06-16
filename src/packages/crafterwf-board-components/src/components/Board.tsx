import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';

import {
  Box,
  Paper,
  Typography,
  cardClasses,
  Fab,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Stack,
  Tooltip,
  CircularProgress,
  IconButton
} from '@mui/material';

import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';

import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';
import { ApiResponse, ApiResponseErrorState } from '@craftercms/studio-ui';
import BoardCard from './BoardCard';
import CardRecord from '../types/CardRecord';
import {
  loadBoard,
  createPackage,
  movePackage,
  mapBoardResponse,
  BoardApiResponse,
  BoardView,
  getPackageActionFailureMessage,
  isListDropAllowedForDraggedPackage,
  isListMoveBlockedForPackage,
  isTransitionMoveAllowed,
  TRANSITION_BLOCKED_MESSAGE
} from '../api/workflowApi';
import { CONTENT_RULE_BLOCKED_MESSAGE } from '../stepRules';
import { resolveBoardBackgroundColor, resolveStepColor } from '../colors';
import { notifyWorkflowsUpdated } from '../utils/activeWorkflows';
import { showStudioErrorSnack } from '../utils/showStudioErrorSnack';
import { getStepActionDescriptions, getStepActionLabel, hasStepAction, isArchiveStepAction } from '../stepActions';

export interface BoardProps {
  /** Widget config may still pass boardId; treated as workflowId */
  boardId?: string;
  workflowId?: string;
  /** When set, opens the package card details after the board loads */
  openPackageId?: string;
}

interface PendingStepActionMove {
  cardId: string;
  sourceListId: string;
  sourceIndex: number;
  targetListId: string;
  targetIndex: number;
  cardName: string;
  stepName: string;
  actionLabel: string;
  isArchiveAction?: boolean;
}

type BoardLists = NonNullable<BoardView['lists']>;

function moveCardBetweenLists(
  lists: BoardLists,
  cardId: string,
  sourceListId: string,
  targetListId: string,
  targetIndex: number
): BoardLists | null {
  const sourceList = lists.find((list) => list.id === sourceListId);
  const card = sourceList?.cards.find((item) => item.id === cardId);
  if (!sourceList || !card || !lists.some((list) => list.id === targetListId)) {
    return null;
  }

  return lists.map((list) => {
    if (list.id === sourceListId) {
      return { ...list, cards: list.cards.filter((item) => item.id !== cardId) };
    }
    if (list.id === targetListId) {
      const cards = list.cards.filter((item) => item.id !== cardId);
      const nextCards = [...cards];
      nextCards.splice(targetIndex, 0, card);
      return { ...list, cards: nextCards };
    }
    return list;
  });
}

const Board = ({ boardId, workflowId: workflowIdProp, openPackageId: initialOpenPackageId }: BoardProps) => {
  const siteId = useActiveSiteId();
  const workflowId = workflowIdProp || boardId;
  const [error, setError] = useState<ApiResponse>();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [createCardOpen, setCreateCardOpen] = React.useState(false);
  const [newCardTitle, setNewCardTitle] = React.useState('');
  const [newCardDescription, setNewCardDescription] = React.useState('');
  const [newCardColor, setNewCardColor] = React.useState('blue');
  const [newCardList, setNewCardList] = React.useState('');

  const [openPackageId, setOpenPackageId] = React.useState<string | null>(initialOpenPackageId ?? null);
  const pendingOpenPackageId = React.useRef<string | null>(initialOpenPackageId ?? null);
  const [pendingStepActionMove, setPendingStepActionMove] = React.useState<PendingStepActionMove | null>(null);
  const pendingStepActionMoveRef = React.useRef<PendingStepActionMove | null>(null);
  const [movingCard, setMovingCard] = React.useState(false);
  const [draggingCardId, setDraggingCardId] = React.useState<string | null>(null);
  const [draggingSourceListId, setDraggingSourceListId] = React.useState<string | null>(null);

  const [state, setState] = useState<{
    board: BoardView['board'] | null;
    lists: BoardView['lists'] | null;
    currentUserGroups: string[];
  }>({
    board: null,
    lists: null,
    currentUserGroups: []
  });

  useEffect(() => {
    if (initialOpenPackageId) {
      pendingOpenPackageId.current = initialOpenPackageId;
      setOpenPackageId(initialOpenPackageId);
    }
  }, [initialOpenPackageId]);

  useEffect(() => {
    if (!pendingOpenPackageId.current || loading || !state.lists?.length) {
      return;
    }
    const packageId = pendingOpenPackageId.current;
    const found = state.lists.some((list) => list.cards.some((card) => card.id === packageId));
    if (found) {
      setOpenPackageId(packageId);
      pendingOpenPackageId.current = null;
    }
  }, [loading, state.lists]);

  useEffect(() => {
    pendingStepActionMoveRef.current = pendingStepActionMove;
  }, [pendingStepActionMove]);

  const applyListsUpdate = (lists: BoardLists) => {
    setState((prev) => ({ ...prev, lists, currentUserGroups: prev.currentUserGroups }));
  };

  const onDragEnd = (result) => {
    if (!result.destination) {
      return;
    }

    const cardId = result.draggableId;
    const targetListIdIndex = result.destination.index;
    const targetListId = result.destination.droppableId;
    const sourceListIndex = result.source.index;
    const sourceListId = result.source.droppableId;

    if (sourceListId === targetListId && sourceListIndex === targetListIdIndex) {
      return;
    }

    const sourceList = state.lists?.find((list) => list.id === sourceListId);
    const targetList = state.lists?.find((list) => list.id === targetListId);
    const card = sourceList?.cards.find((item) => item.id === cardId);

    if (sourceListId !== targetListId && sourceList && targetList && card) {
      const transitionBlocked = isTransitionMoveAllowed(sourceList, targetListId);
      if (!transitionBlocked.allowed) {
        notifyUserError(transitionBlocked.message || TRANSITION_BLOCKED_MESSAGE);
        return;
      }
      const blocked = isListMoveBlockedForPackage(
        targetList,
        { contentPaths: card.contentPaths, contentTypes: card.contentTypes },
        state.currentUserGroups
      );
      if (blocked.blocked) {
        notifyUserError(blocked.message || CONTENT_RULE_BLOCKED_MESSAGE);
        return;
      }
    }

    if (
      sourceListId !== targetListId &&
      targetList &&
      card &&
      hasStepAction(targetList.actionType)
    ) {
      const actionLabel = getStepActionLabel(targetList.actionType);
      if (actionLabel && state.lists) {
        const nextLists = moveCardBetweenLists(
          state.lists,
          cardId,
          sourceListId,
          targetListId,
          targetListIdIndex
        );
        if (nextLists) {
          applyListsUpdate(nextLists);
        }
        setPendingStepActionMove({
          cardId,
          sourceListId,
          sourceIndex: sourceListIndex,
          targetListId,
          targetIndex: targetListIdIndex,
          cardName: card.name,
          stepName: targetList.name,
          actionLabel,
          isArchiveAction: isArchiveStepAction(targetList.actionType)
        });
        return;
      }
    }

    moveCard(cardId, sourceListId, targetListId, targetListIdIndex);
  };

  const handleCancelStepActionMove = () => {
    const pending = pendingStepActionMove;
    if (pending && state.lists) {
      const revertedLists = moveCardBetweenLists(
        state.lists,
        pending.cardId,
        pending.targetListId,
        pending.sourceListId,
        pending.sourceIndex
      );
      if (revertedLists) {
        applyListsUpdate(revertedLists);
      }
    }
    setPendingStepActionMove(null);
  };

  const handleConfirmStepActionMove = () => {
    if (!pendingStepActionMove) {
      return;
    }
    const { cardId, sourceListId, targetListId, targetIndex } = pendingStepActionMove;
    setPendingStepActionMove(null);
    moveCard(cardId, sourceListId, targetListId, targetIndex, { skipOptimistic: true });
  };

  const handleCreateCard = () => {
    const title = newCardTitle.trim() || 'New Package';
    if (!newCardList) {
      setError({ code: '1001', message: 'No workflow step selected' } as ApiResponse);
      return;
    }
    addCardToList(newCardList, title, newCardDescription.trim(), newCardColor);
  };

  const handleAddCardToList = (listId: string) => {
    setNewCardList(listId);
    setNewCardTitle('');
    setNewCardDescription('');
    setCreateCardOpen(true);
  };

  const handleAddCardToListCancel = () => {
    setCreateCardOpen(false);
  };

  const notifyUserError = useCallback((message: string) => {
    showStudioErrorSnack(message);
  }, []);

  const showStepActionFailure = (response: unknown) => {
    const message = getPackageActionFailureMessage(response);
    if (message) {
      notifyUserError(message);
    }
  };

  const addCardToList = (listId: string, title: string, desc: string, color: string) => {
    if (!siteId) {
      setError({ code: '1001', message: 'Site is not available' } as ApiResponse);
      return;
    }

    setCreating(true);
    createPackage(siteId, listId, title, desc, color).subscribe({
      next: (response) => {
        setCreating(false);
        setError(undefined);
        setCreateCardOpen(false);
        setNewCardTitle('');
        setNewCardDescription('');
        showStepActionFailure(response);
        notifyWorkflowsUpdated();
        loadBoardData();
      },
      error(e) {
        console.error(e);
        setCreating(false);
        setError(
          e.response?.response ?? ({ code: '?', message: 'Failed to create package. Check browser console.' } as ApiResponse)
        );
      }
    });
  };

  const moveCard = (
    cardId: string,
    sourceListId: string,
    targetListId: string,
    targetListIdIndex: number,
    options?: { skipOptimistic?: boolean }
  ) => {
    if (!options?.skipOptimistic && state.lists) {
      const nextLists = moveCardBetweenLists(
        state.lists,
        cardId,
        sourceListId,
        targetListId,
        targetListIdIndex
      );
      if (nextLists) {
        applyListsUpdate(nextLists);
      }
    }

    setMovingCard(true);
    movePackage(siteId, cardId, targetListId, targetListIdIndex).subscribe({
      next: (response) => {
        setMovingCard(false);
        showStepActionFailure(response);
        loadBoardData();
      },
      error(e) {
        console.error(e);
        setMovingCard(false);
        const apiError =
          e.response?.response ?? ({ code: '?', message: 'Failed to move package. Check browser console.' } as ApiResponse);
        notifyUserError(apiError.message || 'Failed to move package.');
        setError(apiError);
        loadBoardData();
      }
    });
  };

  const loadBoardData = () => {
    if (!siteId) {
      return;
    }

    loadBoard(siteId, workflowId).subscribe({
      next: (response) => {
        const mapped = mapBoardResponse(response.response.result as BoardApiResponse);
        let lists = mapped.lists;
        const pending = pendingStepActionMoveRef.current;
        if (pending) {
          const previewLists = moveCardBetweenLists(
            lists,
            pending.cardId,
            pending.sourceListId,
            pending.targetListId,
            pending.targetIndex
          );
          if (previewLists) {
            lists = previewLists;
          }
        }
        setError(undefined);
        setState({
          board: mapped.board,
          lists,
          currentUserGroups: mapped.currentUserGroups ?? []
        });
        setLoading(false);
      },
      error(e) {
        console.error(e);
        setLoading(false);
        setError(
          e.response?.response ?? ({ code: '?', message: 'Unknown Error. Check browser console.' } as ApiResponse)
        );
      }
    });
  };

  useEffect(() => {
    if (!siteId) {
      return;
    }

    setLoading(true);
    loadBoardData();
    const intervalRef = setInterval(() => {
      if (!pendingStepActionMoveRef.current) {
        loadBoardData();
      }
    }, 5000);
    return () => clearInterval(intervalRef);
  }, [siteId, workflowId]);

  const handlePackageBoardChanged = React.useCallback(() => {
    loadBoardData();
  }, [siteId, workflowId]);

  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        alignSelf: 'stretch',
        width: '100%',
        minWidth: 0,
        minHeight: '100%',
        height: '100%',
        boxSizing: 'border-box',
        margin: 0,
        paddingTop: theme.spacing(2.5),
        paddingLeft: theme.spacing(2.5),
        paddingRight: theme.spacing(2),
        paddingBottom: theme.spacing(2),
        ...(state.board?.prefs?.backgroundImage
          ? {
              backgroundImage: `url(${state.board.prefs.backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundAttachment: 'local'
            }
          : state.board
            ? {
                bgcolor: resolveBoardBackgroundColor(state.board.prefs?.backgroundColor)
              }
            : {
                bgcolor: 'background.default'
              })
      })}
    >
      <DragDropContext
        onDragStart={(start) => {
          setDraggingCardId(start.draggableId);
          setDraggingSourceListId(start.source.droppableId);
        }}
        onDragEnd={(result) => {
          setDraggingCardId(null);
          setDraggingSourceListId(null);
          onDragEnd(result);
        }}
      >
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            width: '100%',
            overflow: 'hidden'
          }}
        >
          {error && <ApiResponseErrorState error={error} />}
          {loading && !state.lists && !error && (
            <Box
              sx={{
                display: 'flex',
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200
              }}
            >
              <CircularProgress size={32} />
            </Box>
          )}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              alignItems: 'stretch',
              gap: 1.5,
              minWidth: 0,
              flex: 1,
              minHeight: 0,
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'thin',
              WebkitOverflowScrolling: 'touch',
              '&::-webkit-scrollbar': { height: 6 },
              '&::-webkit-scrollbar-thumb': {
                borderRadius: 6,
                backgroundColor: 'action.selected'
              }
            }}
          >
            {state.lists &&
              state.lists.map((list) => {
                const draggingCard = draggingCardId
                  ? state.lists
                      ?.flatMap((entry) => entry.cards)
                      .find((card) => card.id === draggingCardId)
                  : undefined;
                const draggingSourceList = draggingSourceListId
                  ? state.lists?.find((entry) => entry.id === draggingSourceListId)
                  : undefined;
                const dropCheck = draggingCard
                  ? isListDropAllowedForDraggedPackage(
                      draggingSourceList,
                      list,
                      {
                        contentPaths: draggingCard.contentPaths,
                        contentTypes: draggingCard.contentTypes
                      },
                      state.currentUserGroups
                    )
                  : { allowed: true as const };
                const isDropDisabled = !dropCheck.allowed;
                const dropBlockedMessage =
                  dropCheck.message || TRANSITION_BLOCKED_MESSAGE || CONTENT_RULE_BLOCKED_MESSAGE;

                return (
                <Paper
                  key={list.id}
                  elevation={0}
                  sx={(theme) => ({
                    flex: '1 1 200px',
                    minWidth: 176,
                    maxWidth: 300,
                    maxHeight: 'min(70vh, 640px)',
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    p: 1.25,
                    pt: 1,
                    pl: 1,
                    borderRadius: 2,
                    border: `1px solid ${theme.palette.divider}`,
                    borderLeft: `4px solid ${resolveStepColor(list.color)}`,
                    bgcolor: isDropDisabled
                      ? theme.palette.action.disabledBackground
                      : theme.palette.mode === 'dark'
                        ? 'rgba(18, 18, 18, 0.94)'
                        : 'rgba(255, 255, 255, 0.92)',
                    opacity: isDropDisabled ? 0.55 : 1,
                    boxShadow: theme.shadows[1]
                  })}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={0.5}
                    sx={{ mb: 0.75, flexShrink: 0, minWidth: 0, pr: 0.25 }}
                  >
                    <Typography
                      variant="subtitle2"
                      component="h2"
                      sx={{
                        fontWeight: 600,
                        letterSpacing: 0.02,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {list.name}
                    </Typography>
                    {hasStepAction(list.actionType) && (
                      <Tooltip
                        arrow
                        placement="top"
                        enterDelay={200}
                        title={
                          <Stack component="span" spacing={0.25} sx={{ py: 0.25 }}>
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ fontWeight: 600, display: 'block' }}
                            >
                              Automatic actions
                            </Typography>
                            {getStepActionDescriptions(list.actionType).map((description) => (
                              <Typography key={description} component="span" variant="caption" sx={{ display: 'block' }}>
                                • {description}
                              </Typography>
                            ))}
                          </Stack>
                        }
                      >
                        <IconButton
                          size="small"
                          aria-label={`Automatic actions for ${list.name}`}
                          sx={(theme) => ({
                            flexShrink: 0,
                            p: 0.35,
                            color: theme.palette.text.secondary,
                            '&:hover': {
                              color: theme.palette.primary.main,
                              bgcolor: 'action.hover'
                            }
                          })}
                        >
                          <SettingsRoundedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  {isDropDisabled && (
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, px: 0.25, lineHeight: 1.3 }}>
                      {dropBlockedMessage}
                    </Typography>
                  )}

                  <Droppable droppableId={list.id} isDropDisabled={isDropDisabled}>
                    {(provided) => (
                      <Box
                        sx={(theme) => ({
                          flex: 1,
                          minHeight: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          [`.${cardClasses.root}:not(:last-child)`]: { mb: 1 },
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          pr: 0.5,
                          scrollbarWidth: 'thin',
                          '&::-webkit-scrollbar': { width: 6 },
                          '&::-webkit-scrollbar-thumb': {
                            borderRadius: 8,
                            backgroundColor:
                              theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[400]
                          }
                        })}
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        {list.cards &&
                          list.cards.map((card, cardIndex) => (
                            <Draggable key={card.id} draggableId={card.id} index={cardIndex}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                                  <Box sx={{ py: 0.25 }}>
                                    <BoardCard
                                      card={card}
                                      detailsOpen={openPackageId === card.id}
                                      onDetailsOpen={() => setOpenPackageId(card.id)}
                                      onDetailsClose={() => setOpenPackageId(null)}
                                      onPackageChanged={handlePackageBoardChanged}
                                    />
                                  </Box>
                                  {provided.placeholder}
                                </div>
                              )}
                            </Draggable>
                          ))}
                        <Box sx={{ minHeight: 12, flexShrink: 0 }} aria-hidden />
                      </Box>
                    )}
                  </Droppable>
                  {list.allowAddPackage && (
                    <Button
                      size="small"
                      variant="text"
                      aria-label="add package"
                      onClick={() => handleAddCardToList(list.id)}
                      sx={(theme) => ({
                        flexShrink: 0,
                        alignSelf: 'stretch',
                        mt: 'auto',
                        py: 0.75,
                        borderTop: `1px solid ${theme.palette.divider}`,
                        borderRadius: 0,
                        justifyContent: 'flex-start',
                        fontWeight: 600
                      })}
                    >
                      Add package
                    </Button>
                  )}
                </Paper>
              );
              })}
          </Box>
        </Box>
      </DragDropContext>
      {state.board && (
        <Tooltip title="Refresh board">
          <Fab
            onClick={loadBoardData}
            aria-label="Refresh board"
            size="medium"
            sx={(theme) => ({
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: theme.zIndex.modal + 2
            })}
            color="primary"
          >
            <RefreshRoundedIcon />
          </Fab>
        </Tooltip>
      )}

      <Dialog open={createCardOpen} onClose={handleAddCardToListCancel} fullWidth maxWidth="sm">
        <DialogTitle>New package</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              label="Title"
              placeholder="New package"
              variant="outlined"
              fullWidth
              autoFocus
            />
            <TextField
              value={newCardDescription}
              onChange={(e) => setNewCardDescription(e.target.value)}
              label="Description"
              variant="outlined"
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAddCardToListCancel} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreateCard} disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!pendingStepActionMove}
        onClose={handleCancelStepActionMove}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Confirm automatic step action</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 0.5 }}>
            Moving <strong>{pendingStepActionMove?.cardName}</strong> to{' '}
            <strong>{pendingStepActionMove?.stepName}</strong> will automatically perform{' '}
            <strong>{pendingStepActionMove?.actionLabel}</strong>
            {pendingStepActionMove?.isArchiveAction
              ? '. The package will be removed from the board.'
              : ' on the package\u2019s attached content.'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Do you want to continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelStepActionMove} disabled={movingCard}>
            Cancel
          </Button>
          <Button onClick={handleConfirmStepActionMove} variant="contained" disabled={movingCard}>
            {movingCard ? 'Moving…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Board;
