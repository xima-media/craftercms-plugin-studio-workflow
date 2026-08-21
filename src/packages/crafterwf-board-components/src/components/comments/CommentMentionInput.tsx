import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Box,
  IconButton,
  List,
  ListItemButton,
  Paper,
  Popper,
  Stack,
  Typography
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';

import { getMentionQuery, MentionUserRef, parseCommentDraftSegments } from '../../utils/mentionUtils';
import { UserAvatarLabel } from '../users/studioUserDisplay';

export interface MentionUserOption extends MentionUserRef {
  label: string;
}

export interface CommentMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  mentionUsers: MentionUserOption[];
  mentionUsersLoading?: boolean;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
}

const INPUT_FONT_SIZE = '0.875rem';
const INPUT_LINE_HEIGHT = 1.43;
const INPUT_PADDING = '8.5px 36px 8.5px 14px';

const mentionOptionId = (userId: number) => `crafterwf-mention-option-${userId}`;

/**
 * Renders one draft segment for the mirror box. Every segment must occupy exactly the characters and
 * the glyph widths of the raw textarea text, otherwise the caret drifts away from the visible text:
 * hence the raw `@username` instead of a display name, and highlighting without a weight change.
 */
function renderDraftSegment(segment: ReturnType<typeof parseCommentDraftSegments>[number], key: number) {
  if (segment.type === 'mention') {
    return (
      <Box
        key={key}
        component="span"
        sx={{
          color: 'primary.main'
        }}
      >
        {`@${segment.username}`}
      </Box>
    );
  }
  if (segment.type === 'pendingMention') {
    return (
      <Box
        key={key}
        component="span"
        sx={{
          color: 'primary.main',
          bgcolor: 'action.selected',
          borderRadius: 0.5
        }}
      >
        {segment.value}
      </Box>
    );
  }
  return <React.Fragment key={key}>{segment.value}</React.Fragment>;
}

