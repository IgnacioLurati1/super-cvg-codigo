import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { UIProvider } from '../../ui';
import { EntradaDeLaMesa } from './Consultron';

// The session's thread is drawn by the site's own Consultron (Charla.jsx `Entrada`): who asked, the answer, its sources.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const yo = { id: 'yo', nombre: 'Vos', color: '#1d6fb8' };
// `presentes`: who is here, with when their page came in (`desde`); `volviendo`: who may be back from a reload.
const mesa = (presentes = [], { desde = 0, volviendo = [] } = {}) => ({
  yo,
  presente: (id) => (id === 'yo' || presentes.includes(id) ? { nombre: id, desde } : volviendo.includes(id) ? { nombre: id, volviendo: true } : null),
});
const entrada = (cambios) => ({
  id: 'abc', pregunta: '¿Qué es rho?', de: 'ana', nombre: 'Ana', color: '#be185d', cuando: 1, estado: 'listo',
  respuesta: 'La utilización es $\\rho$ [1].\n\n```python\nprint(1)\n```', quien: 'gemini', fuentes: ['Documento'], general: false, ...cambios,
});

let caja = null;
let raiz = null;
afterEach(() => {
  act(() => raiz.unmount());
  caja.remove();
});
function dibujar(e, m) {
  caja = document.body.appendChild(document.createElement('div'));
  raiz = createRoot(caja);
  act(() => raiz.render(<MemoryRouter><UIProvider><EntradaDeLaMesa entrada={e} mesa={m} nivel={3} /></UIProvider></MemoryRouter>));
  return caja;
}

describe('Consultron de la sesión', () => {
  it('names someone else in their color, with the answer, its source on the table and who answered', () => {
    const c = dibujar(entrada(), mesa(['ana']));
    expect(c.querySelector('.consultron__autor').textContent).toBe('Ana');
    const pregunta = c.querySelector('h3.consultron__pregunta');
    expect(pregunta.textContent).toBe('¿Qué es rho?');
    expect(pregunta.style.getPropertyValue('--color')).toBe('#be185d');
    expect(c.querySelector('.consultron__formula')).not.toBeNull();
    expect(c.querySelector('.consultron__fuente-nombre').textContent).toBe('Documento');
    expect(c.querySelector('.consultron__fuente-dato').textContent).toBe('En la mesa');
    expect(c.textContent).toContain('Contestó Gemini, con las preguntas de Ana.');
    // Nothing takes the student out of the session.
    expect(c.textContent).not.toContain('Probar en el Laboratorio');
  });

  it('draws one\'s own question as the site does, without a name', () => {
    const c = dibujar(entrada({ de: 'yo', quien: 'compu' }), mesa());
    expect(c.querySelector('.consultron__autor')).toBeNull();
    expect(c.querySelector('.consultron__pregunta').dataset.autor).toBeUndefined();
    expect(c.textContent).not.toContain('Contestó');
  });

  it('says so when whoever asked left before the answer, and thinks while they are there', () => {
    expect(dibujar(entrada({ estado: 'pensando', respuesta: '' }), mesa()).textContent).toContain('Ana se fue antes de que llegara la respuesta.');
    act(() => raiz.unmount());
    caja.remove();
    expect(dibujar(entrada({ estado: 'pensando', respuesta: '' }), mesa(['ana'])).querySelector('.consultron__pensando')).not.toBeNull();
  });

  it('a reload is not leaving: while they may be back it keeps thinking, and once back it says the answer was lost', () => {
    const pensando = entrada({ estado: 'pensando', respuesta: '', cuando: 100 });
    const c = dibujar(pensando, mesa([], { volviendo: ['ana'] }));
    expect(c.textContent).not.toContain('se fue');
    expect(c.querySelector('.consultron__pensando')).not.toBeNull();
    act(() => raiz.unmount());
    caja.remove();
    expect(dibujar(pensando, mesa(['ana'], { desde: 200 })).textContent).toContain('Ana recargó la página antes de que llegara la respuesta.');
  });

  it('says when the table did not have it', () => {
    expect(dibujar(entrada({ general: true, fuentes: [] }), mesa(['ana'])).textContent).toContain('No está en la mesa. Esto es lo que sé en general, revisalo.');
  });
});
