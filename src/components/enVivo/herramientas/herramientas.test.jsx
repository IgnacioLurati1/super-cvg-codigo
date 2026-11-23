import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { crearSesion, redesLocales, CADA_CAMBIOS } from '../../../lib/enVivo/sesion';
import { elegirCalculadora } from '../../../lib/enVivo/calculadoraCompartida';
import { usePestana } from '../usePestana';
import { UIProvider } from '../../ui';
import Calculadora from './Calculadora';
import Laboratorio from './Laboratorio';
import Repaso from './Repaso';
import Materia from './Materia';
import Pizarra from './Pizarra';
import { agregar } from '../../../lib/enVivo/pizarra';
import { armarMateria } from '../../../lib/enVivo/materiaMesa';
import { cambiarMio, fijarUsuario, mioActual } from '../../../lib/mio';

// The two tools of the table, on screen, in two sessions joined in memory: what one types, the other sees.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // The engines don't load here: jsdom has no workers.
  Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
});

function Lado({ sesion, Herramienta }) {
  const mesa = usePestana(sesion, 'p1');
  useEffect(() => sesion.marcarLocal('p', 'p1'), [sesion]);
  return <Herramienta mesa={mesa} />;
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

async function dos(Herramienta, antes) {
  const redes = redesLocales(2);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: k ? 'Beto' : 'Ana', color: k ? '#1d6fb8' : '#b4235a' } }));
  antes?.(sesiones);
  const cajas = [];
  for (const sesion of sesiones) {
    const caja = document.createElement('div');
    document.body.append(caja);
    const raiz = createRoot(caja);
    await act(async () => raiz.render(<MemoryRouter><UIProvider><Lado sesion={sesion} Herramienta={Herramienta} /></UIProvider></MemoryRouter>));
    abiertas.push({ raiz, caja, sesion });
    cajas.push(caja);
  }
  await esperar();
  return { sesiones, cajas };
}

const editorDe = (caja) => EditorView.findFromDOM(caja.querySelector('.cm-content'));

