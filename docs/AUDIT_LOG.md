# Audit Log

Append-only audit trail for workflow coordination events. Stored in `crafter-workflow`.`wf_audit_log`.

## Purpose

Record **who** did **what**, to **which target**, **when**, with an optional human-readable **note**. The audit log supports compliance visibility and troubleshooting. It does **not** replace Crafter CMS content versioning or Studio's native workflow state history.

## Model: `wf_audit_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | CHAR(36) | Primary key |
| `site_id` | VARCHAR(255) | Crafter site |
| `user_id` | BIGINT | Studio user ID (nullable) |
| `username` | VARCHAR(255) | Studio username at action time |
| `operation` | VARCHAR(64) | Operation code (see below) |
| `target_type` | VARCHAR(64) | `task`, `package`, or `workflow` |
| `target_id` | VARCHAR(1024) | Target entity ID |
| `note` | TEXT | Human-readable description |
| `created_on` | DATETIME | Action timestamp |

### Operations (current)

| Operation | Target type | When recorded |
|-----------|-------------|---------------|
| `task_created` | `task` | Task created |
| `task_modified` | `task` | Task updated, completed/reopened, or archived/restored |
| `package_created` | `package` | WorkflowPackage created |
| `package_step_changed` | `package` | Package moved to a **different** WorkflowStep (reorder within same step is not logged) |
| `package_modified` | `package` | Title, description, due date, attachment changes, or **package archived** (manual or automated) |
| `package_step_action` | `package` | Automated publish/review step action ran (success or failure) |
| `workflow_bypass_acknowledged` | `package` | User acknowledged bypass warning before Studio publish/reject |
| `workflow_bypass_action` | `package` | User completed Studio publish/reject outside workflow step |

### Target types

| Value | Meaning |
|-------|---------|
| `task` | `wf_task.id` |
| `package` | `wf_workflow_package.id` |
| `workflow` | Reserved for future workflow-admin events |

## API

### `audit/list.json`

Paginated, filterable search for site administrators and Project Tools.

| Param | Description |
|-------|-------------|
| `siteId` | Required |
| `username` | Exact username filter |
| `operation` | Exact operation filter |
| `targetType` | `task`, `package`, or `workflow` |
| `targetId` | Exact target ID |
| `q` / `query` | LIKE search on note, username, target_id, operation |
| `from`, `to` | Date range on `created_on` |
| `page` | Page number (default 1) |
| `pageSize` | Page size (default 50, max 200) |

**Response:**

```json
{
  "entries": [
    {
      "id": "uuid",
      "siteId": "workflow",
      "userId": 42,
      "username": "editor",
      "operation": "package_step_changed",
      "targetType": "package",
      "targetId": "package-uuid",
      "note": "Moved package \"Q2 Launch\" from \"Writing\" to \"Legal Review\"",
      "createdOn": "2026-06-02T14:30:00"
    }
  ],
  "total": 120,
  "page": 1,
  "pageSize": 50,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPreviousPage": false
}
```

## UI

**Project Tools → Crafter Workflow → Audit Log** tab provides a filterable table with pagination.

Requires schema version **12** (install/upgrade on the General tab).

## Service layer

- **`AuditLogDao`** — insert, search
- **`AuditLogService`** — `record()`, `search()`
- Wired into **`TaskService`** and **`WorkflowPackageService`** (not REST callers directly)

## Not yet audited

Future candidates:

- WorkflowStep create/rename/delete/reorder (definition JSON changes)
- Workflow admin create/delete
- Comment create/resolve
- Crafter publish/review/reject actions on linked content (separate from `package_step_action` summary)

## Related documents

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
- [API_CONTRACT.md](./API_CONTRACT.md)
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md)
