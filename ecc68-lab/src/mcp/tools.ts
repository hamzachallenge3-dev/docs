import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listAgents, getAgent, assertExactly68 } from '../runtime/registry.js';
import { cancelTask, enqueueAgentTask, queueStats, startQueue } from '../runtime/queue.js';
import { getTask, listEvents } from '../storage/db.js';
import { modelStatus } from '../model/client.js';
import { config } from '../config.js';
import { planWithChief } from '../router/chief.js';
import fs from 'node:fs';

function jsonText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function createEcc68Server(): McpServer {
  startQueue();
  const server = new McpServer({
    name: 'ecc68-lab',
    version: '1.0.0',
  });

  server.tool(
    'list_agents',
    'List all 68 ECC agents with description, tools, model readiness, and tested status',
    {},
    async () => {
      assertExactly68();
      const agents = listAgents().map((a) => ({
        id: a.id,
        description: a.description,
        category: a.category,
        tools: a.tools,
        model_ready: a.model_ready,
        tested: a.tested,
      }));
      return jsonText({ count: agents.length, agents });
    }
  );

  server.tool(
    'run_agent',
    'Queue an agent task. Returns a durable task_id. Chief-of-staff differentiates and assigns work to specialists.',
    {
      agent_id: z.string().describe('ECC agent id, e.g. ecc-chief-of-staff'),
      task: z.string().describe('Task description'),
      workspace_id: z.string().describe('Isolated workspace id'),
      idempotency_key: z.string().describe('Client idempotency key'),
    },
    async ({ agent_id, task, workspace_id, idempotency_key }) => {
      try {
        const result = enqueueAgentTask({ agent_id, task, workspace_id, idempotency_key });
        const preview =
          agent_id === 'ecc-chief-of-staff' ? planWithChief(task, agent_id) : undefined;
        return jsonText({
          task_id: result.task_id,
          reused: result.reused,
          status: result.task.status,
          routing_preview: preview,
        });
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.tool(
    'task_status',
    'Get task status: queued/running/completed/failed/cancelled with progress',
    {
      task_id: z.string(),
    },
    async ({ task_id }) => {
      const task = getTask(task_id);
      if (!task) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `task not found: ${task_id}` }],
        };
      }
      return jsonText({
        task_id: task.id,
        agent_id: task.agent_id,
        status: task.status,
        progress: task.progress,
        progress_message: task.progress_message,
        updated_at: task.updated_at,
        started_at: task.started_at,
        finished_at: task.finished_at,
      });
    }
  );

  server.tool(
    'task_result',
    'Get task output, evidence, tool log, and artifacts',
    {
      task_id: z.string(),
    },
    async ({ task_id }) => {
      const task = getTask(task_id);
      if (!task) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `task not found: ${task_id}` }],
        };
      }
      return jsonText({
        task_id: task.id,
        status: task.status,
        output: task.output,
        error: task.error,
        evidence: safeJson(task.evidence),
        tool_log: safeJson(task.tool_log),
        artifacts: safeJson(task.artifacts),
        events: listEvents(task_id).slice(-50),
      });
    }
  );

  server.tool(
    'cancel_task',
    'Cancel a queued or running task and stop actual execution',
    {
      task_id: z.string(),
    },
    async ({ task_id }) => {
      try {
        const task = cancelTask(task_id);
        return jsonText({ task_id: task.id, status: task.status });
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
        };
      }
    }
  );

  server.tool(
    'health',
    'Runtime/model/storage readiness without exposing secrets',
    {},
    async () => {
      let registryOk = false;
      let registryError: string | null = null;
      try {
        assertExactly68();
        registryOk = true;
      } catch (err) {
        registryError = err instanceof Error ? err.message : String(err);
      }
      const model = modelStatus();
      const sample = getAgent('ecc-chief-of-staff');
      return jsonText({
        ok: registryOk,
        runtime: {
          concurrency: config.concurrency,
          queue: queueStats(),
          transport: config.transport,
          host: config.host,
          port: config.port,
        },
        registry: {
          ok: registryOk,
          agents: listAgents().length,
          error: registryError,
          chief_of_staff: sample
            ? { id: sample.id, tools: sample.tools, category: sample.category }
            : null,
        },
        model: {
          configured: model.configured,
          readiness: model.readiness,
          name: model.name,
          url_set: Boolean(model.url),
          reason: model.reason,
        },
        storage: {
          db_path_set: Boolean(config.dbPath),
          db_exists: fs.existsSync(config.dbPath),
          workspaces_dir: config.workspacesDir,
        },
        auth: {
          token_required: Boolean(config.authToken),
          // never return the token
        },
      });
    }
  );

  return server;
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
