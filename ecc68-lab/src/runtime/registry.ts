import fs from 'node:fs';
import path from 'node:path';
import { ROOT, modelConfigured } from '../config.js';
import catalogJson from './catalog.json' with { type: 'json' };

export interface AgentDef {
  id: string;
  description: string;
  profile: string;
  upstream: string;
  category: string;
  tools: string[];
  model_ready: boolean;
  tested: boolean;
}

const catalog = catalogJson as AgentDef[];

export function listAgents(): AgentDef[] {
  const ready = modelConfigured();
  return catalog.map((a) => ({
    ...a,
    model_ready: ready,
    tested: Boolean((globalThis as { __ECC68_TESTED__?: Set<string> }).__ECC68_TESTED__?.has(a.id)),
  }));
}

export function getAgent(id: string): AgentDef | null {
  return listAgents().find((a) => a.id === id) ?? null;
}

export function loadRoleInstructions(agentId: string): string {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`unknown agent: ${agentId}`);
  const upstreamPath = path.join(ROOT, agent.upstream);
  const skillPath = path.join(ROOT, agent.profile);
  const parts: string[] = [];
  if (fs.existsSync(upstreamPath)) {
    const body = fs.readFileSync(upstreamPath, 'utf8');
    if (body.includes('# UNAVAILABLE')) {
      parts.push(`Upstream unavailable for ${agentId}. Using local skill wrapper.`);
    } else {
      parts.push(body);
    }
  }
  if (fs.existsSync(skillPath)) {
    parts.push('\n---\nLocal skill wrapper:\n' + fs.readFileSync(skillPath, 'utf8'));
  }
  if (parts.length === 0) {
    throw new Error(`no profile readable for ${agentId}`);
  }
  return parts.join('\n');
}

export function assertExactly68(): void {
  const ids = catalog.map((a) => a.id);
  if (ids.length !== 68) throw new Error(`expected 68 agents, got ${ids.length}`);
  if (new Set(ids).size !== 68) throw new Error('duplicate agent ids');
  for (const a of catalog) {
    const upstream = path.join(ROOT, a.upstream);
    const skill = path.join(ROOT, a.profile);
    if (!fs.existsSync(upstream)) throw new Error(`missing upstream: ${a.upstream}`);
    if (!fs.existsSync(skill)) throw new Error(`missing skill: ${a.profile}`);
  }
}

export function markTested(agentId: string): void {
  const g = globalThis as { __ECC68_TESTED__?: Set<string> };
  if (!g.__ECC68_TESTED__) g.__ECC68_TESTED__ = new Set();
  g.__ECC68_TESTED__.add(agentId);
}
