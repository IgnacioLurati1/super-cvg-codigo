import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearSesion, redesLocales, CADA_CAMBIOS } from '../../../lib/enVivo/sesion';
import { agregarNodo, leerFlujo } from '../../../lib/enVivo/flujo';
import { usePestana } from '../usePestana';
import Flujo from './Flujo';

// The Diagrama de flujo on screen, in two sessions joined in memory: shapes made by one reach the other, a new shape
// goes under the chosen one and joined, and undo takes back only what this browser did.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.DOMMatrixReadOnly ??= class {
    constructor() {
      this.m22 = 1;
    }
  };
});

function Lado({ sesion }) {
  const mesa = usePestana(sesion, 'p1');
  useEffect(() => sesion.marcarLocal('p', 'p1'), [sesion]);
  return <Flujo mesa={mesa} />;
}

const abiertas = [];
afterEach(() => {
  abiertas.splice(0).forEach(({ raiz, caja, sesion }) => {
    act(() => raiz.unmount());
    caja.remove();
    sesion.cerrar();
  });
});

const esperar = (ms = CADA_CAMBIOS + 60) => act(() => new Promise((r) => setTimeout(r, ms)));

async function dos() {
  const redes = redesLocales(2);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: k ? 'Beto' : 'Ana', color: k ? '#1d6fb8' : '#b4235a' } }));
  const cajas = [];
  for (const sesion of sesiones) {
    const caja = document.createElement('div');
    caja.style.width = '800px';
    caja.style.height = '600px';
    document.body.append(caja);
    const raiz = createRoot(caja);
    await act(async () => raiz.render(<Lado sesion={sesion} />));
    abiertas.push({ raiz, caja, sesion });
    cajas.push(caja);
  }
  await esperar();
  return { sesiones, cajas };
}

const boton = (caja, nombre) => [...caja.querySelectorAll('button')].find((b) => b.textContent.trim() === nombre);

describe('Diagrama de flujo en pantalla', () => {
  it('lo que arma uno lo ve el otro; una forma nueva va unida a la elegida y una decisión sale por «Sí»', async () => {
    const { sesiones, cajas } = await dos();
    const datosDe = (k) => sesiones[k].doc.getMap('h:p1');

    await act(async () => boton(cajas[0], 'Decisión').click());
    // A new shape opens to be written in.
    const campo = cajas[0].querySelector('textarea.vflu-escribir');
    expect(campo).toBeTruthy();
    expect(document.activeElement).toBe(campo);
    await act(async () => boton(cajas[0], 'Proceso').click());
    await esperar();

    const visto = leerFlujo(datosDe(1));
    expect(visto.nodos.map((n) => n.t).sort()).toEqual(['decision', 'proceso']);
    expect(visto.flechas).toHaveLength(1);
    expect(visto.flechas[0]).toMatchObject({ sd: 'b', ad: 't', txt: 'Sí' });
  });

  it('Deshacer saca solo lo de este navegador, y Rehacer lo vuelve a poner', async () => {
    const { sesiones, cajas } = await dos();
    const datosDe = (k) => sesiones[k].doc.getMap('h:p1');
    await act(async () => boton(cajas[0], 'Proceso').click());
    await esperar(600);
    await act(async () => {
      agregarNodo(datosDe(1), 'terminal', { x: 0, y: -200, txt: 'Inicio' }, 'de Beto');
    });
    await esperar();
    expect(leerFlujo(datosDe(0)).nodos).toHaveLength(2);

    await act(async () => boton(cajas[0], 'Deshacer').click());
    await esperar();
    expect(leerFlujo(datosDe(1)).nodos.map((n) => n.txt)).toEqual(['Inicio']);
    await act(async () => boton(cajas[0], 'Rehacer').click());
    await esperar();
    expect(leerFlujo(datosDe(1)).nodos.map((n) => n.t).sort()).toEqual(['proceso', 'terminal']);
  });
});
