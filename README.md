# TaskWarrior MCP Server

MCP server that wraps TaskWarrior command-line tool. Provides 27 tools for task management, GTD workflow, and habit tracking.

## Tools

### Basic Task Operations
- `add_task` - Create task. Supports GTD fields (context, energy, scheduled, wait, depends) and recurring tasks (recur)
- `modify_task` - Update task attributes
- `mark_task_done` - Complete task by UUID
- `delete_task` - Delete task by UUID
- `query_tasks` - Filter and sort tasks with cursor pagination
- `get_server_status` - Check runtime, executable, and configuration
- `list_tasks` - Query tasks with filters (status, project, tags, dates)
- `get_task_details` - Get single task by UUID
- `start_task` - Start timer on task
- `stop_task` - Stop timer on task
- `add_annotation` - Add note to task
- `remove_annotation` - Remove note from task

### Dependencies
- `add_dependency` - Make task A depend on task B
- `remove_dependency` - Remove dependency link

### GTD Workflow
- `get_next_actions` - Filter actionable tasks by context, energy level, time available
- `quick_capture` - Capture a thought in the inbox
- `process_inbox` - Page through tasks tagged +inbox for processing
- `process_inbox_item` - Clarify an item as a next action, project, waiting, someday, reference, or deletion
- `get_task_tree` - Navigate project hierarchy with depth and node limits
- `get_waiting_for` - Get delegated/waiting tasks, grouped by blocker/date/project
- `get_blocked_tasks` - Get tasks with unmet dependencies
- `get_project_status` - Project metrics: next actions, completion %, staleness
- `weekly_review` - GTD review data: inbox, completed, stalled projects, habits
- `get_someday_maybe` - Get tasks tagged +someday

### Batch Operations
- `create_project_tree` - Create project with multiple tasks and dependencies in one call
- `batch_modify_tasks` - Apply same modifications to multiple tasks

### Habits/Recurring Tasks
- `get_recurring_tasks` - Get recurring tasks with completion stats, streaks, frequency

## Requirements

- Node.js 22+ for runtime (use a supported LTS release)
- Bun 1.3+ for development workflows
- TaskWarrior installed and available as `task`

## Install

```bash
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run doctor
```

`doctor` (also `node dist/index.js --doctor`) checks Node, the Taskwarrior executable,
and configuration readability. It exits with code 1 on failure and gives setup guidance.
It does not export task records, test database integrity, or verify write access.
Install Taskwarrior separately and finish its first-run setup in a terminal.
Use `TASK_BIN` for a custom executable and `TASKRC` for a custom configuration;
set them in your MCP client’s `env` when needed. `--help` lists CLI options.

## Run

```bash
bun run start
```

Or configure in your MCP client settings:

```json
{
  "mcpServers": {
    "taskwarrior": {
      "command": "node",
      "args": ["/path/to/taskwarrior-mcp/dist/index.js"]
    }
  }
}
```

## Claude Desktop Bundle

This repo now includes an MCPB manifest for Claude Desktop.

```bash
bun run mcpb:validate
bun run mcpb:pack
```

That produces `dist/taskwarrior-mcp.mcpb`.

The bundle includes explicit ES module metadata and targets Node 22 or newer.
Node 18 and 20 are no longer supported.

The bundle packages the MCP server, but it does not bundle TaskWarrior itself. Users still need `task` installed on the host machine. For non-default setups, the MCPB manifest exposes optional `TASK_BIN` and `TASKRC` settings.

## Response Format

All registered tools advertise an output schema and return `structuredContent`:

```json
{
  "structuredContent": {
    "status": "success",
    "data": { "tasks": [], "page": { "total": 0, "returned": 0, "has_more": false } }
  },
  "content": [{ "type": "text", "text": "{\"tasks\":[],\"page\":{\"total\":0,\"returned\":0,\"has_more\":false}}" }]
}
```

`data` contains the tool's task, array, or report. Legacy text payloads remain available;
legacy mutation envelopes are unwrapped in structured `data`. Execution failures set
MCP `isError:true`, `status:"error"`, and `error:{code,message}`. Partial operations
retain their progress in `data`; inspect it before retrying. Invalid MCP inputs are
reported by the SDK before execution.

GTD tools return enriched responses with:
- `tasks` - Array of task objects
- `metadata` - Counts (total, actionable, blocked, waiting, completed)
- `insights` - Summary, recommendations, warnings
- `groups` - Tasks grouped by project/context/frequency
- `relationships` - Dependency chains (where applicable)

## GTD Features

### Capture, clarify, and act

