# F15 — Agent Scheduler & Notifications

> Cron-based AI agent execution with notifications and run history.

## Problem

AI agents can be triggered manually from the admin UI, but there is no reliable scheduling system. The current scheduler in `packages/cms-admin/src/lib/scheduler.ts` handles basic daily/weekly schedules but lacks cron expression support, notification on completion, detailed run history with output logs, and queue management.

## Solution

Enhance the existing scheduler with cron expression support, richer run history, notification dispatch on completion/failure, and a queue for concurrent run management.

## Technical Design

### Enhanced Scheduler

```typescript
// packages/cms-admin/src/lib/scheduler.ts — extend existing

export interface ScheduleConfig {
  enabled: boolean;
  frequency: 'manual' | 'daily' | 'weekly' | 'cron';
  time: string;           // HH:MM for daily/weekly
  cronExpression?: string; // e.g. "0 9 * * 1-5" for weekdays at 9am
  timezone?: string;       // default: 'Europe/Copenhagen'
}

export interface AgentRun {
  id: string;
  agentId: string;
  agentName: string;
  trigger: 'scheduled' | 'manual';
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  output: {
    documentsCreated: number;
    documentsUpdated: number;
    tokensUsed: number;
    costUsd: number;
    logs: string[];        // step-by-step log messages
    errors: string[];
  };
}
```

### Run Queue

```typescript
// packages/cms-admin/src/lib/agent-queue.ts

export class AgentQueue {
  private running: Map<string, AgentRun> = new Map();
  private maxConcurrent = 2;

  async enqueue(agentId: string, trigger: 'scheduled' | 'manual'): Promise<AgentRun>;
  async getRunning(): Promise<AgentRun[]>;
  async getHistory(limit?: number): Promise<AgentRun[]>;
  async cancelRun(runId: string): Promise<void>;
}
```

### Storage

- Run history: `<dataDir>/agent-runs.jsonl` (append-only, one JSON per line)
- Queue state: in-memory (runs are short-lived)

### Notification Integration

On run completion/failure, dispatch via F13 notification channels (if configured) or fall back to console log.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/agents/[id]/run` | Manual trigger |
| `GET` | `/api/admin/agents/runs` | List recent runs |
| `GET` | `/api/admin/agents/runs/[id]` | Get run details with logs |
| `POST` | `/api/admin/agents/runs/[id]/cancel` | Cancel a running agent |
| `GET` | `/api/admin/agents/queue` | Get queue status |

### Admin UI Enhancements

- Agent list page: show next scheduled run time, last run status
- Run history page: table with status, duration, documents created, cost
- Run detail page: step-by-step logs, errors, output documents
- Manual trigger button with "Running..." spinner

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/scheduler.ts` — extend with cron expression support
- `packages/cms-admin/src/lib/agent-queue.ts` — new queue module
- `packages/cms-admin/src/app/api/admin/agents/runs/` — new run history endpoints
- `packages/cms-admin/src/app/admin/agents/runs/page.tsx` — new run history UI
- `packages/cms-admin/package.json` — add `cron-parser` dependency

### Blast radius
- Scheduler is central to all background tasks — changes must not break existing daily/weekly schedules
- Agent runner integration affects all agent execution

### Breaking changes
- `ScheduleConfig` interface extended — existing configs need `frequency: 'daily'`/`'weekly'` mapping

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Cron expression parsing works for common patterns
- [ ] Concurrent agent runs limited to 2
- [ ] Run history logs stored and queryable
- [ ] Manual trigger works alongside scheduled runs

## Implementation Steps

1. Add cron expression parsing using `cron-parser` npm package
2. Extend `ScheduleConfig` with `cronExpression` and `timezone` fields
3. Create `packages/cms-admin/src/lib/agent-queue.ts` with concurrency control
4. Extend run history storage with detailed output logs
5. Update scheduler tick to evaluate cron expressions
6. Add notification dispatch on run completion/failure (integrate with F13 if available)
7. Create run history API endpoints
8. Build run history UI at `packages/cms-admin/src/app/admin/agents/runs/page.tsx`
9. Build run detail page showing logs and output
10. Add "Cancel" button for running agents

## Dependencies

- Existing scheduler at `packages/cms-admin/src/lib/scheduler.ts`
- Existing agent runner at `packages/cms-admin/src/lib/agent-runner.ts`
- F13 (Notification Channels) — optional, for sending completion notifications

## Effort Estimate

**Medium** — 3-4 days
