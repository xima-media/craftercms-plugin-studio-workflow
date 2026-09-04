import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';

import useActiveSiteId from '@craftercms/studio-ui/hooks/useActiveSiteId';

import CommentsSection from '../comments/CommentsSection';
import {
  COMMENT_TARGET,
  ContentPackageWithComments,
  createContentComment,
  createPackageComment,
  findPackagesByContentPath,
  listComments,
  listPackageComments,
  WorkflowComment,
  resolveComment,
  archiveComment
} from '../../api/workflowApi';
import { resolveStepColor } from '../../colors';
import { markCommentsViewed, notifyCommentsUpdated } from '../../utils/commentBadgeUtils';
import { usePreviewContentPath } from '../../utils/studioPreview';

function coverColorDot(color: string | undefined): string | undefined {
  if (!color) {
    return undefined;
  }
  return resolveStepColor(color) || color;
}

const ContentCommentsPanel = () => {
  const siteId = useActiveSiteId();
  const contentPath = usePreviewContentPath();

  const [contentComments, setContentComments] = useState<WorkflowComment[]>([]);
  const [packages, setPackages] = useState<ContentPackageWithComments[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | false>(false);
  const [showArchived, setShowArchived] = useState(false);

  const loadData = useCallback(() => {
    if (!siteId || !contentPath) {
      setContentComments([]);
      setPackages([]);
      return;
    }

    setLoading(true);
    setError(null);
    findPackagesByContentPath(siteId, contentPath, true, showArchived).subscribe({
      next(response) {
        const result = response.response?.result;
        setContentComments(result?.contentComments ?? []);
        const pkgList = result?.packages ?? [];
        setPackages(pkgList);
        if (pkgList.length === 1) {
          setExpandedId(pkgList[0].workflowPackageId);
        }
        setLoading(false);
        markCommentsViewed(siteId, contentPath);
        notifyCommentsUpdated();
      },
      error(e) {
        console.error(e);
        setError('Unable to load comments.');
        setContentComments([]);
        setPackages([]);
        setLoading(false);
      }
    });
  }, [contentPath, siteId, showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshContentComments = () => {
    if (!siteId || !contentPath) {
      return;
    }
    listComments(siteId, COMMENT_TARGET.CONTENT, contentPath, true, showArchived).subscribe({
      next(response) {
        setContentComments(response.response?.result?.comments ?? []);
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const refreshPackageComments = (workflowPackageId: string) => {
    listPackageComments(siteId, workflowPackageId, true, showArchived).subscribe({
      next(response) {
        const comments = response.response?.result?.comments ?? [];
        setPackages((prev) =>
          prev.map((pkg) => (pkg.workflowPackageId === workflowPackageId ? { ...pkg, comments } : pkg))
        );
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleAddContentComment = (body: string, mentionedUserIds?: number[]) => {
    if (!contentPath) {
      return;
    }
    createContentComment(siteId, contentPath, body, mentionedUserIds).subscribe({
      next() {
        refreshContentComments();
        notifyCommentsUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleAddPackageComment = (workflowPackageId: string, body: string, mentionedUserIds?: number[]) => {
    createPackageComment(siteId, workflowPackageId, body, mentionedUserIds).subscribe({
      next() {
        refreshPackageComments(workflowPackageId);
        notifyCommentsUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleResolveComment = (commentId: string, resolved: boolean) => {
    resolveComment(siteId, commentId, resolved).subscribe({
      next() {
        refreshContentComments();
        packages.forEach((pkg) => refreshPackageComments(pkg.workflowPackageId));
        notifyCommentsUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleArchiveComment = (commentId: string, archived: boolean) => {
    archiveComment(siteId, commentId, archived).subscribe({
      next() {
        refreshContentComments();
        packages.forEach((pkg) => refreshPackageComments(pkg.workflowPackageId));
        notifyCommentsUpdated();
      },
      error(e) {
        console.error(e);
      }
    });
  };

  const handleShowArchivedChange = (show: boolean) => {
    setShowArchived(show);
  };

  const hasPackageComments = packages.length > 0;

  return (
    <Stack spacing={1.5} sx={{ p: 2, minWidth: 0 }}>
      {!contentPath ? (
        <Typography variant="body2" color="text.secondary">
          Open a content item in preview to see comments.
        </Typography>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, pb: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      ) : (
        <>
          <Stack spacing={0.75}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.06, textTransform: 'uppercase' }}>
              Page comments
            </Typography>
            <CommentsSection
              compact
              comments={contentComments}
              onAddComment={handleAddContentComment}
              onResolveComment={handleResolveComment}
              onArchiveComment={handleArchiveComment}
              showArchived={showArchived}
              onShowArchivedChange={handleShowArchivedChange}
            />
          </Stack>

          {hasPackageComments && (
            <>
              <Divider flexItem />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.06, textTransform: 'uppercase' }}>
                Workflow cards
              </Typography>
              {packages.map((pkg) => {
                const open = expandedId === pkg.workflowPackageId;
                const commentCount = pkg.comments?.length ?? 0;
                const dotColor = coverColorDot(pkg.coverColor);

                return (
                  <Accordion
                    key={pkg.workflowPackageId}
                    expanded={open}
                    onChange={(_event, isExpanded) => setExpandedId(isExpanded ? pkg.workflowPackageId : false)}
                    disableGutters
                    sx={{
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: '8px !important',
                      '&:before': { display: 'none' },
                      overflow: 'hidden'
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ minHeight: 48, px: 1.25, '& .MuiAccordionSummary-content': { my: 0.75 } }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, pr: 0.5 }}>
                        {dotColor && (
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: dotColor,
                              flexShrink: 0
                            }}
                          />
                        )}
                        <Stack spacing={0.15} sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {pkg.title}
                          </Typography>
                          {pkg.workflowStepName && (
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {pkg.workflowStepName}
                            </Typography>
                          )}
                        </Stack>
                        <Chip label={commentCount} size="small" variant="outlined" sx={{ height: 22, flexShrink: 0 }} />
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, px: 1.25, pb: 1.25 }}>
                      <CommentsSection
                        compact
                        comments={pkg.comments ?? []}
                        onAddComment={(body, mentionedUserIds) =>
                          handleAddPackageComment(pkg.workflowPackageId, body, mentionedUserIds)
                        }
                        onResolveComment={handleResolveComment}
                        onArchiveComment={handleArchiveComment}
                        showArchived={showArchived}
                        onShowArchivedChange={handleShowArchivedChange}
                      />
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </>
          )}
        </>
      )}
    </Stack>
  );
};

export default ContentCommentsPanel;
