import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertCatalog, listAgents, PACKS } from '../src/runtime/registry.js';
import { planWithBoss } from '../src/runtime/boss.js';
import { cleanLeads, sheetsToJson, extractContacts } from '../src/packs/desk/tools.js';
import { forgeDetect, githubUrlTricks } from '../src/packs/forge/tools.js';

function tempEnv() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hah-'));
  process.env.HAH_DATA_DIR = path.join(base, 'data');
  process.env.HAH_WORKSPACES_DIR = path.join(base, 'workspaces');
  process.env.HAH_DB_PATH = path.join(base, 'data', 't.sqlite');
  delete process.env.HAH_MODEL_URL;
  fs.mkdirSync(process.env.HAH_DATA_DIR, { recursive: true });
  fs.mkdirSync(process.env.HAH_WORKSPACES_DIR, { recursive: true });
}

describe('hamza agent hub', () => {
  beforeEach(tempEnv);
  afterEach(async () => {
    const { stopQueue } = await import('../src/runtime/queue.js');
    const { closeDb } = await import('../src/storage/db.js');
    stopQueue();
    closeDb();
  });

  it('catalog has hub+desk+forge+68 ecc agents', () => {
    assertCatalog();
    expect(PACKS).toHaveLength(4);
    expect(listAgents()).toHaveLength(77);
    expect(listAgents('ecc68')).toHaveLength(68);
    expect(listAgents('desk')).toHaveLength(4);
    expect(listAgents('forge')).toHaveLength(4);
    expect(listAgents('hub').map((a) => a.id)).toContain('hub-boss');
  });

  it('boss routes desk work to desk pack', () => {
    const plan = planWithBoss('Clean leads and dedupe email list from inbox CSV');
    expect(plan.orchestrator).toBe('hub-boss');
    expect(plan.pack).toBe('desk');
    expect(plan.primary.startsWith('desk-')).toBe(true);
  });

  it('boss routes security coding work to ecc68', () => {
    const plan = planWithBoss('Security review login.py for SQL injection');
    expect(plan.primary).toBe('ecc-security-reviewer');
    expect(plan.pack).toBe('ecc68');
  });

  it('desk tools match Automation Desk contracts', () => {
    const cleaned = cleanLeads({ text: 'A@X.com write to b@x.com and a@x.com' });
    expect(cleaned.emails).toEqual(['a@x.com', 'b@x.com']);
    expect(cleaned.duplicates_removed).toBe(1);
    const rows = sheetsToJson({ csv: 'week,value\n1,10\n2,14' });
    expect(rows.count).toBe(2);
    expect(rows.rows[1]).toEqual({ week: '2', value: '14' });
    const contacts = extractContacts({
      html: 'Mail me at hi@imdifferent01.com or https://github.com/hamza',
    });
    expect(contacts.emails).toContain('hi@imdifferent01.com');
    expect(contacts.social.some((s) => s.includes('github.com'))).toBe(true);
  });

  it('forge detect + github tricks work', () => {
    expect(forgeDetect('https://github.com/foo/bar').forge).toBe('github');
    expect(forgeDetect('https://gitlab.com/foo/bar').forge).toBe('gitlab');
    const tricks = githubUrlTricks('https://github.com/foo/bar');
    expect(tricks.gitingest).toContain('foo/bar');
  });

  it('end-to-end hub-boss mission completes with routing artifact', async () => {
    const { startQueue, enqueueAgentTask } = await import('../src/runtime/queue.js');
    const { getTask } = await import('../src/storage/db.js');
    startQueue();
    const { task_id } = enqueueAgentTask({
      agent_id: 'hub-boss',
      task: 'Weekly report from CSV then security review of login.py',
      workspace_id: 'mission1',
      idempotency_key: 'hub-mission-1',
    });
    for (let i = 0; i < 200; i++) {
      const t = getTask(task_id);
      if (t && ['completed', 'failed', 'cancelled'].includes(t.status)) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    const done = getTask(task_id)!;
    expect(done.status).toBe('completed');
    const planPath = path.join(process.env.HAH_WORKSPACES_DIR!, 'mission1', 'artifacts', 'hub-routing-plan.json');
    expect(fs.existsSync(planPath)).toBe(true);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    expect(plan.primary).toBeTruthy();
    expect(plan.decomposition.length).toBeGreaterThan(0);
  });
});
