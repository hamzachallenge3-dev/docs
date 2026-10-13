import { listAgents, PACKS, type AgentDef } from './registry.js';

export interface HubPlan {
  orchestrator: string;
  pack: string;
  primary: string;
  secondary: string[];
  rationale: string;
  roster_size: number;
  known_packs: string[];
  considered_top: Array<{ agent_id: string; pack: string; score: number }>;
  decomposition: Array<{ agent_id: string; pack: string; subtask: string }>;
}

/** Extra keyword boosts — boss still scores EVERY agent from the full roster. */
const BOOSTS: Array<{ match: RegExp; agent: string; weight: number }> = [
  { match: /seo|meta description|canonical|open.?graph|json-?ld/i, agent: 'tool13-seo-audit', weight: 20 },
  { match: /lapian|film pack|video frame|ffmpeg|subtitle/i, agent: 'tool13-lapian-notes', weight: 20 },
  { match: /nanomuse|nano.?muse/i, agent: 'tool13-nanomuse', weight: 16 },
  { match: /\bn8n\b|workflow library/i, agent: 'tool13-n8n-library', weight: 16 },
  { match: /scrapling|scrape|crawler/i, agent: 'tool13-scrapling', weight: 14 },
  { match: /\bgoose\b|goose cli/i, agent: 'tool13-goose', weight: 14 },
  { match: /headroom|context compression/i, agent: 'tool13-headroom', weight: 14 },
  { match: /agent.?reach|research web/i, agent: 'tool13-agent-reach', weight: 14 },
  { match: /munder|difflin|multi.?agent orchestr/i, agent: 'tool13-munder-difflin', weight: 14 },
  { match: /open generative|ai video|image gen/i, agent: 'tool13-open-generative-ai', weight: 12 },
  { match: /glm-?5\.?3|kimi.?k3/i, agent: 'tool13-glm-5.3-flash', weight: 10 },
  { match: /inbox|lead triage|بريد/i, agent: 'desk-inbox-to-lead', weight: 14 },
  { match: /weekly report|تقرير أسبوعي/i, agent: 'desk-weekly-report', weight: 14 },
  { match: /meeting|action items|محضر|اجتماع/i, agent: 'desk-meeting-to-action', weight: 14 },
  { match: /clean leads|dedupe email/i, agent: 'desk-lead-cleaner', weight: 14 },
  { match: /security|sql injection|xss|أمن/i, agent: 'ecc-security-reviewer', weight: 16 },
  { match: /python|\.py\b|django|fastapi/i, agent: 'ecc-python-reviewer', weight: 12 },
  { match: /typescript|\.ts\b|tsx/i, agent: 'ecc-typescript-reviewer', weight: 12 },
  { match: /react|jsx|next\.js/i, agent: 'ecc-react-reviewer', weight: 12 },
  { match: /github tricks|gitingest|repo intelligence/i, agent: 'forge-github-intelligence', weight: 12 },
  { match: /mine agents|find mcp|skill\.md/i, agent: 'forge-agent-miner', weight: 12 },
  { match: /\bbrowse\b|catalog|directory|list agents|show agents|من هم الوكلاء|تصفح/i, agent: 'hub-agent-browse', weight: 18 },
];

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u0600-\u06ff.+_-]+/)
    .filter((t) => t.length >= 3);
}

/** Score every known agent so boss has awareness of the full roster. */
export function scoreAllAgents(task: string): Array<{ agent: AgentDef; score: number }> {
  const taskTokens = new Set(tokens(task));
  const lower = task.toLowerCase();
  const agents = listAgents().filter((a) => a.id !== 'hub-boss'); // browse agent stays scorable

  return agents
    .map((agent) => {
      let score = 0;
      const hay = tokens(`${agent.id} ${agent.pack} ${agent.category} ${agent.description}`);
      for (const t of hay) {
        if (taskTokens.has(t)) score += 2;
      }
      // id fragment match (e.g. security-reviewer)
      for (const part of agent.id.split('-')) {
        if (part.length >= 4 && lower.includes(part)) score += 3;
      }
      for (const boost of BOOSTS) {
        if (boost.agent === agent.id && boost.match.test(task)) score += boost.weight;
      }
      // pack affinity words
      if (agent.pack === 'desk' && /lead|email|csv|meeting|report|inbox/i.test(task)) score += 2;
      if (agent.pack === 'ecc68' && /code|review|bug|build|python|typescript|security/i.test(task)) score += 2;
      if (agent.pack === 'forge' && /github|gitlab|forge|mcp|skill/i.test(task)) score += 2;
      if (agent.pack === 'tools13' && /seo|video|n8n|goose|scrap|headroom|nanomuse|glm|kimi/i.test(task)) score += 2;
      return { agent, score };
    })
    .sort((a, b) => b.score - a.score || a.agent.id.localeCompare(b.agent.id));
}

/**
 * hub-boss: differentiates work using FULL knowledge of every registered agent.
 */
export function planWithBoss(task: string): HubPlan {
  const ranked = scoreAllAgents(task);
  const roster = listAgents();
  const top = ranked[0];
  const primary = top && top.score > 0 ? top.agent.id : 'ecc-planner';
  const pack = top && top.score > 0 ? top.agent.pack : 'ecc68';
  const secondary = ranked
    .filter((r) => r.agent.id !== primary && r.score > 0)
    .slice(0, 3)
    .map((r) => r.agent);

  return {
    orchestrator: 'hub-boss',
    pack,
    primary,
    secondary: secondary.map((a) => a.id),
    roster_size: roster.length,
    known_packs: [...new Set(roster.map((a) => a.pack))],
    considered_top: ranked.slice(0, 8).map((r) => ({
      agent_id: r.agent.id,
      pack: r.agent.pack,
      score: r.score,
    })),
    rationale:
      top && top.score > 0
        ? `Boss scored all ${roster.length} agents; top=${primary}@${pack}(${top.score})`
        : `Boss scored all ${roster.length} agents; no strong match → ecc-planner`,
    decomposition: [
      {
        agent_id: primary,
        pack,
        subtask: `Primary: ${task}`,
      },
      ...secondary.map((a) => ({
        agent_id: a.id,
        pack: a.pack,
        subtask: `Support (${a.pack}/${a.category}): ${task}`,
      })),
    ],
  };
}

/** Full directory text injected into hub-boss system prompt — awareness of everyone. */
export function buildBossDirectory(): string {
  const agents = listAgents();
  const byPack = new Map<string, AgentDef[]>();
  for (const a of agents) {
    const list = byPack.get(a.pack) || [];
    list.push(a);
    byPack.set(a.pack, list);
  }
  const lines: string[] = [
    `# FULL AGENT ROSTER (${agents.length} agents)`,
    'You KNOW every agent below. When routing, pick from this complete directory — never invent IDs.',
    '',
  ];
  for (const pack of PACKS) {
    const list = byPack.get(pack.id) || [];
    lines.push(`## Pack: ${pack.id} — ${pack.name} (${list.length})`);
    lines.push(pack.description);
    for (const a of list) {
      lines.push(`- ${a.id} [${a.category}]: ${a.description.slice(0, 160)}`);
    }
    lines.push('');
  }
  // any unexpected packs
  for (const [packId, list] of byPack) {
    if (PACKS.some((p) => p.id === packId)) continue;
    lines.push(`## Pack: ${packId} (${list.length})`);
    for (const a of list) lines.push(`- ${a.id}: ${a.description.slice(0, 160)}`);
    lines.push('');
  }
  return lines.join('\n');
}