const CommentMentionInput = ({
  value,
  onChange,
  onSubmit,
  mentionUsers,
  mentionUsersLoading = false,
  placeholder = 'Add a comment… Use @ to mention someone',
  minRows = 2,
  maxRows = 6
}: CommentMentionInputProps) => {
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const activeOptionRef = useRef<HTMLDivElement | null>(null);

  const minHeight = minRows * INPUT_LINE_HEIGHT * 16 + 17;
  const maxHeight = maxRows * INPUT_LINE_HEIGHT * 16 + 17;

  const filteredMentionUsers = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    return mentionUsers
      .filter(
        (user) =>
          !q ||
          user.username.toLowerCase().includes(q) ||
          user.label.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [mentionQuery, mentionUsers]);

  const activeMentionUser = filteredMentionUsers[activeIndex] ?? filteredMentionUsers[0];

  // The highlight would otherwise point at whatever moved into its slot while the query narrows down.
  useEffect(() => {
    setActiveIndex(0);
  }, [filteredMentionUsers]);

  useEffect(() => {
    if (mentionOpen) {
      activeOptionRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, mentionOpen]);

  const draftSegments = useMemo(
    () => parseCommentDraftSegments(value, mentionUsers, cursorPosition),
    [cursorPosition, mentionUsers, value]
  );

  const syncMentionState = useCallback(
    (text: string, cursor: number) => {
      setCursorPosition(cursor);
      const query = getMentionQuery(text, cursor);
      if (query != null) {
        setMentionQuery(query);
        setMentionOpen(true);
      } else {
        setMentionOpen(false);
        setMentionQuery('');
      }
    },
    []
  );

  const insertMention = (username: string) => {
    const text = value;
    const cursor = cursorPosition;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const atIndex = before.lastIndexOf('@');
    if (atIndex < 0) {
      return;
    }
    const fragment = before.slice(atIndex);
    if (!/^@[\w.\-]*$/.test(fragment)) {
      return;
    }
    const prefix = before.slice(0, atIndex);
    const insertion = `@${username} `;
    const next = `${prefix}${insertion}${after}`;
    onChange(next);
    setMentionOpen(false);
    setMentionQuery('');
    const nextCursor = prefix.length + insertion.length;
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
        setCursorPosition(nextCursor);
      }
    });
  };

  const syncScroll = () => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (input && mirror) {
      mirror.scrollTop = input.scrollTop;
    }
  };

  return (
    <Box ref={wrapperRef} sx={{ position: 'relative', pt: 0.5 }}>
      <Box
        sx={{
          position: 'relative',
          border: 1,
          borderColor: focused ? 'primary.main' : 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          transition: (theme) =>
            theme.transitions.create(['border-color'], { duration: theme.transitions.duration.shortest })
        }}
      >
        <Box
          ref={mirrorRef}
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            px: '14px',
            py: '8.5px',
            pr: '36px',
            overflow: 'hidden',
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: INPUT_FONT_SIZE,
            lineHeight: INPUT_LINE_HEIGHT,
            fontFamily: 'inherit',
            color: 'text.primary',
            minHeight,
            maxHeight
          }}
        >
          {value ? (
            draftSegments.map((segment, index) => renderDraftSegment(segment, index))
          ) : (
            <Box component="span" sx={{ color: 'text.disabled' }}>
              {placeholder}
            </Box>
          )}
        </Box>
        <Box
          component="textarea"
          ref={inputRef}
          value={value}
          rows={minRows}
          placeholder=""
          aria-activedescendant={
            mentionOpen && activeMentionUser ? mentionOptionId(activeMentionUser.id) : undefined
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next);
            syncMentionState(next, event.target.selectionStart ?? next.length);
          }}
          onClick={() => {
            const target = inputRef.current;
            if (target) {
              syncMentionState(value, target.selectionStart ?? 0);
            }
          }}
          onKeyUp={() => {
            const target = inputRef.current;
            if (target) {
              syncMentionState(value, target.selectionStart ?? 0);
            }
          }}
          onScroll={syncScroll}
          onKeyDown={(event) => {
            if (mentionOpen && filteredMentionUsers.length > 0) {
              // Only while the list is open, so the arrows keep moving the caret in a multi-line draft.
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                const count = filteredMentionUsers.length;
                setActiveIndex((current) => (current + step + count) % count);
                return;
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                insertMention(activeMentionUser.username);
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey && getMentionQuery(value, cursorPosition) != null) {
                event.preventDefault();
                insertMention(activeMentionUser.username);
                return;
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
            if (event.key === 'Escape' && mentionOpen) {
              event.preventDefault();
              setMentionOpen(false);
            }
          }}
          sx={{
            display: 'block',
            width: '100%',
            minHeight,
            maxHeight,
            p: INPUT_PADDING,
            border: 'none',
            outline: 'none',
            resize: 'none',
            bgcolor: 'transparent',
            color: 'transparent',
            caretColor: (theme) => theme.palette.text.primary,
            fontFamily: 'inherit',
            fontSize: INPUT_FONT_SIZE,
            lineHeight: INPUT_LINE_HEIGHT,
            position: 'relative',
            zIndex: 1
          }}
        />
      </Box>

      <Popper
        open={mentionOpen}
        anchorEl={wrapperRef.current}
        placement="top-start"
        sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
      >
        <Paper elevation={4} sx={{ maxHeight: 220, overflow: 'auto', minWidth: 240, mt: 0.5 }}>
          {mentionUsersLoading ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
              Loading users…
            </Typography>
          ) : filteredMentionUsers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
              {mentionUsers.length === 0 ? 'No users available' : 'No matching users'}
            </Typography>
          ) : (
            <List dense disablePadding role="listbox">
              {filteredMentionUsers.map((user, index) => (
                <ListItemButton
                  key={user.id}
                  id={mentionOptionId(user.id)}
                  ref={index === activeIndex ? activeOptionRef : undefined}
                  role="option"
                  aria-selected={index === activeIndex}
                  selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(user.username);
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', minWidth: 0 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <UserAvatarLabel user={user} label={user.label} size={22} typographyVariant="body2" />
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      @{user.username}
                    </Typography>
                  </Stack>
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>
      </Popper>

      <IconButton
        size="small"
        color="primary"
        disabled={!value.trim()}
        onClick={onSubmit}
        aria-label="Send comment"
        sx={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          zIndex: 2
        }}
      >
        <SendRoundedIcon fontSize="small" />
      </IconButton>
    </Box>
  );
};

export default CommentMentionInput;