function escribir(campo, valor) {
  const poner = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(campo), 'value').set;
  poner.call(campo, valor);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('herramientas de la mesa en pantalla', () => {
  it('Laboratorio: lo que escribe uno aparece en el editor del otro', async () => {
    const { cajas } = await dos(Laboratorio);
    const [a, b] = cajas.map(editorDe);
    expect(a && b).toBeTruthy();
    expect(b.state.doc.toString()).toBe(a.state.doc.toString());
    await act(async () => a.dispatch({ changes: { from: 0, insert: 'print("de Ana")\n' } }));
    await esperar();
    expect(b.state.doc.toString().startsWith('print("de Ana")\n')).toBe(true);
    await act(async () => b.dispatch({ changes: { from: 0, insert: '# de Beto\n' } }));
    await esperar();
    expect(a.state.doc.toString().startsWith('# de Beto\nprint("de Ana")\n')).toBe(true);

    // A project one makes, with its language, reaches the other. (jsdom doesn't scroll.)
    Element.prototype.scrollIntoView ??= () => {};
    globalThis.CSS ??= { escape: (s) => String(s) };
    await act(async () => cajas[1].querySelector('.lab-explorador button:nth-child(2)')?.click());
    const nombre = cajas[1].querySelector('input[aria-label="Nombre del proyecto nuevo"], .lab-explorador input[type=text]');
    expect(nombre).toBeTruthy();
    await act(async () => escribir(nombre, 'Consultas'));
    const lenguaje = cajas[1].querySelector('select[name=lenguaje]');
    await act(async () => {
      lenguaje.value = 'sql';
      lenguaje.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => nombre.form.requestSubmit());
    await esperar();
    expect(cajas[0].querySelector('.lab-explorador').textContent).toContain('Consultas');
  });

  it('Pizarra: lo que dibuja otro llega marcado como suyo, para fundirse con Sensible a la luz', async () => {
    const { cajas, sesiones } = await dos(Pizarra);
    await act(async () => agregar(sesiones[0].doc.getMap('h:p1'), { t: 'rect', c: 0, g: 1, x1: 0, y1: 0, x2: 80, y2: 40 }, {}));
    await esperar();
    expect(cajas[0].querySelectorAll('.vpiz-svg rect.vpiz-figura')).toHaveLength(1);
    expect(cajas[0].querySelector('.vpiz-svg [data-ajeno]')).toBeNull();
    expect(cajas[1].querySelectorAll('.vpiz-svg rect.vpiz-figura[data-ajeno]')).toHaveLength(1);
  });

  it('Pizarra: Mover elige lo que queda dentro del rectángulo hasta donde se soltó, aunque lo último no se haya dibujado', async () => {
    const { cajas, sesiones } = await dos(Pizarra);
    const mapa = sesiones[0].doc.getMap('h:p1');
    await act(async () => {
      agregar(mapa, { t: 'trazo', c: 0, g: 2, p: [10, 10, 60, 20] }, {});
      agregar(mapa, { t: 'trazo', c: 0, g: 2, p: [10, 60, 60, 70] }, {});
    });
    await esperar();
    const caja = cajas[0];
    await act(async () => [...caja.querySelectorAll('.vh-barra button')].find((b) => b.textContent.trim() === 'Mover').click());
    const hoja = caja.querySelector('.vpiz-hoja');
    hoja.setPointerCapture ??= () => {};
    const puntero = (tipo, x, y) => hoja.dispatchEvent(new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 }));
    await act(async () => puntero('pointerdown', -5000, -5000));
    // Moved and let go at once, as a busy phone does: the last move isn't drawn yet when it's let go.
    await act(async () => {
      puntero('pointermove', 5000, 5000);
      puntero('pointerup', 5000, 5000);
    });
    expect(caja.querySelectorAll('.vpiz-elegido')).toHaveLength(2);
  });

  it('Calculadora: los datos que carga uno los ve el otro', async () => {
    const { cajas } = await dos(Calculadora, ([a]) => elegirCalculadora(a.doc.getMap('h:p1'), 'subred'));
    await esperar(400);
    const campos = cajas.map((c) => c.querySelector('.calc__ejercicio input[type=text], .calc__ejercicio input:not([type])'));
    expect(campos[0] && campos[1]).toBeTruthy();
    await act(async () => escribir(campos[0], '10.0.0.0/8'));
    await esperar();
    expect(cajas[1].querySelector('.calc__ejercicio input[type=text], .calc__ejercicio input:not([type])').value).toBe('10.0.0.0/8');
    expect(cajas[1].querySelector('select').value).toBe('subred');
  });

  it('Calculadora: lo que no entra en la calculadora no rompe la mesa y deja empezar de nuevo', async () => {
    const { cajas, sesiones } = await dos(Calculadora, ([a]) => elegirCalculadora(a.doc.getMap('h:p1'), 'graficadora'));
    await esperar(600);
    expect(cajas[0].querySelector('.calc__ejercicio')).toBeTruthy();
    // A list, as the calculator's own, but with what it can't read inside.
    const errorDeConsola = console.error;
    console.error = () => {};
    sesiones[1].doc.getMap('h:p1').set('v|calc:graficadora|trazos', [null]);
    await esperar();
    console.error = errorDeConsola;
    expect(cajas[1].querySelector('.ev-calc__roto')).toBeTruthy();
    const aviso = cajas[0].querySelector('.ev-calc__roto');
    expect(aviso?.textContent).toContain('no entra');
    expect(cajas[0].querySelector('select').value).toBe('graficadora');
    await act(async () => aviso.querySelector('button').click());
    await esperar();
    expect(cajas[0].querySelector('.ev-calc__roto')).toBeNull();
    expect(cajas[0].querySelector('.calc__ejercicio')).toBeTruthy();
    // The other one too, with no click.
    expect(cajas[1].querySelector('.ev-calc__roto')).toBeNull();
    expect(sesiones[1].doc.getMap('h:p1').get('v|calc:graficadora|trazos')).toBeUndefined();
  });
  it('Repaso en grupo: uno lleva su mazo, todos ven la tarjeta y lo que marca cada uno; el Repaso propio no cambia', async () => {
    fijarUsuario(7);
    const propias = [
      { id: 'r00000001', frente: 'Gradiente', dorso: 'El vector de las derivadas parciales.', creada: 1, vence: '2026-11-20', paso: 4 },
      { id: 'r00000002', frente: 'Schwarz', dorso: 'Las derivadas cruzadas son iguales.', creada: 2 },
    ];
    cambiarMio((m) => ({ ...m, repaso: propias }));
    const antes = JSON.stringify(mioActual().repaso);
    const { cajas } = await dos(Repaso);
    const boton = (caja, texto) => [...caja.querySelectorAll('button')].find((b) => b.textContent === texto);
    await act(async () => boton(cajas[0], 'Llevar a la mesa').click());
    await esperar();
    const frente = (caja) => caja.querySelector('.repaso-ficha__frente .repaso-ficha__texto')?.textContent;
    expect(frente(cajas[1])).toBeTruthy();
    expect(frente(cajas[1])).toBe(frente(cajas[0]));
    expect(cajas[1].textContent).toContain('Tarjeta 1 de 2');

    await act(async () => boton(cajas[1], 'Dar vuelta').click());
    await esperar();
    // The site's card, turned for everyone.
    expect(cajas[0].querySelector('.repaso-ficha--vuelta .repaso-ficha__dorso')?.getAttribute('aria-hidden')).toBe('false');
    await act(async () => boton(cajas[0], 'La sabía').click());
    await esperar();
    const deAna = [...cajas[1].querySelectorAll('.ev-repaso__persona')].find((li) => li.textContent.includes('Ana'));
    expect(deAna.textContent).toContain('la sabía');
    expect(JSON.stringify(mioActual().repaso)).toBe(antes);

    // Beto adds the card to his own Repaso, on purpose.
    await act(async () => boton(cajas[1], 'Sumar a mi Repaso').click());
    expect(mioActual().repaso).toHaveLength(3);
    expect(cajas[1].textContent).toContain('Está en tu Repaso.');

    // The end is the one of a round of Repaso, with the stamp of how many went by.
    await act(async () => boton(cajas[0], 'Siguiente').click());
    await esperar();
    await act(async () => boton(cajas[1], 'Terminar').click());
    await esperar();
    const fin = cajas[0].querySelector('.repaso-fin');
    expect(fin.querySelector('h3').textContent).toBe('Terminaron las 2 tarjetas');
    expect(fin.querySelector('.repaso-fin__sello').textContent).toBe('2');
    expect(fin.textContent).toContain('Sabía 1 de 2');
    fijarUsuario(null);
  });

  it('Materia: los demás la ven con las piezas de la página de la materia, y un PDF se pide al que la trajo', async () => {
    const grupos = [
      { nombre: 'Unidad 1', items: [{ tipo: 'archivo', nombre: 'Apunte 1', archivo: 'apunte.pdf' }, { tipo: 'enlace', nombre: 'Un enlace', destino: 'https://example.org/x' }] },
      { nombre: 'Unidad 2', items: [{ tipo: 'archivo', nombre: 'Guía', archivo: 'guia.pdf' }] },
    ];
    const { sesiones, cajas } = await dos(Materia, ([a]) => {
      const datos = a.doc.getMap('h:p1');
      datos.set('materia', armarMateria('Física I', grupos).compartido);
      datos.set('de', a.yo.id);
    });
    const b = cajas[1];
    expect(b.querySelector('h2').textContent).toBe('Física I');
    expect(b.textContent).toContain('La trajo Ana, como la ve en su campus.');
    // Its sections fold as on the course page, and its index goes to them.
    const titulo = b.querySelector('.bloque h3 .seccion__titulo');
    expect(titulo.textContent).toBe('Unidad 1');
    expect(b.querySelector('.indice')).not.toBeNull();
    // The rows of the course page: a PDF says so, a link opens in another tab.
    const filas = [...b.querySelectorAll('.fila')];
    expect(filas.map((f) => f.querySelector('.fila__nombre').textContent)).toEqual(['Apunte 1', 'Un enlace', 'Guía']);
    expect(filas[0].querySelector('.fila__dato').textContent).toBe('PDF');
    const enlace = filas[1].querySelector('a.fila__principal');
    expect(enlace.getAttribute('href')).toBe('https://example.org/x');
    expect(enlace.target).toBe('_blank');
    await act(async () => titulo.click());
    expect(titulo.getAttribute('aria-expanded')).toBe('false');
    expect(b.querySelector(`[id="${titulo.getAttribute('aria-controls')}"]`)?.hidden).toBe(true);
    // Its PDF is asked of whoever brought it.
    await act(async () => filas[2].querySelector('button.fila__principal').click());
    await esperar();
    expect(sesiones[0].doc.getMap('h:p1').get('p:i2')?.estado).toBe('pedido');

    // «Buscar en esta materia» and the kinds of the course page, on the names that travel; a folded section opens.
    const nombres = () => [...b.querySelectorAll('.fila__nombre')].map((n) => n.textContent);
    const buscar = b.querySelector('input[type="search"]');
    expect(b.querySelector('label[for="' + buscar.id + '"]').textContent).toBe('Buscar en esta materia');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(buscar, 'apunte');
      buscar.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(nombres()).toEqual(['Apunte 1']);
    expect(b.querySelector('.fila').closest('.seccion__cuerpo').hidden).toBe(false);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(buscar, '');
      buscar.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const tipos = [...b.querySelectorAll('.tipos__opcion')];
    expect(tipos.map((t) => t.textContent)).toEqual(['Todo', 'Archivos', 'Enlaces', 'Actividades']);
    await act(async () => tipos[2].click());
    expect(nombres()).toEqual(['Un enlace']);
    await act(async () => tipos[3].click());
    expect(b.querySelector('.materia__sin-nada').textContent).toBe('No hay nada para mostrar acá. Probá con otro filtro.');
  });
});