1. Call `quick_capture` with `{"description":"Think about proposal"}`.
2. Use its returned UUID in `process_inbox_item`:
   `{"uuid":"<UUID>","action":"next_action","description":"Draft proposal outline","context":"@work","estimated_minutes":15}`.
3. Call `get_next_actions` with `{"context":"@work","max_minutes":15}`.

Clarification preserves unrelated tags and removes `inbox` and incompatible workflow
tags. `project` requires a project name and turns the existing item into a project root;
`create_project_tree` creates a new root with children and dependencies. `someday` and
`reference` remain stored but are excluded from next actions. `delete` marks the item
deleted. An optional `note` adds an annotation after classification; a failure reports
that classification already succeeded.

Delegate with `process_inbox_item` using
`{"uuid":"<UUID>","action":"waiting","waiting_for":"Alex","follow_up":"tomorrow"}`.
`waiting_for` records the person or external factor; `follow_up` is the reminder date.
Passing that date never makes the task actionable automatically. `get_waiting_for`
supports recipient/project filters and `follow_up_due:true`; `weekly_review` includes
`groups.follow_ups_due`. Clarify as `next_action` to clear delegation, or explicitly
clear `waiting_for` and `follow_up` with `modify_task`. Native `wait` still means defer
until a date and is separate from delegation.

### Queries and project navigation

`query_tasks` accepts status, project, tags, dates, context, priority, waiting_for,
parent, active, and blocked filters. Project filters include subprojects. Sort by
urgency (default descending), configured priority (default highest first), due, entry,
modified, description, or project. `sort_order` can be `asc` or `desc`; missing values
come last and UUID breaks ties. `list_tasks` retains its raw-array interface.

`query_tasks`, `process_inbox`, and `get_next_actions` return `page` with `total`,
`returned`, `has_more`, and optional `next_cursor`. The default page size is 50, with
`limit` from 1 to 200. Repeat the same filters with `cursor: next_cursor` for the next
page. Changed results or filters invalidate the cursor: restart without it. These
queries bound returned records but still read matching data to calculate totals;
they are not database snapshots. Groupings and insights describe the returned page
unless noted otherwise; inbox processing insights cover the whole inbox.

Call `get_task_tree` with `{"project":"Launch"}` or `{"uuid":"<ROOT_UUID>"}`.
Nodes contain the task, depth, child UUIDs, and unresolved dependency UUIDs. Counts
apply to returned nodes, including completed/deleted history. Default limits are
`depth:10` and `max_nodes:200` (maximum 100 and 500). If `metadata.truncated` is true,
continue from a child UUID. Cycles and missing/out-of-scope parents produce warnings.
Project hierarchy uses `mcp_parent`, independently of recurrence.

### Task Fields
- `estimated_minutes` - Explicit integer duration estimate, from 0 to 525600 minutes
- `waiting_for` - Delegation recipient or external factor
- `follow_up` - Date to review a delegated task
- `scheduled` - Date to start work
- `wait` - Hide until date (deferred)
- `until` - Task expires after date
- `context` - GTD context (@home, @work, @phone)
- `energy` - Energy level required (H/M/L)
- `depends` - Array of task UUIDs this depends on
- `parent` (write requests) - Project parent UUID, stored as the `mcp_parent` user-defined attribute. Taskwarrior’s exported `parent` field is reserved for recurrence templates.
- `recur` - Recurrence pattern (daily, weekly, monthly, etc.)
- `tags` - Unicode letters, combining marks, digits, `_` and `-`. Tag writes use Taskwarrior's `tags:` attribute and tag
  filters use `tags.has:`, because the `+tag` shorthand rejects hyphens and silently rewrites the
  description instead.

### Recurring Tasks
Set `recur` with `due` to create habits:
```json
{
  "description": "Take vitamins",
  "recur": "daily",
  "due": "today",
  "context": "@morning"
}
```

TaskWarrior creates a template task (status:recurring) that generates instances.
`get_recurring_tasks` calculates statistics from exported instances and their due dates,
not the template mask. Future unfinished instances do not reduce completion rates or
break streaks. An unfinished or deleted occurrence counts as missed once its due time
passes. Completed occurrences count even when completed early. `total_instances`
includes future occurrences; `evaluated_instances` is the completion-rate denominator.
Averages include only habits with evaluated occurrences. Missing/purged history cannot be reconstructed. `include_completed:true` additionally
includes completed templates; ordinary completed instances remain statistics, not templates.

## Configuration and write behavior

`context`, `energy`, `waiting_for`, and `mcp_parent` are string user-defined attributes
(UDAs); `estimated_minutes` is numeric and `follow_up` is a date.
The server supplies their type definitions as command-local overrides, so fresh
Taskwarrior installations store them correctly without changing your taskrc.
Other UDA settings, including configured allowed values, still apply. Energy filters
use `H`, `M`, and `L`. To display these fields in your own CLI reports, add the same
UDA definitions to your taskrc and configure the report columns:

