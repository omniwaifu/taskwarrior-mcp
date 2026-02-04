# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TaskWarrior MCP Server - A Model Context Protocol server that wraps TaskWarrior CLI for AI-assisted task management. Provides 22 MCP tools with GTD (Getting Things Done) workflow support and habit tracking.

**Requirements**: Node.js 18+, TaskWarrior 3.x (accessible as `task` command)

## Commands

```bash
npm run build        # Bundle with esbuild to dist/index.js
npm run typecheck    # TypeScript type checking
npm run watch        # Watch mode for development
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint issues
npm run prepare      # Build + typecheck (runs on install)
npm start            # Run the MCP server
npm test             # Run tests once
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

## Development Workflow: TDD (Test-Driven Development)

All changes should follow the Red-Green-Refactor cycle:

1. **RED**: Write a failing test that describes the expected behavior
2. **GREEN**: Write the minimum code to make the test pass
3. **REFACTOR**: Improve the code while keeping tests green

### Testing Guidelines

- Tests live in `src/**/*.test.ts` alongside the code they test
- Use Vitest for testing (`npm test` or `npm run test:watch`)
- Integration tests that hit real TaskWarrior should clean up after themselves
- Mock `executeTaskWarriorCommandRaw` for unit tests to avoid side effects

## Architecture

### Tool-Based Modular Design

Each of the 22 tools lives in `src/tools/<toolName>/` with:
- `handler.ts` - Implementation that builds TaskWarrior shell commands
- `index.ts` - Re-exports for clean imports

Tools are registered in `src/index.ts` using McpServer from the MCP SDK.

### Core Components

- `src/types/task.ts` - Zod schemas for all request/response types, task validation
- `src/utils/taskwarrior.ts` - Shell command execution via `execSync`, JSON parsing, error handling
- `src/utils/mcpResponseFormat.ts` - Enriched response formatting with metadata and LLM-optimized insights

### Tool Categories

1. **Basic Operations**: addTask, listTasks, getTaskDetails, modifyTask, markTaskDone, deleteTask, startTask, stopTask, addAnnotation, removeAnnotation
2. **Dependencies**: addDependency, removeDependency
3. **GTD Workflow**: getNextActions, processInbox, getWaitingFor, getBlockedTasks, getProjectStatus, weeklyReview, getSomedayMaybe
4. **Habits**: getRecurringTasks
5. **Bulk**: createProjectTree, batchModifyTasks

### Design Patterns

- All task identification uses UUIDs exclusively
- Zod schemas validate all inputs/outputs with passthrough for unknown TaskWarrior fields
- Tools return `EnrichedResponse` with tasks array, metadata, and generated insights
- TaskWarrior commands built as shell strings, executed via `execSync` with 10MB buffer

