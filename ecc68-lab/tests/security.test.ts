import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSafePath, ensureWorkspace, assertToolAllowed } from '../src/security/workspace.js';
import { redactSecrets } from '../src/security/redact.js';
import { runWorkspaceTool } from '../src/tools/workspaceTools.js';
import { makeTempLabEnv } from './helpers.js';

describe('security', () => {
  it('blocks path traversal', () => {
    makeTempLabEnv();
    const root = ensureWorkspace('sec-ws');
    expect(() => resolveSafePath(root, '../outside.txt')).toThrow(/traversal/);
    expect(() => resolveSafePath(root, '/etc/passwd')).toThrow(/traversal|absolute/);
  });

  it('enforces tool permissions', async () => {
    makeTempLabEnv();
    const root = ensureWorkspace('sec-tools');
    const denied = await runWorkspaceTool(['workspace_list'], root, {
      name: 'workspace_write',
      arguments: { path: 'x.txt', content: 'nope' },
    });
    expect(denied.ok).toBe(false);
    expect(denied.output).toMatch(/not permitted/);
    expect(fs.existsSync(path.join(root, 'x.txt'))).toBe(false);
  });

  it('assertToolAllowed throws for unknown tools', () => {
    expect(() => assertToolAllowed(['workspace_read'], 'workspace_write')).toThrow(/not permitted/);
  });

  it('redacts secrets from logs', () => {
    const text = redactSecrets('Authorization: Bearer sk-abcdefghijklmnop password=supersecret');
    expect(text).not.toContain('sk-abcdefghijklmnop');
    expect(text).not.toContain('supersecret');
    expect(text).toContain('[REDACTED]');
  });

  it('does not allow writing outside workspace via tricky relative paths', async () => {
    makeTempLabEnv();
    const root = ensureWorkspace('sec-write');
    const outside = path.join(os.tmpdir(), `ecc68-outside-${Date.now()}.txt`);
    const result = await runWorkspaceTool(['workspace_write'], root, {
      name: 'workspace_write',
      arguments: { path: '../../ecc-escape.txt', content: 'bad' },
    });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(outside)).toBe(false);
  });
});
