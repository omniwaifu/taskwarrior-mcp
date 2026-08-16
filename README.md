# TaskWarrior MCP Server

MCP server that wraps TaskWarrior command-line tool. Provides 22 tools for task management, GTD workflow, and habit tracking.

## Tools

### Basic Task Operations
- `add_task` - Create task. Supports GTD fields (context, energy, scheduled, wait, depends) and recurring tasks (recur)
- `modify_task` - Update task attributes
- `mark_task_done` - Complete task by UUID
- `delete_task` - Delete task by UUID
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
- `process_inbox` - Get tasks tagged +inbox for processing
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

- Node.js 18+ for runtime
- Bun 1.3+ for development workflows
- TaskWarrior installed and available as `task`

## Install

```bash
bun install
bun run build
```

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

The bundle packages the MCP server, but it does not bundle TaskWarrior itself. Users still need `task` installed on the host machine. For non-default setups, the MCPB manifest exposes optional `TASK_BIN` and `TASKRC` settings.

## Response Format

All tools return MCP standard format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"tasks\": [...], \"metadata\": {...}, \"insights\": {...}}"
    }
  ]
}
```

GTD tools return enriched responses with:
- `tasks` - Array of task objects
- `metadata` - Counts (total, actionable, blocked, waiting, completed)
- `insights` - Summary, recommendations, warnings
- `groups` - Tasks grouped by project/context/frequency
- `relationships` - Dependency chains (where applicable)

## GTD Features

### Task Fields
- `scheduled` - Date to start work
- `wait` - Hide until date (deferred)
- `until` - Task expires after date
- `context` - GTD context (@home, @work, @phone)
- `energy` - Energy level required (H/M/L)
- `depends` - Array of task UUIDs this depends on
- `parent` - Parent task UUID
- `recur` - Recurrence pattern (daily, weekly, monthly, etc.)
- `tags` - Letters, digits, `_` and `-`. Tag writes use Taskwarrior's `tags:` attribute and tag
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

TaskWarrior creates template task (status:recurring) that generates instances. Use `get_recurring_tasks` to see completion rates and streaks.

## Development

```bash
bun run typecheck  # Type check source
bun run lint       # Lint source
bun run test       # Run integration tests against disposable Taskwarrior data
bun run build      # Build dist/
bun run check      # Run typecheck, lint, tests, and build
```
