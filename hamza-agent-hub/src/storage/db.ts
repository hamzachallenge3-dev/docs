import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { redactSecrets } from '../security/redact.js';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskRow {
  id: string;
  agent_id: string;
  workspace_id: string;
  idempotency_key: string;
  task: string;
  status: TaskStatus;
  progress: number;
  progress_message: string;
  output: string | null;
  error: string | null;
  evidence: string | null;
  tool_log: string | null;
  artifacts: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      progress_message TEXT NOT NULL DEFAULT '',
      output TEXT, error TEXT, evidence TEXT, tool_log TEXT, artifacts TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      started_at INTEGER, finished_at INTEGER,
      UNIQUE(agent_id, workspace_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function insertTask(row: TaskRow): TaskRow {
  getDb()
    .prepare(
      `INSERT INTO tasks (id,agent_id,workspace_id,idempotency_key,task,status,progress,progress_message,output,error,evidence,tool_log,artifacts,created_at,updated_at,started_at,finished_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      row.id, row.agent_id, row.workspace_id, row.idempotency_key, row.task, row.status,
      row.progress, row.progress_message, row.output, row.error, row.evidence, row.tool_log,
      row.artifacts, row.created_at, row.updated_at, row.started_at, row.finished_at
    );
  return getTask(row.id)!;
}

export function findByIdempotency(agentId: string, workspaceId: string, key: string): TaskRow | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM tasks WHERE agent_id=? AND workspace_id=? AND idempotency_key=?`)
      .get(agentId, workspaceId, key) as TaskRow | undefined) ?? null
  );
}

export function getTask(id: string): TaskRow | null {
  return (getDb().prepare(`SELECT * FROM tasks WHERE id=?`).get(id) as TaskRow | undefined) ?? null;
}

export function updateTask(id: string, patch: Partial<TaskRow>): TaskRow {
  const current = getTask(id);
  if (!current) throw new Error(`task not found: ${id}`);
  const next = { ...current, ...patch, updated_at: Date.now() };
  getDb()
    .prepare(
      `UPDATE tasks SET status=?, progress=?, progress_message=?, output=?, error=?, evidence=?, tool_log=?, artifacts=?, updated_at=?, started_at=?, finished_at=? WHERE id=?`
    )
    .run(
      next.status, next.progress, next.progress_message, next.output, next.error, next.evidence,
      next.tool_log, next.artifacts, next.updated_at, next.started_at, next.finished_at, id
    );
  return getTask(id)!;
}

export function appendEvent(taskId: string, kind: string, payload: unknown): void {
  getDb()
    .prepare(`INSERT INTO events (task_id, kind, payload, created_at) VALUES (?,?,?,?)`)
    .run(taskId, kind, redactSecrets(payload), Date.now());
}

export function listEvents(taskId: string) {
  return getDb()
    .prepare(`SELECT id, kind, payload, created_at FROM events WHERE task_id=? ORDER BY id ASC`)
    .all(taskId) as Array<{ id: number; kind: string; payload: string; created_at: number }>;
}

export function claimNextQueued(): TaskRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM tasks WHERE status='queued' ORDER BY created_at ASC LIMIT 1`)
    .get() as TaskRow | undefined;
  if (!row) return null;
  const now = Date.now();
  const result = getDb()
    .prepare(`UPDATE tasks SET status='running', started_at=?, updated_at=?, progress_message='claimed' WHERE id=? AND status='queued'`)
    .run(now, now, row.id);
  if (result.changes === 0) return null;
  return getTask(row.id);
}

export function requeueInterrupted(): number {
  return Number(
    getDb()
      .prepare(`UPDATE tasks SET status='queued', progress_message='requeued after restart', updated_at=? WHERE status='running'`)
      .run(Date.now()).changes ?? 0
  );
}
