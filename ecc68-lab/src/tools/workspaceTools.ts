import fs from 'node:fs';
import path from 'node:path';
import { assertToolAllowed, resolveSafePath } from '../security/workspace.js';
import { redactSecrets } from '../security/redact.js';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  name: string;
  output: string;
  artifact?: string;
}

export async function runWorkspaceTool(
  allowed: string[],
  workspaceRoot: string,
  call: ToolCall
): Promise<ToolResult> {
  try {
    assertToolAllowed(allowed, call.name);
    switch (call.name) {
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
        const content = fs.readFileSync(abs, 'utf8');
        return { ok: true, name: call.name, output: redactSecrets(content) };
      }
      case 'workspace_write': {
        const rel = String(call.arguments.path ?? '');
        const content = String(call.arguments.content ?? '');
        const abs = resolveSafePath(workspaceRoot, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
        return {
          ok: true,
          name: call.name,
          output: `wrote ${rel} (${content.length} bytes)`,
          artifact: rel,
        };
      }
      case 'workspace_mkdir': {
        const rel = String(call.arguments.path ?? '');
        const abs = resolveSafePath(workspaceRoot, rel);
        fs.mkdirSync(abs, { recursive: true });
        return { ok: true, name: call.name, output: `mkdir ${rel}` };
      }
      case 'workspace_stat': {
        const rel = String(call.arguments.path ?? '');
        const abs = resolveSafePath(workspaceRoot, rel);
        if (!fs.existsSync(abs)) return { ok: false, name: call.name, output: 'not found' };
        const st = fs.statSync(abs);
        return {
          ok: true,
          name: call.name,
          output: JSON.stringify({
            path: rel,
            size: st.size,
            isFile: st.isFile(),
            isDirectory: st.isDirectory(),
            mtimeMs: st.mtimeMs,
          }),
        };
      }
      case 'workspace_grep': {
        const pattern = String(call.arguments.pattern ?? '');
        const rel = String(call.arguments.path ?? '.');
        if (!pattern) return { ok: false, name: call.name, output: 'pattern required' };
        const abs = resolveSafePath(workspaceRoot, rel);
        const re = new RegExp(pattern, 'i');
        const hits: string[] = [];
        const walk = (dir: string, base: string) => {
          for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, ent.name);
            const relPath = path.join(base, ent.name);
            if (ent.isDirectory()) walk(full, relPath);
            else if (ent.isFile() && ent.name.match(/\.(md|txt|ts|js|json|py|rs|go|java|css|html)$/i)) {
              const lines = fs.readFileSync(full, 'utf8').split('\n');
              lines.forEach((line, i) => {
                if (re.test(line) && hits.length < 50) hits.push(`${relPath}:${i + 1}:${line.slice(0, 200)}`);
              });
            }
          }
        };
        if (fs.existsSync(abs)) {
          if (fs.statSync(abs).isDirectory()) walk(abs, rel === '.' ? '' : rel);
          else {
            const lines = fs.readFileSync(abs, 'utf8').split('\n');
            lines.forEach((line, i) => {
              if (re.test(line) && hits.length < 50) hits.push(`${rel}:${i + 1}:${line.slice(0, 200)}`);
            });
          }
        }
        return { ok: true, name: call.name, output: hits.join('\n') || '(no matches)' };
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
