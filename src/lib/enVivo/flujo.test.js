import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { crearSesion, redesLocales, CADA_CAMBIOS } from './sesion';
import { agregarNodo, borrar, cambiarFlecha, cambiarNodo, conectar, duplicarNodo, invertirFlecha, ladosEntre, leerFlujo, MAX_ETIQUETA, MAX_NODOS, MAX_TEXTO, textoFlujo } from './flujo';

const datosNuevos = () => new Y.Doc().getMap('datos');
const ID = (n) => `${'0'.repeat(11)}${n}`;

// The classic loop: read a number, add it while it is positive, show the sum.
function sumar() {
  const datos = datosNuevos();
  const inicio = agregarNodo(datos, 'terminal', { x: 0, y: 0, txt: 'Inicio' });
  const leer = agregarNodo(datos, 'datos', { x: 0, y: 100, txt: 'Leer n' });
  const pregunta = agregarNodo(datos, 'decision', { x: 0, y: 200, txt: '¿n > 0?' });
  const sumarle = agregarNodo(datos, 'proceso', { x: 0, y: 340, txt: 'suma = suma + n' });
  const mostrar = agregarNodo(datos, 'datos', { x: 260, y: 220, txt: 'Mostrar suma' });
  const fin = agregarNodo(datos, 'terminal', { x: 260, y: 340, txt: 'Fin' });
  conectar(datos, { de: inicio, sd: 'b', a: leer, ad: 't' });
  conectar(datos, { de: leer, sd: 'b', a: pregunta, ad: 't' });
  conectar(datos, { de: pregunta, sd: 'b', a: sumarle, ad: 't' });
  conectar(datos, { de: pregunta, sd: 'r', a: mostrar, ad: 'l' });
  conectar(datos, { de: sumarle, sd: 'l', a: leer, ad: 'l' });
  conectar(datos, { de: mostrar, sd: 'b', a: fin, ad: 't' });
  return { datos, ids: { inicio, leer, pregunta, sumarle, mostrar, fin } };
}

