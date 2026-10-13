import fs from 'node:fs';
import path from 'node:path';
import { assertToolAllowed, resolveSafePath } from '../security/workspace.js';
import { redactSecrets } from '../security/redact.js';
import { cleanLeads, sheetsToJson, extractContacts } from '../packs/desk/tools.js';
import { forgeDetect, githubUrlTricks, agentMiningQueries } from '../packs/forge/tools.js';
import { listAgents, PACKS } from '../runtime/registry.js';
import { buildBossDirectory } from '../runtime/boss.js';
import { loadTools13Manifest, lookupTool13 } from '../packs/tools13/registry.js';
import { seoAuditHtml } from '../packs/tools13/seo.js';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../config.js';

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
      case 'hub_full_roster':
        return { ok: true, name: call.name, output: buildBossDirectory() };
      case 'hub_tools13_lookup': {
        const q = String(call.arguments.query || call.arguments.id || '');
        if (!q || q === '*' || q === 'all') {
          return { ok: true, name: call.name, output: JSON.stringify(loadTools13Manifest(), null, 2) };
        }
        const hit = lookupTool13(q);
        return {
          ok: Boolean(hit),
          name: call.name,
          output: hit ? JSON.stringify(hit, null, 2) : `tool13 not found: ${q}`,
        };
      }
      case 'seo_audit_html': {
        const html = String(call.arguments.html || '');
        const url = String(call.arguments.url || 'https://example.com/');
        if (!html.trim()) return { ok: false, name: call.name, output: 'html required' };
        return { ok: true, name: call.name, output: JSON.stringify(seoAuditHtml(html, url), null, 2) };
      }
      case 'film_pack_prepare': {
        const video = String(call.arguments.video_path || '');
        const outRel = String(call.arguments.out_path || 'artifacts/lapian-analysis-pack.zip');
        if (!video) return { ok: false, name: call.name, output: 'video_path required' };
        const script = path.join(ROOT, 'packs/tools13/runtime/lapian-notes/scripts/film_pack.py');
        if (!fs.existsSync(script)) {
          return { ok: false, name: call.name, output: 'film_pack.py missing from tools13 runtime' };
        }
        const outAbs = resolveSafePath(workspaceRoot, outRel);
        fs.mkdirSync(path.dirname(outAbs), { recursive: true });
        // video path must be inside workspace for safety
        let videoAbs: string;
        try {
          videoAbs = resolveSafePath(workspaceRoot, video);
        } catch {
          return { ok: false, name: call.name, output: 'video_path must be inside the workspace' };
        }
        if (!fs.existsSync(videoAbs)) {
          return {
            ok: false,
            name: call.name,
            output: JSON.stringify({
              ok: false,
              error: 'video file not found in workspace',
              hint: 'Place a video under the workspace then retry. Requires ffmpeg/ffprobe on host.',
            }),
          };
        }
        const interval = Number(call.arguments.interval || 2);
        const maxFrames = Number(call.arguments.max_frames || 36);
        const cp = spawnSync(
          'python3',
          [script, videoAbs, '--out', outAbs, '--interval', String(interval), '--max-frames', String(maxFrames)],
          { encoding: 'utf8', timeout: 120_000 }
        );
        const text = (cp.stdout || cp.stderr || '').trim();
        if (cp.status !== 0) {
          return {
            ok: false,
            name: call.name,
            output: text || `film_pack failed (is ffmpeg installed?): ${cp.error?.message || ''}`,
          };
        }
        return { ok: true, name: call.name, output: text, artifact: outRel };
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