```ini
uda.context.type=string
uda.energy.type=string
uda.mcp_parent.type=string
uda.estimated_minutes.type=numeric
uda.waiting_for.type=string
uda.follow_up.type=date
```

Use an empty string in `modify_task` or `batch_modify_tasks` to clear dates,
context, energy, project, priority, parent, waiting_for, or follow_up. Use
`estimated_minutes:null` to clear the estimate. Batch edits accept the same fields as
individual edits, including dependency changes and parent. Omitted fields remain unchanged. Taskwarrior validates
field combinations; a failed dependency replacement does not apply the other
modifications in that same command.

Project creation validates dependency indices and cycles before writing. It uses
UUID output, so `verbose=nothing` works. Project and batch operations are not
transactions: failures return MCP `isError:true` and identify completed work where
available. Inspect returned UUIDs before retrying; do not blindly recreate tasks.
The project root uses `project_root`, and children use `mcp_parent`, leaving native
recurrence relationships intact.

Tool calls are serialized within one server to prevent its read-modify-write
operations from interleaving. Other Taskwarrior processes can still edit the same
records concurrently. Subprocesses run without a shell, asynchronously, with closed
stdin, a 10 MiB output limit and a 30-second timeout. Set `TASK_TIMEOUT_MS` to an
integer from 1 to 300000 to adjust the timeout. Interactive confirmations are not
possible; `delete_task` supports `skipConfirmation:true` for an authorized deletion.

The stdio transport caps buffered input at 1 MiB; validation also caps combined
input elements at 25,000 and the server queues at most 100 tool calls. Task contents
and full command arguments are not routinely logged. Export validation returns an
error for malformed records rather than silently omitting tasks. Existing Unicode
projects/tags and custom priority values are preserved in exports. Writes accept
Unicode letters/digits/combining marks in projects and tags; project names additionally
allow spaces and dots. Custom priority identifiers are passed to Taskwarrior for
validation against its configured values.

Next-action and project/weekly-review counts exclude future scheduled/waiting tasks,
inbox/reference/someday items, project roots, delegated tasks, and unresolved dependencies. Completed/deleted
dependencies do not block tasks. Time filtering uses `estimated_minutes`, falling back to legacy numeric `complexity`
values in minutes. `max_minutes` takes precedence over `time_available`. Unknown
estimates are excluded when a time filter is set unless `include_unestimated:true`.
Urgency is not treated as a duration estimate.

## Development

```bash
bun run typecheck  # Type check source
bun run lint       # Lint source
bun run test       # Run integration tests against disposable Taskwarrior data
bun run build      # Build dist/
bun run check      # Run typecheck, lint, tests, and build
```

Pull requests and pushes to `main` run these checks with Taskwarrior installed,
validate and build the MCPB bundle, then run the stdio schema and task-operation
smoke test against its extracted entry point on Node 24.22.1 and Node 22
on Linux. Build and lint tooling stay on Node 24. Dependencies are audited in a
separate job. Locally, integration tests are skipped if `task` is missing; the command
diagnostic regression tests still run without it.

### Dependency security

Before installing dependencies, review `package.json`, `bun.lock`, registry metadata,
and current advisories. Use `bun install --frozen-lockfile --ignore-scripts`; builds
are explicit commands. Integrity hashes establish artifact consistency, not trust
in package contents.

`bun audit` checks development dependencies as well as the server's dependencies.
The `tmp` override selects the patched 0.2.x release for MCPB's older Inquirer /
`external-editor` chain. A packaging-dependency regression test covers temporary
file creation, editing, cleanup, and rejection of path traversal in file names.
Remove this override once MCPB's dependency chain selects a patched version itself.

As of November 5, 2026, the full audit reports two development-tooling findings:

- [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
  in MCPB 2.1.2's required Zod 3.25.76. MCPB has not released Zod 4 support.
  The server resolves Zod 4.6.7 and applies request-array limits; see
  [the compatibility notes](docs/zod4-experiment.md) for coverage and limitations.
- [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
  in minimatch 10.2.6, used by ESLint and TypeScript ESLint. The advisory requires
  attacker-controlled glob patterns with optimizationLevel >= 2. The patched
  11.0.1 is outside the callers' supported dependency ranges. minimatch is not
  reachable from the server's production dependency graph.

The earlier node-forge finding is patched by the 1.4.2 override. The audit remains
enabled and fails on the current findings. Do not process untrusted packaging
inputs or assume development tooling is safe because it is outside the runtime.
No incompatible major overrides or audit suppressions are applied.
