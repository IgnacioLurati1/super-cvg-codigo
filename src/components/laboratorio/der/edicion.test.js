import { describe, expect, it } from 'vitest';
import { derEnTexto, derVacio, leerDer } from '../../../lib/laboratorio/der/modelo';
import {
  agregarAgregacion, agregarAtributo, agregarEntidad, agregarJerarquia, agregarPunta, agregarVinculo, borrar, borrarAtributo, cambiarAtributo, cambiarPunta, correrAtributo, centroDe, decidir, extremosNuevos, lecturaDePunta, lugarLibre, partirCard, quitarPunta, renombrar,
} from './edicion';
import { cajaDe, medidaDe, medidaOvalo, ocupado, soloOvalo, tramo } from './geometria';

function conDos() {
  let d = derVacio();
  let a;
  let b;
  [d, a] = agregarEntidad(d, { x: 0, y: 0 });
  [d, b] = agregarEntidad(d, { x: 300, y: 0 });
  return { d, a, b };
}

describe('edición del DER', () => {
  it('una entidad nueva lleva su id como clave y un nombre libre, y el archivo la lee igual', () => {
    const { d } = conDos();
    expect(d.entidades.map((e) => e.nombre)).toEqual(['entidad', 'entidad_2']);
    expect(d.entidades[0].atributos[0]).toMatchObject({ nombre: 'id', clave: true });
    expect(leerDer(derEnTexto(d))).toEqual(d);
  });

  it('un vínculo se llama por lo que une y empieza sin cardinalidad decidida por nadie más que el alumno', () => {
    const { d: d0, a, b } = conDos();
    const [d, v] = agregarVinculo(d0, [a, b], { x: 150, y: 0 });
    const vinculo = d.vinculos.find((x) => x.id === v);
    expect(vinculo.nombre).toBe('entidad_entidad_2');
    expect(vinculo.puntas.map((p) => p.a)).toEqual([a, b]);
    // Recursive: the same entity twice.
    const [d2, r] = agregarVinculo(d, [a, a], { x: 0, y: 200 });
    expect(d2.vinculos.find((x) => x.id === r).puntas).toHaveLength(2);
    expect(leerDer(derEnTexto(d2)).vinculos).toHaveLength(2);
  });

  it('cambiar una punta borra lo decidido sobre ese vínculo', () => {
    const { d: d0, a, b } = conDos();
    let [d, v] = agregarVinculo(d0, [a, b], { x: 150, y: 0 });
    d = decidir(d, 'cp', v, ['id_entidad']);
    d = decidir(d, 'lado11', v, a);
    expect(d.decisiones.cp[v]).toEqual(['id_entidad']);
    d = cambiarPunta(d, v, 0, { card: '1:1' });
    expect(d.decisiones.cp[v]).toBeUndefined();
    expect(d.decisiones.lado11[v]).toBeUndefined();
    expect(partirCard('1:M')).toEqual({ min: '1', max: 'M' });
  });

  it('una punta más hace un ternario, y no baja de dos', () => {
    const { d: d0, a, b } = conDos();
    let [d, v] = agregarVinculo(d0, [a, b], { x: 150, y: 0 });
    d = agregarPunta(d, v, a);
    expect(d.vinculos[0].puntas).toHaveLength(3);
    d = agregarPunta(d, v, b);
    expect(d.vinculos[0].puntas).toHaveLength(3);
    d = quitarPunta(d, v, 2);
    d = quitarPunta(d, v, 1);
    expect(d.vinculos[0].puntas).toHaveLength(2);
  });

  it('borrar una entidad se lleva sus vínculos, su jerarquía y la agregación que quedó sin vínculo', () => {
    const { d: d0, a, b } = conDos();
    let [d, v] = agregarVinculo(d0, [a, b], { x: 150, y: 0 });
    let g;
    [d, g] = agregarAgregacion(d, v);
    let c;
    [d, c] = agregarEntidad(d, { x: 0, y: 300 });
    [d] = agregarVinculo(d, [c, g], { x: 0, y: 200 });
    [d] = agregarJerarquia(d, a, [b], { x: 0, y: 100 });
    d = decidir(d, 'cp', v, ['x']);
    const sin = borrar(d, 'entidad', a);
    expect(sin.entidades.map((e) => e.id)).toEqual([b, c]);
    expect(sin.vinculos).toEqual([]);
    expect(sin.agregaciones).toEqual([]);
    expect(sin.jerarquias).toEqual([]);
    expect(sin.decisiones.cp).toEqual({});
    expect(leerDer(derEnTexto(sin))).toEqual(sin);
  });

  it('una subclase borrada sale de la lista de su jerarquía', () => {
    const { d: d0, a, b } = conDos();
    let [d, c] = agregarEntidad(d0, { x: 0, y: 300 });
    [d] = agregarJerarquia(d, a, [b, c], { x: 0, y: 100 });
    expect(borrar(d, 'entidad', b).jerarquias[0].subclases).toEqual([c]);
  });

  it('atributos compuestos, en orden, y borrados', () => {
    const { d: d0, a } = conDos();
    let [d, dir] = agregarAtributo(d0, 'entidad', a);
    d = cambiarAtributo(d, 'entidad', a, dir, { nombre: 'direccion' });
    let parte;
    [d, parte] = agregarAtributo(d, 'entidad', a, dir);
    d = cambiarAtributo(d, 'entidad', a, parte, { nombre: 'calle' });
    expect(d.entidades[0].atributos[1].partes.map((p) => p.nombre)).toEqual(['calle']);
    d = correrAtributo(d, 'entidad', a, dir, -1);
    expect(d.entidades[0].atributos.map((x) => x.nombre)).toEqual(['direccion', 'id']);
    d = borrarAtributo(d, 'entidad', a, parte);
    expect(d.entidades[0].atributos[0].partes).toEqual([]);
    expect(leerDer(derEnTexto(d))).toEqual(d);
  });
});

