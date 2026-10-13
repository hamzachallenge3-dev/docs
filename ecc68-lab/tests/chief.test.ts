import { describe, expect, it } from 'vitest';
import { planWithChief } from '../src/router/chief.js';

describe('chief-of-staff routing', () => {
  it('routes security work to security-reviewer', () => {
    const plan = planWithChief('Please do a security review for XSS and auth bypass');
    expect(plan.orchestrator).toBe('ecc-chief-of-staff');
    expect(plan.primary).toBe('ecc-security-reviewer');
    expect(plan.decomposition.length).toBeGreaterThanOrEqual(1);
  });

  it('routes python review to python-reviewer', () => {
    const plan = planWithChief('Review this python django view for bugs');
    expect(plan.primary).toBe('ecc-python-reviewer');
  });

  it('chief preferred agent still re-routes away from itself', () => {
    const plan = planWithChief('Add typescript types and review .ts files', 'ecc-chief-of-staff');
    expect(plan.primary).not.toBe('ecc-chief-of-staff');
    expect(plan.primary).toBe('ecc-typescript-reviewer');
  });
});
