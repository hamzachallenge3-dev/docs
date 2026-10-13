import fs from 'node:fs';
import path from 'node:path';
import { ROOT, modelConfigured } from '../config.js';
import catalogJson from './catalog.json' with { type: 'json' };

export interface AgentDef {
  id: string;
  pack: string;
  category: string;
  description: string;
  tools: string[];
  profile?: string;
  upstream?: string;
  model_ready: boolean;
  tested: boolean;
}

const catalog = catalogJson as AgentDef[];

export const PACKS = [
  {
    id: 'hub',
    name: 'Hamza Agent Hub Boss',
    description: 'Meta orchestrator that differentiates work across all packs',
  },
  {
    id: 'desk',
    name: 'Automation Desk',
    description: 'imdifferent01 desk tools + Inbox/Weekly/Meeting workflows (live twin of desk.imdifferent01.com)',
  },
  {
    id: 'ecc68',
    name: 'ECC 68',
    description: '68 ECC specialist coding agents with chief-of-staff routing',
  },
  {
    id: 'forge',
    name: 'Cross-Forge Intelligence',
    description: 'Forge detect, GitHub tricks, agent/skill/MCP mining from Hamza plugin-builder handoff',
  },
] as const;

export function listAgents(pack?: string): AgentDef[] {
  const ready = modelConfigured();
  return catalog
    .filter((a) => !pack || a.pack === pack)
    .map((a) => ({ ...a, model_ready: ready }));
}

export function getAgent(id: string): AgentDef | null {
  return listAgents().find((a) => a.id === id) ?? null;
}

export function loadRoleInstructions(agentId: string): string {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`unknown agent: ${agentId}`);
  const parts: string[] = [`# ${agent.id}\nPack: ${agent.pack}\n${agent.description}\n`];
  if (agent.upstream) {
    const p = path.join(ROOT, agent.upstream);
    if (fs.existsSync(p)) parts.push(fs.readFileSync(p, 'utf8').slice(0, 20_000));
  }
  if (agent.profile) {
    const p = path.join(ROOT, agent.profile);
    if (fs.existsSync(p)) parts.push(fs.readFileSync(p, 'utf8').slice(0, 8_000));
  }
  // Pack-local markdown agent briefs
  const brief = path.join(ROOT, 'packs', agent.pack, 'agents', `${agent.id}.md`);
  if (fs.existsSync(brief)) parts.push(fs.readFileSync(brief, 'utf8'));
  return parts.join('\n---\n');
}

export function assertCatalog(): void {
  const ids = catalog.map((a) => a.id);
  if (ids.length < 70) throw new Error(`expected >=70 agents (hub+desk+forge+ecc68), got ${ids.length}`);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate agent ids');
  const packs = new Set(catalog.map((a) => a.pack));
  for (const required of ['hub', 'desk', 'ecc68', 'forge']) {
    if (!packs.has(required)) throw new Error(`missing pack: ${required}`);
  }
  const ecc = catalog.filter((a) => a.pack === 'ecc68');
  if (ecc.length !== 68) throw new Error(`ecc68 pack must have 68 agents, got ${ecc.length}`);
}
