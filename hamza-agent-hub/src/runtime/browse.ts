import { listAgents, PACKS, getAgent, type AgentDef } from './registry.js';
import { loadTools13Manifest } from '../packs/tools13/registry.js';
import { scoreAllAgents } from './boss.js';
import { sandboxToolsEnabled } from '../tools/sandbox.js';

/** MCP tools exposed by this one plugin (stdio / base HTTP surface). */
export const MCP_SURFACE_TOOLS = [
  'hub_health',
  'hub_edge_health',
  'hub_tools13_capabilities',
  'n8n_workflow_validate',
  'context_compact',
  'html_extract_links',
  'hub_list_packs',
  'hub_list_agents',
  'hub_full_roster',
  'hub_agent_browse',
  'hub_freellmapi_status',
  'hub_freellmapi_chat',
  'hub_boss_route',
  'hub_tools13_lookup',
  'run_agent',
  'task_status',
  'task_result',
  'cancel_task',
  'clean_leads',
  'sheets_to_json',
  'extract_contacts',
  'seo_audit_html',
  'forge_detect',
  'github_url_tricks',
  'agent_mining_queries',
] as const;

/** Extra tools only on authenticated HTTP (Worker HUB_SECRET path → hub.py). */
export const SANDBOX_MCP_TOOLS = ['run_command'] as const;

export interface BrowseOptions {
  query?: string;
  pack?: string;
  category?: string;
  limit?: number;
  include_tools13?: boolean;
  include_mcp?: boolean;
}

export interface BrowseHit {
  kind: 'agent' | 'tools13' | 'mcp_tool' | 'pack';
  id: string;
  pack?: string;
  category?: string;
  description: string;
  tools?: string[];
  score: number;
}

function haystack(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function scoreText(query: string, text: string): number {
  if (!query.trim()) return 1;
  const q = query.toLowerCase().trim();
  const tokens = q.split(/[^a-z0-9\u0600-\u06ff.+_-]+/).filter((t) => t.length >= 2);
  let score = 0;
  if (text.includes(q)) score += 20;
  for (const t of tokens) {
    if (text.includes(t)) score += 3;
  }
  return score;
}

/**
 * Browse everything in the one plugin: packs, agents, tools13, MCP surface.
 * Empty query returns the full catalog (capped by limit for agents detail).
 */
export function browseEverything(opts: BrowseOptions = {}): {
  query: string;
  total_agents: number;
  packs: typeof PACKS;
  counts: Record<string, number>;
  hits: BrowseHit[];
  ranked_for_query: Array<{ agent_id: string; pack: string; score: number }>;
} {
  const query = opts.query?.trim() || '';
  const limit = Math.min(Math.max(opts.limit ?? (query ? 40 : 200), 1), 500);
  const includeTools13 = opts.include_tools13 !== false;
  const includeMcp = opts.include_mcp !== false;

  const agents = listAgents(opts.pack).filter((a) =>
    opts.category ? a.category.toLowerCase() === opts.category.toLowerCase() : true
  );

  const counts: Record<string, number> = {};
  for (const a of listAgents()) counts[a.pack] = (counts[a.pack] || 0) + 1;

  const hits: BrowseHit[] = [];

  // Packs
  for (const p of PACKS) {
    if (opts.pack && p.id !== opts.pack) continue;
    const text = haystack([p.id, p.name, p.description]);
    const score = query ? scoreText(query, text) : 1;
    if (!query || score > 0) {
      hits.push({
        kind: 'pack',
        id: p.id,
        description: `${p.name}: ${p.description}`,
        score,
      });
    }
  }

  // Agents
  for (const a of agents) {
    const text = haystack([a.id, a.pack, a.category, a.description, ...(a.tools || [])]);
    const score = query ? scoreText(query, text) : 1;
    if (!query || score > 0) {
      hits.push({
        kind: 'agent',
        id: a.id,
        pack: a.pack,
        category: a.category,
        description: a.description,
        tools: a.tools,
        score,
      });
    }
  }

  // Tools13 manifest entries
  if (includeTools13) {
    for (const t of loadTools13Manifest()) {
      const text = haystack([
        t.id,
        t.name,
        t.category,
        t.source,
        t.note,
        t.type,
        t.plugin_id || '',
      ]);
      const score = query ? scoreText(query, text) : 1;
      if (!query || score > 0) {
        hits.push({
          kind: 'tools13',
          id: t.id,
          pack: 'tools13',
          category: t.category,
          description: `${t.name} — ${t.note || t.source}`,
          score,
        });
      }
    }
  }

  // MCP surface
  if (includeMcp) {
    const surface = sandboxToolsEnabled()
      ? [...MCP_SURFACE_TOOLS, ...SANDBOX_MCP_TOOLS]
      : [...MCP_SURFACE_TOOLS];
    for (const name of surface) {
      const text = haystack([name, 'mcp', 'tool']);
      const score = query ? scoreText(query, text) : 1;
      if (!query || score > 0) {
        hits.push({
          kind: 'mcp_tool',
          id: name,
          pack: 'hub',
          category: 'mcp',
          description: `MCP surface tool: ${name}`,
          score,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  const ranked = query
    ? scoreAllAgents(query)
        .filter((r) => r.score > 0)
        .slice(0, 12)
        .map((r) => ({ agent_id: r.agent.id, pack: r.agent.pack, score: r.score }))
    : [];

  return {
    query: query || '*',
    total_agents: listAgents().length,
    packs: PACKS,
    counts,
    hits: hits.slice(0, limit),
    ranked_for_query: ranked,
  };
}

export function browseAgentDetail(agentId: string): {
  agent: AgentDef | null;
  directory_line: string | null;
} {
  const agent = getAgent(agentId);
  if (!agent) return { agent: null, directory_line: null };
  return {
    agent,
    directory_line: `${agent.id} [${agent.pack}/${agent.category}]: ${agent.description}`,
  };
}
