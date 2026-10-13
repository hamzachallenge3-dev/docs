import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertCatalog, listAgents, PACKS } from '../src/runtime/registry.js';
import { buildBossDirectory, planWithBoss, scoreAllAgents } from '../src/runtime/boss.js';
import { browseEverything, MCP_SURFACE_TOOLS } from '../src/runtime/browse.js';
import { cleanLeads, sheetsToJson, extractContacts } from '../src/packs/desk/tools.js';
import { forgeDetect, githubUrlTricks } from '../src/packs/forge/tools.js';
import { loadTools13Manifest } from '../src/packs/tools13/registry.js';
import { seoAuditHtml } from '../src/packs/tools13/seo.js';

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

  it('catalog has hub+browse+desk+forge+tools13+68 ecc agents', () => {
    assertCatalog();
    expect(PACKS.map((p) => p.id)).toContain('tools13');
    expect(listAgents()).toHaveLength(91);
    expect(listAgents('hub').map((a) => a.id)).toEqual(
      expect.arrayContaining(['hub-boss', 'hub-agent-browse'])
    );
    expect(listAgents('ecc68')).toHaveLength(68);
    expect(listAgents('tools13')).toHaveLength(13);
    expect(loadTools13Manifest()).toHaveLength(13);
  });

  it('hub_agent_browse searches everything in the one plugin', () => {
    const all = browseEverything({ query: '' });
    expect(all.total_agents).toBe(91);
    expect(all.counts.ecc68).toBe(68);
    expect(all.hits.some((h) => h.kind === 'pack' && h.id === 'tools13')).toBe(true);
    expect(all.hits.some((h) => h.kind === 'agent' && h.id === 'hub-agent-browse')).toBe(true);
    expect(all.hits.some((h) => h.kind === 'tools13' && h.id === 'seo-audit')).toBe(true);
    expect(all.hits.some((h) => h.kind === 'mcp_tool' && h.id === 'hub_agent_browse')).toBe(true);
    expect(MCP_SURFACE_TOOLS).toContain('hub_agent_browse');

    const seo = browseEverything({ query: 'SEO audit html' });
    expect(seo.hits.some((h) => h.id === 'tool13-seo-audit' || h.id === 'seo-audit')).toBe(true);
    expect(seo.ranked_for_query[0]?.agent_id).toBe('tool13-seo-audit');

    const security = browseEverything({ query: 'security reviewer', pack: 'ecc68', limit: 20 });
    expect(security.hits.every((h) => h.kind !== 'agent' || h.pack === 'ecc68')).toBe(true);
    expect(security.hits.some((h) => h.id === 'ecc-security-reviewer')).toBe(true);
  });

  it('hub-boss scores the FULL roster (knows everyone)', () => {
    const ranked = scoreAllAgents('anything at all');
    // every non-boss agent is considered
    expect(ranked.length).toBe(listAgents().length - 1);
    const dir = buildBossDirectory();
    for (const a of listAgents()) {
      expect(dir).toContain(a.id);
    }
    const plan = planWithBoss('SEO audit this HTML page title and meta description');
    expect(plan.roster_size).toBe(91);
    expect(plan.known_packs).toEqual(expect.arrayContaining(['hub', 'desk', 'ecc68', 'forge', 'tools13']));
    expect(plan.primary).toBe('tool13-seo-audit');
    expect(planWithBoss('Browse the catalog and list agents for SEO').primary).toBe('hub-agent-browse');
  });

  it('boss routes desk / ecc / tools13 correctly', () => {
    expect(planWithBoss('Clean leads and dedupe email list').primary.startsWith('desk-')).toBe(true);
    expect(planWithBoss('Security review login.py for SQL injection').primary).toBe('ecc-security-reviewer');
    expect(planWithBoss('Prepare lapian film pack frames from video').primary).toBe('tool13-lapian-notes');
  });

  it('desk + forge + seo tools work', () => {
    expect(cleanLeads({ text: 'A@X.com b@x.com a@x.com' }).count).toBe(2);
    expect(sheetsToJson({ csv: 'a,b\n1,2' }).count).toBe(1);
    expect(extractContacts({ html: 'hi@x.com https://github.com/x' }).emails).toContain('hi@x.com');
    expect(forgeDetect('https://github.com/a/b').forge).toBe('github');
    expect(githubUrlTricks('https://github.com/a/b').api).toContain('a/b');
    const seo = seoAuditHtml(
      '<html lang="en"><head><title>Hi</title><meta name="description" content="d"><link rel="canonical" href="https://e.com/"><meta property="og:title" content="Hi"></head><body><h1>One</h1><img alt="x"></body></html>'
    );
    expect(seo.ok).toBe(true);
    expect(seo.basic_technical_score).toBeGreaterThanOrEqual(75);
  });

  it('end-to-end hub-boss mission writes roster + routing artifacts', async () => {
    const { startQueue, enqueueAgentTask } = await import('../src/runtime/queue.js');
    const { getTask } = await import('../src/storage/db.js');
    startQueue();
    const { task_id } = enqueueAgentTask({
      agent_id: 'hub-boss',
      task: 'SEO audit then security review login.py',
      workspace_id: 'mission-tools13',
      idempotency_key: 'hub-mission-tools13',
    });
    for (let i = 0; i < 200; i++) {
      const t = getTask(task_id);
      if (t && ['completed', 'failed', 'cancelled'].includes(t.status)) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    const done = getTask(task_id)!;
    expect(done.status).toBe('completed');
    const ws = path.join(process.env.HAH_WORKSPACES_DIR!, 'mission-tools13', 'artifacts');
    expect(fs.existsSync(path.join(ws, 'hub-routing-plan.json'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'hub-full-roster.md'))).toBe(true);
    const plan = JSON.parse(fs.readFileSync(path.join(ws, 'hub-routing-plan.json'), 'utf8'));
    expect(plan.roster_size).toBe(91);
    const roster = fs.readFileSync(path.join(ws, 'hub-full-roster.md'), 'utf8');
    expect(roster).toContain('tool13-seo-audit');
    expect(roster).toContain('ecc-security-reviewer');
    expect(roster).toContain('desk-lead-cleaner');
    expect(roster).toContain('hub-agent-browse');
  });

  it('end-to-end hub-agent-browse writes browse artifact', async () => {
    const { startQueue, enqueueAgentTask } = await import('../src/runtime/queue.js');
    const { getTask } = await import('../src/storage/db.js');
    startQueue();
    const { task_id } = enqueueAgentTask({
      agent_id: 'hub-agent-browse',
      task: 'browse SEO and security agents',
      workspace_id: 'mission-browse',
      idempotency_key: 'hub-mission-browse-1',
    });
    for (let i = 0; i < 200; i++) {
      const t = getTask(task_id);
      if (t && ['completed', 'failed', 'cancelled'].includes(t.status)) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    const done = getTask(task_id)!;
    expect(done.status).toBe('completed');
    const report = path.join(process.env.HAH_WORKSPACES_DIR!, 'mission-browse', 'artifacts', 'agent-browse.md');
    expect(fs.existsSync(report)).toBe(true);
    expect(fs.readFileSync(report, 'utf8')).toMatch(/Agent browse/i);
  });
});