describe('la cardinalidad leída en palabras', () => {
  // As the course's sheets write it: the label next to an entity says how many of it go with one of the other.
  const tp = (gestiona) => ({
    ...derVacio(),
    entidades: [{ id: 'empleado', nombre: 'empleado', debil: false, x: 0, y: 0, atributos: [] }],
    agregaciones: [{ id: 'g', nombre: 'alquila', vinculo: 'alquila' }],
    vinculos: [{ id: 'gestiona', nombre: 'gestiona', identificador: false, x: 0, y: 0, atributos: [], puntas: gestiona.map(([a, card]) => ({ a, card, rol: '' })) }],
  });

  it('el TP de la inmobiliaria, bien y al revés', () => {
    const bien = tp([['empleado', '1:1'], ['g', '0:N']]);
    expect([0, 1].map((i) => lecturaDePunta(bien, bien.vinculos[0], i))).toEqual(['Cada «alquila» va con un solo «empleado».', 'Cada «empleado» va con ninguno o muchos «alquila».']);
    const alReves = tp([['empleado', '0:N'], ['g', '1:1']]);
    expect(lecturaDePunta(alReves, alReves.vinculos[0], 0)).toBe('Cada «alquila» va con ninguno o muchos «empleado».');
  });

  it('con mínimo 0 o 1, con rol, y nada en un ternario o sin cardinalidad', () => {
    const d = tp([['empleado', '0:1'], ['g', '1:M']]);
    expect([0, 1].map((i) => lecturaDePunta(d, d.vinculos[0], i))).toEqual(['Cada «alquila» va con un «empleado» o ninguno.', 'Cada «empleado» va con uno o muchos «alquila».']);
    const jefe = tp([['empleado', '0:1'], ['empleado', '0:N']]);
    jefe.vinculos[0].puntas[0].rol = 'jefe';
    expect(lecturaDePunta(jefe, jefe.vinculos[0], 0)).toBe('Cada «empleado» va con un «jefe» o ninguno.');
    const sinCard = tp([['empleado', ''], ['g', '0:N']]);
    expect(lecturaDePunta(sinCard, sinCard.vinculos[0], 0)).toBe('');
    const ternario = tp([['empleado', '0:N'], ['g', '0:N'], ['empleado', '0:N']]);
    expect(lecturaDePunta(ternario, ternario.vinculos[0], 0)).toBe('');
  });
});

