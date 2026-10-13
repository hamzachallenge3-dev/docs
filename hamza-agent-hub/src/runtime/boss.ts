import { listAgents } from './registry.js';

export interface HubPlan {
  orchestrator: string;
  pack: string;
  primary: string;
  secondary: string[];
  rationale: string;
  decomposition: Array<{ agent_id: string; pack: string; subtask: string }>;
}

const RULES: Array<{ agent: string; pack: string; keywords: string[]; weight: number }> = [
  // Desk
  { agent: 'desk-inbox-to-lead', pack: 'desk', keywords: ['inbox', 'lead', 'email triage', 'reply draft', 'بريدد'], weight: 12 },
  { agent: 'desk-weekly-report', pack: 'desk', keywords: ['weekly report', 'kpi', 'this week', 'تقرير أسبوعي'], weight: 12 },
  { agent: 'desk-meeting-to-action', pack: 'desk', keywords: ['meeting', 'notes', 'action items', 'اجتماع', 'محضر'], weight: 12 },
  { agent: 'desk-lead-cleaner', pack: 'desk', keywords: ['clean leads', 'dedupe email', 'csv emails'], weight: 11 },
  // Forge
  { agent: 'forge-github-intelligence', pack: 'forge', keywords: ['github', 'repo tricks', 'gitingest'], weight: 10 },
  { agent: 'forge-agent-miner', pack: 'forge', keywords: ['mine agents', 'find mcp', 'skill.md', 'discover skills'], weight: 11 },
  { agent: 'forge-detect', pack: 'forge', keywords: ['which forge', 'gitlab', 'bitbucket', 'codeberg'], weight: 9 },
  { agent: 'forge-skill-pack-builder', pack: 'forge', keywords: ['skill pack', 'build pack', 'curate skills'], weight: 9 },
  // ECC (subset of strongest routers — boss can still pick any via keyword overlap)
  { agent: 'ecc-security-reviewer', pack: 'ecc68', keywords: ['security', 'xss', 'sql injection', 'أمن'], weight: 10 },
  { agent: 'ecc-python-reviewer', pack: 'ecc68', keywords: ['python', '.py', 'django', 'fastapi'], weight: 8 },
  { agent: 'ecc-typescript-reviewer', pack: 'ecc68', keywords: ['typescript', '.ts', 'tsx'], weight: 8 },
  { agent: 'ecc-react-reviewer', pack: 'ecc68', keywords: ['react', 'jsx', 'next.js'], weight: 8 },
  { agent: 'ecc-code-reviewer', pack: 'ecc68', keywords: ['code review', 'مراجعة كود'], weight: 6 },
  { agent: 'ecc-chief-of-staff', pack: 'ecc68', keywords: ['ecc only', 'coding agents only'], weight: 5 },
  { agent: 'ecc-planner', pack: 'ecc68', keywords: ['implementation plan', 'خطة تقنية'], weight: 7 },
  { agent: 'ecc-doc-updater', pack: 'ecc68', keywords: ['documentation', 'readme', 'توثيق'], weight: 7 },
  { agent: 'ecc-build-error-resolver', pack: 'ecc68', keywords: ['build error', 'compile fail'], weight: 9 },
];

export function planWithBoss(task: string): HubPlan {
  const lower = ` ${task.toLowerCase()} `;
  const scores = new Map<string, { score: number; pack: string }>();
  for (const rule of RULES) {
    let s = 0;
    for (const kw of rule.keywords) if (lower.includes(kw.toLowerCase())) s += rule.weight;
    if (s > 0) scores.set(rule.agent, { score: (scores.get(rule.agent)?.score ?? 0) + s, pack: rule.pack });
  }
  const ranked = [...scores.entries()]
    .map(([agent, v]) => ({ agent, ...v }))
    .sort((a, b) => b.score - a.score);

  let primary = ranked[0]?.agent || 'ecc-planner';
  let pack = ranked[0]?.pack || 'ecc68';
  // Boss never assigns itself as primary worker
  if (primary === 'hub-boss') {
    primary = ranked[1]?.agent || 'ecc-planner';
    pack = ranked[1]?.pack || 'ecc68';
  }

  const secondary = ranked.filter((r) => r.agent !== primary).slice(0, 2);
  const byId = new Map(listAgents().map((a) => [a.id, a]));

  return {
    orchestrator: 'hub-boss',
    pack,
    primary,
    secondary: secondary.map((s) => s.agent),
    rationale:
      ranked.length > 0
        ? `Hub boss matched → ${ranked
            .slice(0, 4)
            .map((r) => `${r.agent}@${r.pack}(${r.score})`)
            .join(', ')}`
        : 'No strong match; defaulted to ecc-planner',
    decomposition: [
      {
        agent_id: primary,
        pack,
        subtask: `Primary (${byId.get(primary)?.category || 'role'}): ${task}`,
      },
      ...secondary.map((s) => ({
        agent_id: s.agent,
        pack: s.pack,
        subtask: `Support from ${s.pack}: ${task}`,
      })),
    ],
  };
}
