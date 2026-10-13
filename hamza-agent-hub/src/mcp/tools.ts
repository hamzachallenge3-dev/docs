import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { assertCatalog, listAgents, PACKS, getAgent } from '../runtime/registry.js';
import { cancelTask, enqueueAgentTask, queueStats, startQueue } from '../runtime/queue.js';
import { getTask, listEvents } from '../storage/db.js';
import { modelStatus } from '../model/client.js';
import { config } from '../config.js';
import {
  freellmapiChat,
  freellmapiEnabled,
  freellmapiStatusSummary,
  probeFreellmapi,
} from '../model/freellmapi.js';
import { buildBossDirectory, planWithBoss } from '../runtime/boss.js';
import { browseAgentDetail, browseEverything } from '../runtime/browse.js';
import { cleanLeads, sheetsToJson, extractContacts } from '../packs/desk/tools.js';
import { forgeDetect, githubUrlTricks, agentMiningQueries } from '../packs/forge/tools.js';
import { loadTools13Manifest, lookupTool13 } from '../packs/tools13/registry.js';
import { seoAuditHtml } from '../packs/tools13/seo.js';
import fs from 'node:fs';

function jsonText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function createHamzaHubServer(): McpServer {
  startQueue();
  const server = new McpServer({ name: 'hamza-agent-hub', version: '1.0.0' });

  server.tool('hub_health', 'Hub runtime/model/storage readiness (no secrets)', {}, async () => {
    let ok = false;
    let error: string | null = null;
    try {
      assertCatalog();
      ok = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const model = modelStatus();
    return jsonText({
      ok,
      service: 'hamza-agent-hub',
      packs: PACKS,
      agents: listAgents().length,
      ecc68_agents: listAgents('ecc68').length,
      desk_agents: listAgents('desk').length,
      forge_agents: listAgents('forge').length,
      tools13_agents: listAgents('tools13').length,
      tools13_manifest: loadTools13Manifest().length,
      boss_knows_all: Boolean(getAgent('hub-boss')?.tools.includes('hub_full_roster')),
      agent_browse: Boolean(getAgent('hub-agent-browse')?.tools.includes('hub_agent_browse')),
      hub_agents: listAgents('hub').length,
      freellmapi: freellmapiStatusSummary(),
      freellmapi_live: freellmapiEnabled() && model.configured,
      queue: queueStats(),
      model,
      storage: { db_exists: fs.existsSync(config.dbPath) },
      desk_twin: config.deskUrl,
      production_guard: 'This lab plugin does not mutate production Hamza Agent Hub or GLM/Headroom',
      error,
    });
  });

  server.tool(
    'hub_freellmapi_status',
    'Probe FreeLLMAPI (open-source free LLM gateway) — /v1/models health, catalog sample, connection hints',
    {},
    async () => jsonText({ config: freellmapiStatusSummary(), probe: await probeFreellmapi() })
  );

  server.tool(
    'hub_freellmapi_chat',
    'Send a one-shot chat completion through FreeLLMAPI (model=auto by default). Lab only — free tiers.',
    {
      prompt: z.string(),
      system: z.string().optional(),
      model: z.string().optional(),
    },
    async ({ prompt, system, model }) => {
      if (!freellmapiEnabled() && !config.modelUrl) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'FreeLLMAPI not enabled. Run scripts/connect-freellmapi.sh or set HAH_MODEL_PROVIDER=freellmapi',
            },
          ],
        };
      }
      try {
        // Temporarily treat as enabled for this call if MODEL_URL already points at a gateway
        const result = await freellmapiChat({
          system: system || 'You are a helpful assistant for Hamza Agent Hub lab.',
          messages: [{ role: 'user', content: prompt }],
          tools: [],
          model,
        });
        return jsonText(result);
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
        };
      }
    }
  );

  server.tool('hub_list_packs', 'List Hub packs (hub, desk, ecc68, forge)', {}, async () =>
    jsonText({ packs: PACKS })
  );

  server.tool(
    'hub_list_agents',
    'List all agents across packs (optional pack filter)',
    { pack: z.string().optional() },
    async ({ pack }) => {
      const agents = listAgents(pack).map((a) => ({
        id: a.id,
        pack: a.pack,
        category: a.category,
        description: a.description,
        tools: a.tools,
        model_ready: a.model_ready,
      }));
      return jsonText({ count: agents.length, agents });
    }
  );

  server.tool(
    'hub_boss_route',
    'Preview how hub-boss would differentiate and assign a mission using FULL roster awareness',
    { task: z.string() },
    async ({ task }) => jsonText(planWithBoss(task))
  );

  server.tool(
    'hub_full_roster',
    'Return the complete agent directory that hub-boss knows (all packs)',
    {},
    async () => jsonText({ count: listAgents().length, directory: buildBossDirectory() })
  );

  server.tool(
    'hub_agent_browse',
    'Browse everything in the one plugin: packs, all agents, tools13, MCP tools. Search with query or open one agent_id.',
    {
      query: z.string().optional(),
      pack: z.string().optional(),
      category: z.string().optional(),
      agent_id: z.string().optional(),
      limit: z.number().int().positive().optional(),
      include_tools13: z.boolean().optional(),
      include_mcp: z.boolean().optional(),
    },
    async (args) => {
      if (args.agent_id) {
        const detail = browseAgentDetail(args.agent_id);
        if (!detail.agent) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `unknown agent: ${args.agent_id}` }],
          };
        }
        return jsonText(detail);
      }
      return jsonText(
        browseEverything({
          query: args.query,
          pack: args.pack,
          category: args.category,
          limit: args.limit,
          include_tools13: args.include_tools13,
          include_mcp: args.include_mcp,
        })
      );
    }
  );

  server.tool(
    'hub_tools13_lookup',
    'List or look up the 13 Hub Boss recovery tools',
    { query: z.string().optional() },
    async ({ query }) => {
      if (!query || query === '*' || query === 'all') return jsonText(loadTools13Manifest());
      const hit = lookupTool13(query);
      return hit
        ? jsonText(hit)
        : { isError: true, content: [{ type: 'text' as const, text: `not found: ${query}` }] };
    }
  );

  server.tool(
    'seo_audit_html',
    'Free Marketing SEO Audit on local HTML (tools13) — no Okara, no posting',
    { html: z.string(), url: z.string().optional() },
    async ({ html, url }) => jsonText(seoAuditHtml(html, url || 'https://example.com/'))
  );

  server.tool(
    'run_agent',
    'Queue an agent from any pack. Use hub-boss to differentiate work across Desk + ECC68 + Forge.',
    {
      agent_id: z.string(),
      task: z.string(),
      workspace_id: z.string(),
      idempotency_key: z.string(),
    },
    async (args) => {
      try {
        const result = enqueueAgentTask(args);
        const preview =
          args.agent_id === 'hub-boss' || args.agent_id === 'ecc-chief-of-staff'
            ? planWithBoss(args.task)
            : undefined;
        return jsonText({
          task_id: result.task_id,
          reused: result.reused,
          status: result.task.status,
          agent: getAgent(args.agent_id),
          routing_preview: preview,
        });
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
        };
      }
    }
  );

  server.tool('task_status', 'Get task status/progress', { task_id: z.string() }, async ({ task_id }) => {
    const task = getTask(task_id);
    if (!task) return { isError: true, content: [{ type: 'text' as const, text: `not found: ${task_id}` }] };
    return jsonText({
      task_id: task.id,
      agent_id: task.agent_id,
      status: task.status,
      progress: task.progress,
      progress_message: task.progress_message,
    });
  });

  server.tool('task_result', 'Get task output/evidence/artifacts', { task_id: z.string() }, async ({ task_id }) => {
    const task = getTask(task_id);
    if (!task) return { isError: true, content: [{ type: 'text' as const, text: `not found: ${task_id}` }] };
    return jsonText({
      task_id: task.id,
      status: task.status,
      output: task.output,
      error: task.error,
      evidence: safe(task.evidence),
      tool_log: safe(task.tool_log),
      artifacts: safe(task.artifacts),
      events: listEvents(task_id).slice(-40),
    });
  });

  server.tool('cancel_task', 'Cancel a queued/running task', { task_id: z.string() }, async ({ task_id }) => {
    try {
      return jsonText(cancelTask(task_id));
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
      };
    }
  });

  // Direct Automation Desk tools (same contracts as desk.imdifferent01.com)
  server.tool(
    'clean_leads',
    'Clean and dedupe emails from messy text or CSV (Automation Desk)',
    { text: z.string().optional(), csv: z.string().optional() },
    async (args) => jsonText(cleanLeads(args))
  );
  server.tool(
    'sheets_to_json',
    'Convert CSV/TSV spreadsheet text to JSON rows (Automation Desk)',
    { csv: z.string(), dialect: z.string().optional() },
    async (args) => jsonText(sheetsToJson(args))
  );
  server.tool(
    'extract_contacts',
    'Extract emails, phones and social links from public HTML (Automation Desk)',
    { html: z.string().optional(), url: z.string().optional() },
    async (args) => jsonText(extractContacts(args))
  );

  // Forge intelligence
  server.tool('forge_detect', 'Detect code-hosting forge for a URL', { url: z.string() }, async ({ url }) =>
    jsonText(forgeDetect(url))
  );
  server.tool(
    'github_url_tricks',
    'Expand a GitHub repo URL into intelligence viewer/API links',
    { url: z.string() },
    async ({ url }) => jsonText(githubUrlTricks(url))
  );
  server.tool('agent_mining_queries', 'Curated GitHub queries to mine agents/skills/MCP', {}, async () =>
    jsonText(agentMiningQueries())
  );

  return server;
}

function safe(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
