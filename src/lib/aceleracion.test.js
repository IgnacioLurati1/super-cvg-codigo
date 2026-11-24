import { describe, expect, it } from 'vitest';
import { sinAceleracion } from './aceleracion';

const RENDERER = 0x9246;

// A document whose canvas answers like a browser: `conAviso` is the context with failIfMajorPerformanceCaveat.
const documento = ({ conAviso, nombre = null, rompe = false }) => ({
  createElement: () => ({
    getContext: (_tipo, opciones) => {
      if (rompe) throw new Error('webgl');
      if (opciones?.failIfMajorPerformanceCaveat && !conAviso) return null;
      return {
        RENDERER: 0x1f01,
        getExtension: (n) => (n === 'WEBGL_debug_renderer_info' && nombre !== null ? { UNMASKED_RENDERER_WEBGL: RENDERER } : n === 'WEBGL_lose_context' ? { loseContext() {} } : null),
        getParameter: (p) => (p === RENDERER ? nombre : 'WebKit WebGL'),
      };
    },
  }),
});

describe('sinAceleracion', () => {
  it('with the graphics card, no warning', () => {
    expect(sinAceleracion(documento({ conAviso: true, nombre: 'ANGLE (AMD, AMD Radeon RX 9070 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' }))).toBe(false);
  });

  it('when the browser refuses a context that would draw in software, it warns, whatever the card is called', () => {
    expect(sinAceleracion(documento({ conAviso: false, nombre: 'ANGLE (AMD, AMD Radeon RX 9070 XT)' }))).toBe(true);
  });

  it('a software drawer that does not refuse is caught by its name', () => {
    expect(sinAceleracion(documento({ conAviso: true, nombre: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }))).toBe(true);
    expect(sinAceleracion(documento({ conAviso: true, nombre: 'llvmpipe (LLVM 15.0.7, 256 bits)' }))).toBe(true);
    expect(sinAceleracion(documento({ conAviso: true, nombre: 'Microsoft Basic Render Driver' }))).toBe(true);
  });

  it('with the name hidden (Brave), it trusts the refusal', () => {
    expect(sinAceleracion(documento({ conAviso: true }))).toBe(false);
  });

  it('without WebGL, or if it breaks, it warns', () => {
    expect(sinAceleracion(documento({ conAviso: false }))).toBe(true);
    expect(sinAceleracion(documento({ conAviso: true, rompe: true }))).toBe(true);
  });
});
