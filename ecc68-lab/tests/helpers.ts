import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function makeTempLabEnv(): { dataDir: string; workspacesDir: string; dbPath: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc68-'));
  const dataDir = path.join(base, 'data');
  const workspacesDir = path.join(base, 'workspaces');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspacesDir, { recursive: true });
  process.env.ECC68_DATA_DIR = dataDir;
  process.env.ECC68_WORKSPACES_DIR = workspacesDir;
  process.env.ECC68_DB_PATH = path.join(dataDir, 'test.sqlite');
  process.env.ECC68_CONCURRENCY = '2';
  process.env.ECC68_MAX_STEPS = '8';
  process.env.ECC68_TASK_TIMEOUT_MS = '30000';
  // Ensure live model blocked unless test sets URL
  delete process.env.ECC68_MODEL_URL;
  return { dataDir, workspacesDir, dbPath: process.env.ECC68_DB_PATH };
}

export function fixturesRoot(): string {
  return path.join(root, 'fixtures');
}

export async function waitForTask(
  getStatus: () => { status: string },
  timeoutMs = 20_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = getStatus().status;
    if (s === 'completed' || s === 'failed' || s === 'cancelled') return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout waiting for task');
}

export function seedWorkspace(workspacesDir: string, workspaceId: string, files: Record<string, string>): string {
  const ws = path.join(workspacesDir, workspaceId);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(ws, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return ws;
}
