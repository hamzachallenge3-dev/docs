import fs from 'node:fs';
import path from 'node:path';
import { assertToolAllowed, resolveSafePath } from '../security/workspace.js';
import { redactSecrets } from '../security/redact.js';
import { cleanLeads, sheetsToJson, extractContacts } from '../packs/desk/tools.js';
import { forgeDetect, githubUrlTricks, agentMiningQueries } from '../packs/forge/tools.js';
import { listAgents, PACKS } from '../runtime/registry.js';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export async function runTool(
  allowed: string[],
  workspaceRoot: string,
  call: ToolCall
): Promise<{ ok: boolean; name: string; output: string; artifact?: string }> {
  try {
    assertToolAllowed(allowed, call.name);
    switch (call.name) {
      case 'hub_list_packs':
        return { ok: true, name: call.name, output: JSON.stringify(PACKS, null, 2) };
      case 'hub_list_agents': {
        const pack = call.arguments.pack ? String(call.arguments.pack) : undefined;
        return {
          ok: true,
          name: call.name,
          output: JSON.stringify(
            listAgents(pack).map((a) => ({ id: a.id, pack: a.pack, category: a.category, description: a.description })),
            null,
            2
          ),
        };
      }
      case 'clean_leads':
        return {
          ok: true,
          name: call.name,
          output: JSON.stringify(
            cleanLeads({ text: String(call.arguments.text || ''), csv: String(call.arguments.csv || '') }),
            null,
            2
          ),
        };
      case 'sheets_to_json':
        return {
          ok: true,
          name: call.name,
          output: JSON.stringify(
            sheetsToJson({ csv: String(call.arguments.csv || ''), dialect: call.arguments.dialect ? String(call.arguments.dialect) : undefined }),
            null,
            2
          ),
        };
      case 'extract_contacts':
        return {
          ok: true,
          name: call.name,
          output: JSON.stringify(
            extractContacts({
              html: String(call.arguments.html || ''),
              url: call.arguments.url ? String(call.arguments.url) : undefined,
            }),
            null,
            2
          ),
        };
      case 'forge_detect':
        return {
          ok: true,
          name: call.name,
          output: JSON.stringify(forgeDetect(String(call.arguments.url || '')), null, 2),
        };
      case 'github_url_tricks':
        return {
          ok: true,
          name: call.name,
          output: JSON.stringify(githubUrlTricks(String(call.arguments.url || '')), null, 2),
        };
      case 'agent_mining_queries':
        return { ok: true, name: call.name, output: JSON.stringify(agentMiningQueries(), null, 2) };
      case 'workspace_list': {
        const rel = String(call.arguments.path ?? '.');
        const abs = resolveSafePath(workspaceRoot, rel);
        if (!fs.existsSync(abs)) return { ok: false, name: call.name, output: 'path not found' };
        const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
        }));
        return { ok: true, name: call.name, output: JSON.stringify(entries, null, 2) };
      }
      case 'workspace_read': {
        const rel = String(call.arguments.path ?? '');
        const abs = resolveSafePath(workspaceRoot, rel);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          return { ok: false, name: call.name, output: 'file not found' };
        }
        return { ok: true, name: call.name, output: redactSecrets(fs.readFileSync(abs, 'utf8')) };
      }
      case 'workspace_write': {
        const rel = String(call.arguments.path ?? '');
        const content = String(call.arguments.content ?? '');
        const abs = resolveSafePath(workspaceRoot, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
        return { ok: true, name: call.name, output: `wrote ${rel}`, artifact: rel };
      }
      case 'workspace_grep': {
        const pattern = String(call.arguments.pattern ?? '');
        const rel = String(call.arguments.path ?? '.');
        const abs = resolveSafePath(workspaceRoot, rel);
        const re = new RegExp(pattern, 'i');
        const hits: string[] = [];
        const walk = (dir: string, base: string) => {
          for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, ent.name);
            const relPath = path.join(base, ent.name);
            if (ent.isDirectory()) walk(full, relPath);
            else if (ent.isFile()) {
              const lines = fs.readFileSync(full, 'utf8').split('\n');
              lines.forEach((line, i) => {
                if (re.test(line) && hits.length < 40) hits.push(`${relPath}:${i + 1}:${line.slice(0, 160)}`);
              });
            }
          }
        };
        if (fs.existsSync(abs)) {
          if (fs.statSync(abs).isDirectory()) walk(abs, rel === '.' ? '' : rel);
          else {
            fs.readFileSync(abs, 'utf8')
              .split('\n')
              .forEach((line, i) => {
                if (re.test(line) && hits.length < 40) hits.push(`${rel}:${i + 1}:${line.slice(0, 160)}`);
              });
          }
        }
        return { ok: true, name: call.name, output: hits.join('\n') || '(no matches)' };
      }
      case 'dispatch_agent': {
        const agentId = String(call.arguments.agent_id || '');
        const subtask = String(call.arguments.subtask || '');
        const target = listAgents().find((a) => a.id === agentId);
        if (!target) return { ok: false, name: call.name, output: `unknown agent ${agentId}` };
        const assignment = { agent_id: agentId, pack: target.pack, subtask, at: Date.now() };
        const rel = `artifacts/dispatch-${agentId}.json`;
        fs.mkdirSync(path.join(workspaceRoot, 'artifacts'), { recursive: true });
        fs.writeFileSync(path.join(workspaceRoot, rel), JSON.stringify(assignment, null, 2));
        return { ok: true, name: call.name, output: JSON.stringify(assignment), artifact: rel };
      }
      default:
        return { ok: false, name: call.name, output: `unknown tool ${call.name}` };
    }
  } catch (err) {
    return {
      ok: false,
      name: call.name,
      output: err instanceof Error ? err.message : String(err),
    };
  }
}