describe('dónde cae una forma nueva', () => {
  const pisa = (a, b) => a.izq < b.der && a.der > b.izq && a.arriba < b.abajo && a.abajo > b.arriba;

  it('no cae sobre otra forma ni sobre su óvalo', () => {
    // cliente with its oval of attributes over it, where a new vínculo was going to land.
    let d = derVacio();
    let cliente;
    [d, cliente] = agregarEntidad(d, { x: 0, y: 200 });
    d = cambiarAtributo(d, 'entidad', cliente, d.entidades[0].atributos[0].id, { nombre: 'dni' });
    for (const n of ['nombre', 'telefonos']) {
      let a;
      [d, a] = agregarAtributo(d, 'entidad', cliente);
      d = cambiarAtributo(d, 'entidad', cliente, a, { nombre: n });
    }
    const lugar = lugarLibre(d, { x: 0, y: 130 }, 'vinculo');
    const nuevo = ocupado({ ...derVacio(), vinculos: [{ id: 'v', x: lugar.x, y: lugar.y, atributos: [], puntas: [] }] })[0];
    expect(ocupado(d).some((c) => pisa(c, nuevo))).toBe(false);
    // Where there is room, it stays where it was asked.
    expect(lugarLibre(d, { x: 400, y: 200 }, 'vinculo')).toEqual({ x: 400, y: 200 });
  });

  it('una entidad nueva deja lugar para su óvalo, y la caja de una agregación cuenta', () => {
    let d = derVacio();
    [d] = agregarEntidad(d, { x: 0, y: 0 });
    const lugar = lugarLibre(d, { x: 0, y: 80 });
    const [w, h] = [112, 44];
    const nueva = ocupado({ ...derVacio(), entidades: [{ id: 'n', x: lugar.x, y: lugar.y, atributos: [{ nombre: 'id', partes: [] }] }] })[0];
    expect(pisa(nueva, ocupado(d)[0])).toBe(false);
    expect(nueva.abajo - nueva.arriba).toBeGreaterThan(h);
    expect(nueva.der - nueva.izq).toBe(w);
    // An aggregation takes the box around its vínculo and entities, ovals included.
    const { d: dos, a, b } = conDos();
    let v;
    let g = dos;
    [g, v] = agregarVinculo(g, [a, b], { x: 150, y: 0 });
    [g] = agregarAgregacion(g, v);
    const cajas = ocupado(g);
    expect(cajas).toHaveLength(4);
    const caja = cajas[3];
    for (const c of cajas.slice(0, 3)) expect(c.izq >= caja.izq && c.der <= caja.der && c.arriba >= caja.arriba && c.abajo <= caja.abajo).toBe(true);
  });

  // The student's TP: empleado and propiedad side by side, cliente under propiedad with its oval.
  function inmobiliaria() {
    let d = derVacio();
    const ids = {};
    for (const [n, x, y, atrs] of [['empleado', 0, 100, ['legajo', 'nombre']], ['propiedad', 160, 100, ['codigo', 'direccion', 'ambientes']], ['cliente', 160, 232, ['dni', 'nombre', 'telefonos']]]) {
      let e;
      [d, e] = agregarEntidad(d, { x, y });
      d = cambiarAtributo(d, 'entidad', e, d.entidades.at(-1).atributos[0].id, { nombre: atrs[0] });
      d = { ...d, entidades: d.entidades.map((x) => (x.id === e ? { ...x, nombre: n, atributos: [...x.atributos, ...atrs.slice(1).map((a, i) => ({ id: `${e}-${i}`, nombre: a, clave: false, multivaluado: false, derivado: false, partes: [] }))] } : x)) };
      ids[n] = e;
    }
    return { d, ids };
  }

  it('un vínculo nuevo va entre sus puntas, o al lugar libre más cerca, y crece con su nombre', () => {
    const { d, ids } = inmobiliaria();
    const [d2, v] = agregarVinculo(d, [ids.empleado, ids.propiedad]);
    const caja = ocupado(d2).find((c) => c.id === v);
    expect(ocupado(d2).filter((c) => c.id !== v).some((c) => pisa(c, caja))).toBe(false);
    // «empleado_propiedad» is wider than a short name.
    expect(caja.der - caja.izq).toBeGreaterThan(200);
    // cliente right under propiedad: alquila goes to a side, so neither line goes through the other entity.
    const [d3, al] = agregarVinculo(d, [ids.cliente, ids.propiedad]);
    const rombo = ocupado(d3).find((c) => c.id === al);
    const medio = { x: (rombo.izq + rombo.der) / 2, y: (rombo.arriba + rombo.abajo) / 2 };
    const cajaDe2 = (id) => {
      const e = d3.entidades.find((x) => x.id === id);
      const [w, h] = medidaDe('entidad', e);
      return { izq: e.x, der: e.x + w, arriba: e.y, abajo: e.y + h, c: { x: e.x + w / 2, y: e.y + h / 2 } };
    };
    for (const [a, b] of [[ids.cliente, ids.propiedad], [ids.propiedad, ids.cliente]]) {
      const fin = cajaDe2(a).c;
      const otra = cajaDe2(b);
      const pasa = Array.from({ length: 101 }, (_, i) => ({ x: medio.x + ((fin.x - medio.x) * i) / 100, y: medio.y + ((fin.y - medio.y) * i) / 100 })).some((p) => p.x > otra.izq && p.x < otra.der && p.y > otra.arriba && p.y < otra.abajo);
      expect(pasa).toBe(false);
    }
    // Far apart, it lands right between them.
    let lejos = derVacio();
    let a;
    let b;
    [lejos, a] = agregarEntidad(lejos, { x: 0, y: 0 });
    [lejos, b] = agregarEntidad(lejos, { x: 600, y: 0 });
    const [l2, w] = agregarVinculo(lejos, [a, b]);
    const nuevo = l2.vinculos.find((x) => x.id === w);
    const [w2, h2] = medidaDe('vinculo', nuevo);
    expect(Math.abs(nuevo.x + w2 / 2 - 356)).toBeLessThanOrEqual(8);
    expect(Math.abs(nuevo.y + h2 / 2 - 22)).toBeLessThanOrEqual(8);
  });

  it('el óvalo que crece sobre un vecino se corre a un lado libre', () => {
    const { d, ids } = inmobiliaria();
    // alquila right under empleado: its oval would land on it.
    let [g, v] = agregarVinculo(d, [ids.cliente, ids.propiedad], { x: -150, y: 180 });
    let a;
    [g, a] = agregarAtributo(g, 'vinculo', v);
    g = cambiarAtributo(g, 'vinculo', v, a, { nombre: 'fecha_inicio' });
    [g] = agregarAtributo(g, 'vinculo', v);
    const x = g.vinculos.find((y) => y.id === v);
    const [w, h] = medidaDe('vinculo', x);
    const ovalo = soloOvalo({ x: x.x, y: x.y, w, h, ovalo: medidaOvalo(x.atributos, x.ovalo) });
    expect(x.ovalo).toBeDefined();
    expect(ocupado(g, v).some((c) => pisa(c, ovalo))).toBe(false);
    // With room above, it stays over its shape, as always.
    let solo = derVacio();
    let e;
    [solo, e] = agregarEntidad(solo, { x: 0, y: 0 });
    [solo] = agregarAtributo(solo, 'entidad', e);
    expect(solo.entidades[0].ovalo).toBeUndefined();
  });

  it('con otro nombre, la forma crece a los dos lados y su medio queda', () => {
    const { d, a } = conDos();
    const [d2, v] = agregarVinculo(d, [a, a], { x: 0, y: 200 });
    for (const [tipo, id] of [['entidad', a], ['vinculo', v]]) {
      const antes = centroDe(d2, a);
      const x0 = d2[tipo === 'entidad' ? 'entidades' : 'vinculos'].find((x) => x.id === id);
      const despues = renombrar(d2, tipo, id, 'departamento_de_ventas');
      const x1 = despues[tipo === 'entidad' ? 'entidades' : 'vinculos'].find((x) => x.id === id);
      expect(x1.nombre).toBe('departamento_de_ventas');
      expect(Math.abs(x1.x + medidaDe(tipo, x1)[0] / 2 - (x0.x + medidaDe(tipo, x0)[0] / 2))).toBeLessThanOrEqual(1);
      if (tipo === 'entidad') expect(Math.abs(centroDe(despues, a).x - antes.x)).toBeLessThanOrEqual(1);
    }
  });

  it('las puntas de un vínculo nuevo salen de lo elegido', () => {
    const { d, ids } = inmobiliaria();
    expect(extremosNuevos(d, [ids.cliente, ids.empleado])).toEqual([ids.cliente, ids.empleado]);
    // One: it and the nearest entity.
    expect(extremosNuevos(d, [ids.cliente])).toEqual([ids.cliente, ids.propiedad]);
    // An aggregation: it and the nearest entity that isn't inside it.
    let [g, v] = agregarVinculo(d, [ids.cliente, ids.propiedad], { x: 320, y: 160 });
    let agr;
    [g, agr] = agregarAgregacion(g, v);
    expect(extremosNuevos(g, [agr])).toEqual([agr, ids.empleado]);
    // Nothing chosen: the first two, as before; one entity alone, with itself.
    expect(extremosNuevos(d, [])).toEqual([ids.empleado, ids.propiedad]);
    const [uno, e] = agregarEntidad(derVacio(), { x: 0, y: 0 });
    expect(extremosNuevos(uno, [])).toEqual([e, e]);
  });
});

