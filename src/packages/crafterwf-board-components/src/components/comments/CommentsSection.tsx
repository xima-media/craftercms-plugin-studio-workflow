import * as React from 'react';
import { useEffect, useState } from 'react';

import { Box, Button, Chip, Stack, Typography } from '@mui/material';

import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';
import { fetchAll as fetchAllUsers } from '@craftercms/studio-ui/services/users';

import { WorkflowComment } from '../../api/workflowApi';
import { extractMentionedUserIds } from '../../utils/mentionUtils';
import { UserAvatarFromUsername, userDisplayName } from '../users/studioUserDisplay';
import CommentBodyWithMentions from './CommentBodyWithMentions';
import CommentMentionInput, { MentionUserOption } from './CommentMentionInput';

export type { MentionUserOption };

function formatCommentDate(value?: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export interface CommentsSectionProps {
  comments: WorkflowComment[];
  onAddComment?: (body: string, mentionedUserIds?: number[]) => void;
  onResolveComment?: (commentId: string, resolved: boolean) => void;
  onArchiveComment?: (commentId: string, archived: boolean) => void;
  showArchived?: boolean;
  onShowArchivedChange?: (show: boolean) => void;
  compact?: boolean;
  mentionUsers?: MentionUserOption[];
}

const CommentsSection = ({
  comments,
  onAddComment,
  onResolveComment,
  onArchiveComment,
  showArchived = false,
  onShowArchivedChange,
  compact = false,
  mentionUsers: mentionUsersProp
}: CommentsSectionProps) => {
  const siteId = useActiveSiteId();
  const [commentDraft, setCommentDraft] = useState('');
  const [mentionUsers, setMentionUsers] = useState<MentionUserOption[]>(mentionUsersProp ?? []);
  const [mentionUsersLoading, setMentionUsersLoading] = useState(false);

  useEffect(() => {
    if (mentionUsersProp) {
      setMentionUsers(mentionUsersProp);
      return;
    }
    if (!onAddComment) {
      return;
    }
    setMentionUsersLoading(true);
    fetchAllUsers({ limit: 500, offset: 0 }).subscribe({
      next(users) {
        const options = (users ?? [])
          .filter((user) => user.enabled !== false)
          .map((user) => ({
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            label: userDisplayName(user)
          }));
        setMentionUsers(options);
        setMentionUsersLoading(false);
      },
      error(e) {
        console.error(e);
        setMentionUsersLoading(false);
      }
    });
  }, [mentionUsersProp, onAddComment]);

  const handleSubmitComment = () => {
    const body = commentDraft.trim();
    if (!body || !onAddComment) {
      return;
    }
    onAddComment(body, extractMentionedUserIds(body, mentionUsers));
    setCommentDraft('');
  };

  const visibleComments = comments;
  const showArchivedToggle = Boolean(onShowArchivedChange);

  return (
    <Stack spacing={compact ? 0.75 : 1}>
      {visibleComments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
          {showArchived && showArchivedToggle ? 'No comments (including archived).' : 'No comments yet.'}
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {visibleComments.map((comment) => (
            <Box
              key={comment.id}
              sx={{
                p: 1.25,
                borderRadius: 1,
                bgcolor: comment.archived
                  ? 'action.disabledBackground'
                  : comment.resolved
                    ? 'action.selected'
                    : 'action.hover',
                opacity: comment.archived || comment.resolved ? 0.85 : 1,
                minWidth: 0
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                <UserAvatarFromUsername
                  username={comment.authorUsername || (comment.authorId ? `user-${comment.authorId}` : 'unknown')}
                  label={comment.authorUsername || (comment.authorId ? `User #${comment.authorId}` : 'Unknown')}
                  size={22}
                />
                {comment.resolved && (
                  <Chip label="Resolved" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                )}
                {comment.archived && (
                  <Chip label="Archived" size="small" color="default" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  {formatCommentDate(comment.createdOn)}
                </Typography>
              </Stack>
              <CommentBodyWithMentions body={comment.body} mentionUsers={mentionUsers} siteId={siteId} />
              {(onResolveComment || onArchiveComment) && !comment.archived && (
                <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                  {onResolveComment && (
                    <Button
                      size="small"
                      sx={{ px: 0, minWidth: 0 }}
                      onClick={() => onResolveComment(comment.id, !comment.resolved)}
                    >
                      {comment.resolved ? 'Reopen' : 'Resolve'}
                    </Button>
                  )}
                  {onArchiveComment && (
                    <Button
                      size="small"
                      sx={{ px: 0, minWidth: 0 }}
                      onClick={() => onArchiveComment(comment.id, true)}
                    >
                      Archive
                    </Button>
                  )}
                </Stack>
              )}
              {onArchiveComment && comment.archived && (
                <Button
                  size="small"
                  sx={{ mt: 0.75, px: 0, minWidth: 0 }}
                  onClick={() => onArchiveComment(comment.id, false)}
                >
                  Restore
                </Button>
              )}
            </Box>
          ))}
        </Stack>
      )}

      {showArchivedToggle && (
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start', px: 0, minWidth: 0 }}
          onClick={() => onShowArchivedChange?.(!showArchived)}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
      )}

      {onAddComment && (
        <CommentMentionInput
          value={commentDraft}
          onChange={setCommentDraft}
          onSubmit={handleSubmitComment}
          mentionUsers={mentionUsers}
          mentionUsersLoading={mentionUsersLoading}
          minRows={compact ? 2 : 2}
        />
      )}
    </Stack>
  );
};

export default CommentsSection;
