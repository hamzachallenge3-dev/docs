import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export function ensureWorkspace(workspaceId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(workspaceId)) {
    throw new Error('invalid workspace_id: use 1-64 alphanumeric, underscore, or hyphen characters');
  }
  const root = path.resolve(config.workspacesDir, workspaceId);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function resolveSafePath(workspaceRoot: string, relativePath: string): string {
  const cleaned = relativePath.replace(/\\/g, '/');
  if (cleaned.includes('\0') || cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) {
    throw new Error('path traversal blocked: absolute paths are not allowed');
  }
  const resolved = path.resolve(workspaceRoot, cleaned);
  const root = path.resolve(workspaceRoot);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('path traversal blocked');
  }
  return resolved;
}

export function assertToolAllowed(allowed: string[], toolName: string): void {
  if (!allowed.includes(toolName)) {
    throw new Error(`tool not permitted for this role: ${toolName}`);
  }
}
