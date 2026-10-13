import { listAgents, type AgentDef } from '../runtime/registry.js';

export interface RoutingPlan {
  orchestrator: string;
  primary: string;
  secondary: string[];
  rationale: string;
  decomposition: Array<{ agent_id: string; subtask: string }>;
}

/** Keyword map used by chief-of-staff to differentiate and assign work. */
const RULES: Array<{ agent: string; keywords: string[]; weight: number }> = [
  { agent: 'ecc-security-reviewer', keywords: ['security', 'xss', 'csrf', 'owasp', 'auth', '漏洞', 'أمن'], weight: 10 },
  { agent: 'ecc-python-reviewer', keywords: ['python', '.py', 'django', 'fastapi', 'pytest'], weight: 8 },
  { agent: 'ecc-typescript-reviewer', keywords: ['typescript', '.ts', 'tsx', 'tsc'], weight: 8 },
  { agent: 'ecc-react-reviewer', keywords: ['react', 'jsx', 'hooks', 'next.js'], weight: 8 },
  { agent: 'ecc-vue-reviewer', keywords: ['vue', 'nuxt', 'composition api'], weight: 8 },
  { agent: 'ecc-go-reviewer', keywords: ['golang', ' go ', '.go'], weight: 8 },
  { agent: 'ecc-rust-reviewer', keywords: ['rust', 'cargo', '.rs'], weight: 8 },
  { agent: 'ecc-java-reviewer', keywords: ['java', 'maven', 'spring'], weight: 8 },
  { agent: 'ecc-kotlin-reviewer', keywords: ['kotlin', '.kt'], weight: 8 },
  { agent: 'ecc-swift-reviewer', keywords: ['swift', 'ios', 'xcode'], weight: 8 },
  { agent: 'ecc-cpp-reviewer', keywords: ['c++', 'cpp', '.cpp', 'cmake'], weight: 8 },
  { agent: 'ecc-csharp-reviewer', keywords: ['c#', 'csharp', '.cs', 'dotnet'], weight: 8 },
  { agent: 'ecc-php-reviewer', keywords: ['php', 'laravel'], weight: 8 },
  { agent: 'ecc-flutter-reviewer', keywords: ['flutter', 'dart', 'widget'], weight: 8 },
  { agent: 'ecc-database-reviewer', keywords: ['sql', 'schema', 'postgres', 'mysql', 'migration'], weight: 8 },
  { agent: 'ecc-performance-optimizer', keywords: ['perf', 'latency', 'slow', 'optimize', 'benchmark'], weight: 9 },
  { agent: 'ecc-a11y-architect', keywords: ['a11y', 'accessibility', 'wcag', 'aria'], weight: 9 },
  { agent: 'ecc-seo-specialist', keywords: ['seo', 'sitemap', 'meta tags'], weight: 8 },
  { agent: 'ecc-build-error-resolver', keywords: ['build error', 'compile', 'webpack', 'vite fail'], weight: 9 },
  { agent: 'ecc-react-build-resolver', keywords: ['react build', 'cra', 'next build'], weight: 9 },
  { agent: 'ecc-tdd-guide', keywords: ['tdd', 'unit test', 'test first'], weight: 8 },
  { agent: 'ecc-e2e-runner', keywords: ['e2e', 'playwright', 'cypress', 'end-to-end'], weight: 8 },
  { agent: 'ecc-doc-updater', keywords: ['docs', 'readme', 'documentation', 'توثيق'], weight: 7 },
  { agent: 'ecc-planner', keywords: ['plan', 'roadmap', 'خطة', 'architecture plan'], weight: 7 },
  { agent: 'ecc-architect', keywords: ['architecture', 'system design', 'معمارية'], weight: 8 },
  { agent: 'ecc-code-reviewer', keywords: ['code review', 'pr review', 'مراجعة'], weight: 6 },
  { agent: 'ecc-code-simplifier', keywords: ['simplify', 'refactor', 'cleanup', 'تبسيط'], weight: 7 },
  { agent: 'ecc-silent-failure-hunter', keywords: ['silent fail', 'swallowed', 'empty catch'], weight: 9 },
  { agent: 'ecc-spec-miner', keywords: ['spec', 'requirements', 'prd'], weight: 7 },
  { agent: 'ecc-network-troubleshooter', keywords: ['network', 'dns', 'tcp', 'firewall'], weight: 8 },
  { agent: 'ecc-rag-pipeline-reviewer', keywords: ['rag', 'embedding', 'vector', 'retrieval'], weight: 9 },
  { agent: 'ecc-opensource-sanitizer', keywords: ['sanitize', 'license', 'opensource clean'], weight: 8 },
  { agent: 'ecc-marketing-agent', keywords: ['marketing', 'copy', 'landing', 'تسويق'], weight: 7 },
];

function scoreTask(task: string): Array<{ agent: string; score: number }> {
  const lower = ` ${task.toLowerCase()} `;
  const scores = new Map<string, number>();
  for (const rule of RULES) {
    let s = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) s += rule.weight;
    }
    if (s > 0) scores.set(rule.agent, (scores.get(rule.agent) ?? 0) + s);
  }
  return [...scores.entries()]
    .map(([agent, score]) => ({ agent, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Chief-of-staff: differentiates the incoming job and assigns specialists.
 * This is the agent that routes work to the rest of the 68.
 */
export function planWithChief(task: string, preferredAgent?: string): RoutingPlan {
  const agents = listAgents();
  const byId = new Map(agents.map((a) => [a.id, a]));
  const ranked = scoreTask(task);

  let primary = preferredAgent && byId.has(preferredAgent) ? preferredAgent : ranked[0]?.agent;
  if (!primary || primary === 'ecc-chief-of-staff') {
    primary = ranked[0]?.agent || 'ecc-code-reviewer';
  }
  if (preferredAgent === 'ecc-chief-of-staff') {
    // Chief always re-routes; never executes generic work alone.
    primary = ranked[0]?.agent || 'ecc-planner';
  }

  const secondary = ranked
    .filter((r) => r.agent !== primary)
    .slice(0, 2)
    .map((r) => r.agent);

  const primaryDef = byId.get(primary) as AgentDef | undefined;
  const decomposition: RoutingPlan['decomposition'] = [
    {
      agent_id: primary,
      subtask: `Primary ownership (${primaryDef?.category ?? 'specialist'}): ${task}`,
    },
  ];
  for (const sid of secondary) {
    const def = byId.get(sid);
    decomposition.push({
      agent_id: sid,
      subtask: `Supporting ${def?.category ?? 'role'} review: validate and extend findings for: ${task}`,
    });
  }

  return {
    orchestrator: 'ecc-chief-of-staff',
    primary,
    secondary,
    rationale:
      ranked.length > 0
        ? `Matched keywords → ${ranked
            .slice(0, 3)
            .map((r) => `${r.agent}(${r.score})`)
            .join(', ')}`
        : 'No strong keyword match; defaulted to code-reviewer / planner',
    decomposition,
  };
}

export function listSpecialists(): Array<{ id: string; category: string; description: string }> {
  return listAgents()
    .filter((a) => a.id !== 'ecc-chief-of-staff')
    .map((a) => ({ id: a.id, category: a.category, description: a.description }));
}