describe('Diagrama de flujo: datos', () => {
  it('una decisión sale por «Sí» y después por «No»; una flecha con su texto lo conserva', () => {
    const { datos, ids } = sumar();
    const fl = leerFlujo(datos);
    const salen = fl.flechas.filter((f) => f.de === ids.pregunta);
    expect(salen.map((f) => [f.a === ids.sumarle ? 'sumar' : 'mostrar', f.txt]).sort()).toEqual([['mostrar', 'No'], ['sumar', 'Sí']]);
    const otra = agregarNodo(datos, 'proceso', { x: 0, y: 500 });
    conectar(datos, { de: ids.pregunta, sd: 'l', a: otra, ad: 't' });
    expect(leerFlujo(datos).flechas.find((f) => f.a === otra).txt).toBe('');
    expect(fl.flechas.filter((f) => f.a === ids.leer)).toHaveLength(2);
  });

  it('lo que llega de otro se revisa y se corta: formas, lados, textos, flechas sueltas y el tope', () => {
    const datos = datosNuevos();
    datos.set(`n:${ID(1)}`, { t: 'proceso', x: 0, y: 0, txt: `a\u0000b\n${'x'.repeat(500)}` });
    datos.set(`n:${ID(2)}`, { t: 'script', x: 0, y: 0 });
    datos.set(`n:${ID(3)}`, { t: 'decision', x: 'uno', y: 0 });
    datos.set(`n:${ID(4)}`, { t: 'terminal', x: 1e9, y: -1e9 });
    datos.set('n:<img>', { t: 'proceso', x: 0, y: 0 });
    datos.set(`f:${ID(5)}`, { de: ID(1), sd: 'b', a: ID(4), ad: 'centro' });
    datos.set(`f:${ID(6)}`, { de: ID(1), sd: 'b', a: ID(9), ad: 't' });
    datos.set(`f:${ID(7)}`, { de: ID(1), sd: 'b', a: ID(4), ad: 't', txt: 'y'.repeat(200) });
    const fl = leerFlujo(datos);
    expect(fl.nodos.map((n) => n.id)).toEqual([ID(1), ID(4)]);
    expect(fl.nodos[0].txt.startsWith('a b\n')).toBe(true);
    expect(fl.nodos[0].txt).toHaveLength(MAX_TEXTO);
    expect(fl.nodos[1]).toMatchObject({ x: 100_000, y: -100_000 });
    expect(fl.flechas).toHaveLength(1);
    expect(fl.flechas[0].txt).toHaveLength(MAX_ETIQUETA);
    for (let i = 0; i < MAX_NODOS + 5; i += 1) agregarNodo(datos, 'proceso', { x: i, y: 0 });
    expect([...datos.keys()].filter((k) => k.startsWith('n:'))).toHaveLength(MAX_NODOS);
  });

  it('cambiar la forma, los lados y borrar una forma con sus flechas', () => {
    const { datos, ids } = sumar();
    cambiarNodo(datos, ids.sumarle, { t: 'subproceso' });
    cambiarNodo(datos, ids.sumarle, { t: 'nada' });
    const f = leerFlujo(datos).flechas.find((x) => x.de === ids.sumarle);
    cambiarFlecha(datos, f.id, { sd: 'r', ad: 'r', txt: 'otra vez' });
    cambiarFlecha(datos, f.id, { sd: 'arriba' });
    let fl = leerFlujo(datos);
    expect(fl.nodos.find((n) => n.id === ids.sumarle).t).toBe('subproceso');
    expect(fl.flechas.find((x) => x.id === f.id)).toMatchObject({ sd: 'r', ad: 'r', txt: 'otra vez' });
    borrar(datos, { nodos: [ids.pregunta] });
    fl = leerFlujo(datos);
    expect(fl.nodos).toHaveLength(5);
    expect(fl.flechas.some((x) => x.de === ids.pregunta || x.a === ids.pregunta)).toBe(false);
  });

  it('el estilo de una forma y de una flecha: solo números de la paleta y tipos conocidos, y vuelve a lo de siempre con 0', () => {
    const { datos, ids } = sumar();
    cambiarNodo(datos, ids.leer, { c: 3, l: 1, g: 2, r: 1 });
    const f = leerFlujo(datos).flechas.find((x) => x.de === ids.inicio);
    cambiarFlecha(datos, f.id, { c: 2, l: 2 });
    cambiarFlecha(datos, f.id, { txt: 'va' });
    invertirFlecha(datos, f.id);
    const copia = duplicarNodo(datos, ids.leer);
    let fl = leerFlujo(datos);
    expect(fl.nodos.find((n) => n.id === ids.leer)).toMatchObject({ c: 3, l: 1, g: 2, r: 1 });
    expect(fl.nodos.find((n) => n.id === copia)).toMatchObject({ c: 3, l: 1, g: 2, r: 1 });
    expect(fl.flechas.find((x) => x.id === f.id)).toMatchObject({ c: 2, l: 2, txt: 'va', de: ids.leer });
    expect(fl.flechas.find((x) => x.id === f.id).r).toBeUndefined();
    cambiarNodo(datos, ids.leer, { c: 0, l: 0, g: 0, r: 0 });
    expect(datos.get(`n:${ids.leer}`)).toEqual({ t: 'datos', x: 0, y: 100, txt: 'Leer n' });
    // From a peer: a raw color, a kind out of range or a fraction is the usual.
    datos.set(`n:${ID(1)}`, { t: 'proceso', x: 0, y: 0, c: 'red', l: 7, g: 1.5, r: true });
    datos.set(`f:${ID(2)}`, { de: ID(1), sd: 'b', a: ids.fin, ad: 't', c: -1, l: '1', g: 99, r: 1 });
    fl = leerFlujo(datos);
    expect(fl.nodos.find((n) => n.id === ID(1))).toEqual({ id: ID(1), t: 'proceso', x: 0, y: 0, txt: '' });
    expect(fl.flechas.find((x) => x.id === ID(2))).toEqual({ id: ID(2), de: ID(1), sd: 'b', a: ids.fin, ad: 't', txt: '' });
  });

  it('los lados de una flecha nueva siguen dónde está la otra forma; el «No» de una decisión sale de costado', () => {
    expect(ladosEntre({ t: 'proceso', x: 0, y: 0 }, { x: 0, y: 120 })).toEqual(['b', 't']);
    expect(ladosEntre({ t: 'proceso', x: 0, y: 300 }, { x: 10, y: 0 })).toEqual(['l', 'l']);
    expect(ladosEntre({ t: 'proceso', x: 0, y: 300 }, { x: 200, y: 0 })).toEqual(['t', 'b']);
    expect(ladosEntre({ t: 'proceso', x: 0, y: 0 }, { x: 300, y: 20 })).toEqual(['r', 'l']);
    expect(ladosEntre({ t: 'decision', x: 0, y: 0 }, { x: 0, y: 200 }, ['b'])).toEqual(['r', 't']);
  });

  it('Consultron lee los pasos en orden, con lo que contesta cada decisión', () => {
    const { datos } = sumar();
    expect(textoFlujo(leerFlujo(datos))).toBe([
      'Diagrama de flujo, paso por paso:',
      '1. inicio o fin «Inicio».',
      '2. entrada o salida «Leer n».',
      '3. decisión «¿n > 0?». «Sí» va al paso 4; «No» va al paso 5.',
      '4. proceso «suma = suma + n», sigue en el paso 2.',
      '5. entrada o salida «Mostrar suma».',
      '6. inicio o fin «Fin».',
    ].join('\n'));
    expect(textoFlujo({ nodos: [], flechas: [] })).toBe('');
  });

  it('dos personas arman el mismo diagrama', async () => {
    const [ra, rb] = redesLocales(2);
    const a = crearSesion({ red: ra, yo: { nombre: 'Ana' } });
    const b = crearSesion({ red: rb, yo: { nombre: 'Beto' } });
    const da = a.doc.getMap('h:p1');
    const db = b.doc.getMap('h:p1');
    const x = agregarNodo(da, 'proceso', { x: 0, y: 0, txt: 'Leer' });
    const y = agregarNodo(db, 'decision', { x: 0, y: 120, txt: '¿Fin?' });
    await new Promise((r) => setTimeout(r, CADA_CAMBIOS + 80));
    conectar(db, { de: x, sd: 'b', a: y, ad: 't' });
    await new Promise((r) => setTimeout(r, CADA_CAMBIOS + 80));
    expect(leerFlujo(da)).toEqual(leerFlujo(db));
    expect(leerFlujo(da).flechas).toHaveLength(1);
    a.cerrar();
    b.cerrar();
  });
});