describe('geometría de las líneas', () => {
  it('la línea arranca en el borde de cada forma', () => {
    const rect = { cx: 0, cy: 0, w: 100, h: 40, forma: 'entidad' };
    const rombo = { cx: 200, cy: 0, w: 100, h: 50, forma: 'vinculo' };
    const { p, q } = tramo(rect, rombo);
    expect(p).toEqual({ x: 50, y: 0 });
    expect(q).toEqual({ x: 150, y: 0 });
  });

  it('la caja de una agregación toma los óvalos de arriba', () => {
    const c = cajaDe([{ x: 0, y: 100, w: 100, h: 40, ovalo: { w: 80, h: 60 } }, { x: 200, y: 100, w: 100, h: 40 }], 10);
    expect(c).toEqual({ x: -10, y: 30, w: 320, h: 120 });
  });

  it('un óvalo corrido estira la caja hacia donde quedó', () => {
    const c = cajaDe([{ x: 0, y: 100, w: 100, h: 40, ovalo: { w: 80, h: 60, dx: 0, dy: 80 } }], 10);
    expect(c).toEqual({ x: -10, y: 90, w: 120, h: 150 });
  });

  it('la línea al óvalo termina en su borde', () => {
    const { q } = tramo({ cx: 0, cy: 0, w: 100, h: 40, forma: 'entidad' }, { cx: 0, cy: 100, w: 80, h: 60, forma: 'ovalo' });
    expect(q).toEqual({ x: 0, y: 70 });
  });
});
