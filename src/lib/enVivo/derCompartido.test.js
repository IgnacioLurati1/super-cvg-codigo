import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { INSTRUMENTOS } from '../laboratorio/der/instrumentos.fixture';
import { derEnTexto, derVacio, leerDer } from '../laboratorio/der/modelo';
import { MAX_CODIGO } from '../laboratorio/saneo';
import { entradasDer, leerDerCompartido, manejoDer, marcaDer, ponerDerCompartido, vistaDer } from './derCompartido';
import { comoMio, convertirDers, inicialDelLaboratorio, leerCarpeta, sumarArchivo } from './laboratorioCompartido';

// Two Y.Docs that hear each other, as two browsers of the same session.
function dos() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (u, origen) => origen !== 'b' && Y.applyUpdate(b, u, 'a'));
  b.on('update', (u, origen) => origen !== 'a' && Y.applyUpdate(a, u, 'b'));
  a.getMap('der');
  return { a, b, ma: a.getMap('der'), mb: b.getMap('der') };
}

const mover = (der, coleccion, id, cambios) => ({ ...der, [coleccion]: der[coleccion].map((x) => (x.id === id ? { ...x, ...cambios } : x)) });

describe('el DER compartido por elemento', () => {
  it('de ida y vuelta queda igual, también el texto del archivo', () => {
    const doc = new Y.Doc();
    const m = doc.getMap('der');
    expect(ponerDerCompartido(m, INSTRUMENTOS)).toBe(true);
    expect(leerDerCompartido(m)).toEqual(INSTRUMENTOS);
    expect(derEnTexto(leerDerCompartido(m))).toBe(derEnTexto(INSTRUMENTOS));
    // An entry per thing and per decision.
    expect(m.has(`e:${INSTRUMENTOS.entidades[0].id}`)).toBe(true);
    expect([...m.keys()].some((k) => k.startsWith('d:cp:'))).toBe(true);
  });

  it('dos que mueven cosas distintas a la vez se quedan con las dos', () => {
    const { a, b, ma, mb } = dos();
    ponerDerCompartido(ma, INSTRUMENTOS);
    expect(leerDerCompartido(mb)).toEqual(INSTRUMENTOS);
    const [e1, e2] = INSTRUMENTOS.entidades;
    // Each one writes the whole sheet as they see it, at the same time (no update goes in between).
    const enA = new Y.Doc();
    const enB = new Y.Doc();
    Y.applyUpdate(enA, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(enB, Y.encodeStateAsUpdate(b));
    ponerDerCompartido(enA.getMap('der'), mover(INSTRUMENTOS, 'entidades', e1.id, { x: 1000, y: 1000 }));
    ponerDerCompartido(enB.getMap('der'), mover(INSTRUMENTOS, 'entidades', e2.id, { x: -500, nombre: 'otra' }));
    Y.applyUpdate(enA, Y.encodeStateAsUpdate(enB));
    Y.applyUpdate(enB, Y.encodeStateAsUpdate(enA));
    for (const d of [enA, enB]) {
      const der = leerDerCompartido(d.getMap('der'));
      expect(der.entidades.find((e) => e.id === e1.id)).toMatchObject({ x: 1000, y: 1000 });
      expect(der.entidades.find((e) => e.id === e2.id)).toMatchObject({ x: -500, nombre: 'otra' });
      expect(der.entidades.map((e) => e.id)).toEqual(INSTRUMENTOS.entidades.map((e) => e.id));
    }
  });

  it('cada uno deshace solo lo suyo', () => {
    const { ma, mb } = dos();
    ponerDerCompartido(ma, INSTRUMENTOS);
    const ha = manejoDer(ma);
    const hb = manejoDer(mb);
    const [e1, e2] = INSTRUMENTOS.entidades;
    ha.escribir(mover(ha.leer().der, 'entidades', e1.id, { x: 1 }));
    hb.escribir(mover(hb.leer().der, 'entidades', e2.id, { x: 2 }));
    expect(ha.leer().atras).toBe(1);
    ha.deshacer();
    const der = hb.leer().der;
    expect(der.entidades.find((e) => e.id === e1.id).x).toBe(e1.x);
    expect(der.entidades.find((e) => e.id === e2.id).x).toBe(2);
    expect(ha.leer().adelante).toBe(1);
    ha.destruir();
    hb.destruir();
  });

  it('lo nuevo va al final; lo que se borra sale con sus decisiones', () => {
    const doc = new Y.Doc();
    const m = doc.getMap('der');
    ponerDerCompartido(m, INSTRUMENTOS);
    const nueva = { id: 'ezz', nombre: 'nueva', debil: false, x: 0, y: 0, atributos: [] };
    ponerDerCompartido(m, { ...INSTRUMENTOS, entidades: [nueva, ...INSTRUMENTOS.entidades] });
    expect(leerDerCompartido(m).entidades.at(-1).id).toBe('ezz');
    const v = Object.keys(INSTRUMENTOS.decisiones.cp)[0];
    ponerDerCompartido(m, { ...INSTRUMENTOS, vinculos: INSTRUMENTOS.vinculos.filter((x) => x.id !== v) });
    expect(m.has(`v:${v}`)).toBe(false);
    expect(m.has(`d:cp:${v}`)).toBe(false);
  });

  it('lo que llega mal armado se descarta y lo demás se lee', () => {
    const doc = new Y.Doc();
    const m = doc.getMap('der');
    ponerDerCompartido(m, INSTRUMENTOS);
    const e = INSTRUMENTOS.entidades[0];
    doc.transact(() => {
      m.set('e:otro', { o: 1, e: { ...e, id: 'distinto' } });
      m.set('e:__proto__', { o: 1, e: { id: '__proto__' } });
      m.set('x:raro', 'algo');
      m.set('v:malo', 'no es un objeto');
      m.set('d:cp:__proto__', ['a']);
      m.set('d:tipos:__proto__', 'INT');
      m.set(`e:${e.id}`, { o: 'x', e: { ...e, nombre: 'a'.repeat(5000), x: 1e12, atributos: [{ id: 'aa', nombre: '<b>' }] } });
    });
    const der = leerDerCompartido(m);
    expect(der.entidades.map((x) => x.id)).not.toContain('distinto');
    expect(der.entidades.length).toBe(INSTRUMENTOS.entidades.length);
    const leida = der.entidades.find((x) => x.id === e.id);
    expect(leida.nombre.length).toBeLessThanOrEqual(64);
    expect(Math.abs(leida.x)).toBeLessThanOrEqual(100_000);
    expect(Object.getPrototypeOf(der.decisiones.cp)).toBe(Object.prototype);
    expect(leerDer(derEnTexto(der))).toEqual(der);
  });

  it('si entre todos se pasa del tamaño de un archivo, se van las cosas más nuevas', () => {
    const doc = new Y.Doc();
    const m = doc.getMap('der');
    const muchas = [...Array(190)].map((_, i) => ({ id: `e${i}`, nombre: `entidad_${i}`, debil: false, x: i, y: i, atributos: [...Array(3)].map((__, j) => ({ id: `a${i}_${j}`, nombre: `atributo_largo_${j}` })) }));
    doc.transact(() => muchas.forEach((e, i) => m.set(`e:${e.id}`, { o: i + 1, e })));
    const der = leerDerCompartido(m);
    expect(derEnTexto(der).length).toBeLessThanOrEqual(MAX_CODIGO);
    expect(der.entidades.length).toBeLessThan(190);
    expect(der.entidades[0].id).toBe('e0');
    // Writing one that big from here is refused.
    expect(ponerDerCompartido(doc.getMap('otro'), { ...derVacio(), entidades: muchas })).toBe(false);
  });

  it('las marcas y la vista de los otros se leen revisadas', () => {
    expect(marcaDer({ archivo: 'l1', x: 3.4, y: 1e9, sel: ['e:a', 'x:b', 5, 'v:c'] }, 'l1')).toEqual({ x: 3, y: 100000, sel: ['e:a', 'v:c'] });
    expect(marcaDer({ archivo: 'l2', x: 1, y: 1 }, 'l1')).toBeNull();
    expect(marcaDer({ archivo: 'l1', x: 'a', y: 1 }, 'l1')).toEqual({ x: null, y: null, sel: [] });
    expect(vistaDer({ archivo: 'l1', cx: 10, cy: 20, z: 9 }, 'l1')).toEqual({ cx: 10, cy: 20, z: 2 });
    expect(vistaDer({ archivo: 'l1', linea: 3 }, 'l1')).toBeNull();
  });
});

describe('el .der en la carpeta de la mesa', () => {
  const conProyectoSql = () => {
    const doc = new Y.Doc();
    const datos = doc.getMap('pestana');
    const ini = inicialDelLaboratorio();
    datos.set('proyectos', ini.proyectos);
    const pid = [...ini.proyectos.keys()][0];
    datos.get('proyectos').get(pid).set('lenguaje', 'sql');
    datos.get('proyectos').get(pid).set('archivos', new Y.Map());
    return { doc, datos, pid };
  };

  it('uno que se suma ya va por elemento, y su texto es el del archivo', () => {
    const { datos, pid } = conProyectoSql();
    const { id } = sumarArchivo(datos, pid, { nombre: 'instrumentos', ext: 'der', codigo: derEnTexto(INSTRUMENTOS) });
    const a = leerCarpeta(datos)[0].archivos.find((x) => x.id === id);
    expect(a.texto).toBeNull();
    expect(a.der).toBeInstanceOf(Y.Map);
    expect(a.codigo).toBe(derEnTexto(INSTRUMENTOS));
    expect(comoMio(datos).laboratorio.find((x) => x.id === id).codigo).toBe(derEnTexto(INSTRUMENTOS));
    // One whose text isn't a DER starts empty.
    const otro = sumarArchivo(datos, pid, { nombre: 'roto', ext: 'der', codigo: '{nada' }).id;
    expect(leerDer(leerCarpeta(datos)[0].archivos.find((x) => x.id === otro).codigo)).toEqual(derVacio());
  });

  it('uno de antes, como texto, se pasa una vez a elementos con lo que tenía', () => {
    const { datos, pid } = conProyectoSql();
    const t = new Y.Text();
    t.insert(0, JSON.stringify(JSON.parse(derEnTexto(INSTRUMENTOS)), null, 1));
    datos.get('proyectos').get(pid).get('archivos').set('lviejo01', new Y.Map([['nombre', 'viejo'], ['ext', 'der'], ['codigo', t], ['cuando', 1]]));
    expect(leerCarpeta(datos)[0].archivos[0].texto).toBeInstanceOf(Y.Text);
    convertirDers(datos);
    const a = leerCarpeta(datos)[0].archivos[0];
    expect(a.texto).toBeNull();
    expect(leerDerCompartido(a.der)).toEqual(INSTRUMENTOS);
    const mapa = a.der;
    convertirDers(datos);
    expect(leerCarpeta(datos)[0].archivos[0].der).toBe(mapa);
  });

  it('el mapa de un .der nuevo se arma con sus entradas', () => {
    const m = new Y.Doc().getMap('x');
    entradasDer(INSTRUMENTOS).forEach(([k, v]) => m.set(k, v));
    expect(leerDerCompartido(m)).toEqual(INSTRUMENTOS);
  });
});
