import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExactly68, listAgents, loadRoleInstructions } from '../src/runtime/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('registry', () => {
  it('has exactly 68 unique agent ids', () => {
    assertExactly68();
    const agents = listAgents();
    expect(agents).toHaveLength(68);
    expect(new Set(agents.map((a) => a.id)).size).toBe(68);
  });

  it('every profile and upstream is readable', () => {
    for (const a of listAgents()) {
      expect(fs.existsSync(path.join(root, a.profile))).toBe(true);
      expect(fs.existsSync(path.join(root, a.upstream))).toBe(true);
      const text = loadRoleInstructions(a.id);
      expect(text.length).toBeGreaterThan(50);
      expect(text).not.toMatch(/^# UNAVAILABLE/);
    }
  });

  it('chief-of-staff is an orchestrator with dispatch tools', () => {
    const chief = listAgents().find((a) => a.id === 'ecc-chief-of-staff');
    expect(chief?.category).toBe('orchestrator');
    expect(chief?.tools).toContain('dispatch_agent');
    expect(chief?.tools).toContain('list_specialists');
  });
});
