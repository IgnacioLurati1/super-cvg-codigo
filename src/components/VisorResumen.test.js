import { describe, expect, it } from 'vitest';
import fuente from './VisorResumen.jsx?raw';

// A frame that runs scripts with the origin of Super CVG would hand a summary written by anyone the student's key.
describe('los marcos del lector de resúmenes', () => {
  const sandboxes = [...fuente.matchAll(/sandbox=(?:"([^"]*)"|\{([^}]*)\})/g)].map((m) => m[1] ?? m[2]);

  it('ninguno junta scripts con el origen del sitio', () => {
    expect(sandboxes.length).toBeGreaterThan(0);
    for (const s of sandboxes) expect(s.includes('allow-scripts') && s.includes('allow-same-origin')).toBe(false);
  });

  it('cada sandbox es un texto fijo, que se puede revisar', () => {
    expect(fuente.match(/sandbox=\{/g)).toBeNull();
  });
});
