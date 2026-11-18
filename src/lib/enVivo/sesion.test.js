// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearSesion, redesLocales, CADA_CAMBIOS, CADA_CONCIENCIA, ESPERA_FIN, ESPERA_MESA, ESPERA_NADIE, GRACIA, PARTE_ARCHIVO, TOPE_MESA } from './sesion';

const abiertas = [];
function armar(n) {
  const redes = redesLocales(n);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: `Alumno ${k}`, color: '#123456', anfitrion: k === 0 } }));
  abiertas.push(...sesiones);
  return sesiones;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
});

// A reload, on the network: the page before drops without a goodbye (nothing more leaves it), and the new one comes in
// with the same person and a network of its own.
const PERSONA = '0123456789abcdef';
// `cuantos`: how many others; `directa`: whether they have direct connections (or only Realtime).
function conRecarga({ cuantos = 1, directa = true } = {}) {
  const redes = redesLocales(cuantos + 2);
  const nueva = redes[cuantos + 1];
  nueva.abierta = false;
  redes.slice(1, cuantos + 1).forEach((r) => {
    r.directa = directa;
  });
  const [antes, ...otros] = redes.slice(0, cuantos + 1).map((red, k) => crearSesion({ red, yo: { id: k === 0 ? PERSONA : undefined, nombre: `Alumno ${k}`, color: '#123456' } }));
  abiertas.push(antes, ...otros);
  const avisarPares = () => redes.forEach((o) => o.abierta && o.pares?.(new Set(redes.filter((x) => x !== o && x.abierta).map((x) => x.yo))));
  return {
    antes,
    otro: otros[0],
    otros,
    redes,
    caer() {
      redes[0].mandar = () => {};
      redes[0].cerrar();
    },
    volver() {
      nueva.abierta = true;
      const despues = crearSesion({ red: nueva, yo: { id: PERSONA, nombre: 'Alumno 0', color: '#123456' } });
      abiertas.push(despues);
      avisarPares();
      return despues;
    },
  };
}

describe('sesión en vivo', () => {
  it('quien recargó no aparece dos veces: su yo de antes, que otro le reenvía, no cuenta', async () => {
    const [a, b] = armar(2);
    await esperar(CADA_CONCIENCIA + 50);
    // A state from a browser that is no longer connected (the one before reloading), relayed to b.
    const viejo = new (await import('yjs')).Doc();
    const aw = await import('y-protocols/awareness');
    const fantasma = new aw.Awareness(viejo);
    fantasma.setLocalState({ red: 'r9', nombre: 'Alumno 0', color: '#123456' });
    aw.applyAwarenessUpdate(b.conciencia, aw.encodeAwarenessUpdate(fantasma, [viejo.clientID]), 'otro');
    fantasma.destroy();
    expect(b.otros().map((o) => o.nombre)).toEqual(['Alumno 0']);
    expect(a.otros().map((o) => o.nombre)).toEqual(['Alumno 1']);
  });

  it('lo que escribe uno le llega al otro, juntado', async () => {
    const [a, b] = armar(2);
    a.doc.getText('t').insert(0, 'hola');
    a.doc.getText('t').insert(4, ' che');
    await esperar(CADA_CAMBIOS + 30);
    expect(b.doc.getText('t').toString()).toBe('hola che');
  });

  it('quien llega tarde recibe todo lo que ya había', async () => {
    const redes = redesLocales(2);
    const a = crearSesion({ red: redes[0], yo: { nombre: 'A', color: '#000' } });
    abiertas.push(a);
    a.doc.getArray('chat').push(['primero']);
    await esperar(CADA_CAMBIOS + 30);
    const b = crearSesion({ red: redes[1], yo: { nombre: 'B', color: '#000' } });
    abiertas.push(b);
    await esperar(50);
    expect(b.doc.getArray('chat').toArray()).toEqual(['primero']);
  });

  it('cada uno ve a los demás, con su nombre, y se va al salir', async () => {
    const [a, b] = armar(2);
    await esperar(CADA_CONCIENCIA + 50);
    expect(a.otros().map((o) => o.nombre)).toEqual(['Alumno 1']);
    expect(b.otros()[0]).toMatchObject({ nombre: 'Alumno 0', anfitrion: true });
    b.cerrar();
    await esperar(20);
    expect(a.otros()).toEqual([]);
  });

  it('terminar para todos: les llega a los demás, que se van, y recién entonces sale quien la terminó', async () => {
    const [a, b, c] = armar(3);
    await esperar(CADA_CONCIENCIA + 50);
    const oidos = [];
    const propio = vi.fn();
    a.alTerminar(propio);
    [b, c].forEach((s) => s.alTerminar((fin) => {
      oidos.push(fin);
      s.cerrar();
    }));
    const desde = Date.now();
    await a.terminar({ por: 'Alumno 0', cuando: 7 });
    // Out as soon as both left, long before the top: it was not cut off by leaving.
    expect(Date.now() - desde).toBeLessThan(ESPERA_FIN / 2);
    expect(oidos).toEqual([{ por: 'Alumno 0', cuando: 7 }, { por: 'Alumno 0', cuando: 7 }]);
    a.cerrar();
    await esperar(20);
    // Whoever ended it is not told it ended (that closed the session before the change went out).
    expect(propio).not.toHaveBeenCalled();
  });

  it('quien entra a una sesión ya terminada también se va', async () => {
    const redes = redesLocales(2);
    redes[1].abierta = false;
    const a = crearSesion({ red: redes[0], yo: { nombre: 'Alumno 0', color: '#123456' } });
    abiertas.push(a);
    await a.terminar({ por: 'Alumno 0', cuando: 1 });
    redes[1].abierta = true;
    const b = crearSesion({ red: redes[1], yo: { nombre: 'Alumno 1', color: '#123456' } });
    abiertas.push(b);
    const fin = vi.fn();
    b.alTerminar(fin);
    redes[0].pares(new Set(['r1']));
    redes[1].pares?.(new Set(['r0']));
    await esperar(50);
    expect(fin).toHaveBeenCalledWith({ por: 'Alumno 0', cuando: 1 });
  });

  it('un archivo va en partes y llega entero solo a quien lo pidió', async () => {
    const [a, b, c] = armar(3);
    const bytes = new Uint8Array(PARTE_ARCHIVO * 2 + 10).map((_, i) => i % 251);
    const id = a.archivos.compartir(new Blob([bytes], { type: 'application/pdf' }), 'apunte.pdf');
    const llego = await b.archivos.pedir(id, a.yo.id);
    expect(new Uint8Array(await llego.arrayBuffer())).toEqual(bytes);
    expect(llego.type).toBe('application/pdf');
    expect(c.archivos.estado(id).tiene).toBe(false);
  });

  it('recargar no es irse: sigue siendo la misma persona, que vuelve dentro del rato de gracia', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { antes, otro, caer, volver } = conRecarga();
      await esperar(CADA_CONCIENCIA + 50);
      expect(otro.presente(PERSONA)).toMatchObject({ nombre: 'Alumno 0' });
      caer();
      await esperar(20);
      // Gone from the network, not from the session: they may be reloading.
      expect(otro.presente(PERSONA)).toEqual({ nombre: 'Alumno 0', volviendo: true });
      const despues = volver();
      await esperar(CADA_CONCIENCIA + 50);
      expect(despues.yo.id).toBe(antes.yo.id);
      expect(otro.presente(PERSONA)).toMatchObject({ nombre: 'Alumno 0' });
      expect(otro.presente(PERSONA).volviendo).toBeUndefined();
      expect(otro.otros().map((o) => o.id)).toEqual([PERSONA]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('quien se cae y no vuelve se fue pasado el rato de gracia; quien sale, enseguida', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { otro, caer } = conRecarga();
      await esperar(CADA_CONCIENCIA + 50);
      caer();
      await esperar(20);
      expect(otro.presente(PERSONA)?.volviendo).toBe(true);
      vi.setSystemTime(Date.now() + GRACIA + 1);
      expect(otro.presente(PERSONA)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    const [a, b] = armar(2);
    await esperar(CADA_CONCIENCIA + 50);
    b.cerrar();
    await esperar(20);
    expect(a.presente(b.yo.id)).toBeNull();
  });

  // A file on the table, as Apunte puts it: its tab and who has it.
  const BYTES = new Uint8Array(PARTE_ARCHIVO + 10).map((_, i) => i % 251);
  function enLaMesa(s, pestana = 'a1b2c3d4e5f6') {
    const id = s.archivos.compartir(new Blob([BYTES], { type: 'application/pdf' }), 'apunte.pdf');
    s.doc.transact(() => {
      const datos = s.doc.getMap(`h:${pestana}`);
      datos.set('archivo', id);
      datos.set('nombre', 'apunte.pdf');
      datos.set('de', s.yo.id);
      s.doc.getMap('pestanas').set(pestana, { tipo: 'apunte', titulo: 'Apunte', cuando: 1 });
    });
    return id;
  }
  const bytesDe = async (blob) => new Uint8Array(await blob.arrayBuffer());

  it('un archivo llega a todos apenas está en la mesa, y vuelve a quien recargó sin hacer nada', async () => {
    const { antes, otros, redes, caer, volver } = conRecarga({ cuantos: 2 });
    await esperar(CADA_CONCIENCIA + 50);
    const id = enLaMesa(antes);
    await esperar(CADA_CAMBIOS + CADA_CONCIENCIA + 100);
    // Nobody opened it: each one has its copy already.
    otros.forEach((o) => expect(o.archivos.estado(id).tiene).toBe(true));
    caer();
    await esperar(20);
    // Asked to only one of those who have it.
    const pedidos = [];
    const nueva = redes.at(-1);
    const mandar = nueva.mandar;
    nueva.mandar = (bytes, para) => {
      if (bytes[0] === 4) pedidos.push(para);
      return mandar(bytes, para);
    };
    const despues = volver();
    await esperar(CADA_CAMBIOS + CADA_CONCIENCIA + 200);
    expect(despues.archivos.estado(id).tiene).toBe(true);
    expect(await bytesDe(await despues.archivos.pedir(id, PERSONA))).toEqual(BYTES);
    expect(pedidos).toHaveLength(1);
    expect([redes[1].yo, redes[2].yo]).toContain(pedidos[0]);
  });

  it('con solo Realtime, un archivo se trae recién cuando se abre su pestaña', async () => {
    const { antes, otro } = conRecarga({ directa: false });
    await esperar(CADA_CONCIENCIA + 50);
    const id = enLaMesa(antes);
    await esperar(CADA_CAMBIOS + CADA_CONCIENCIA + 100);
    expect(otro.archivos.estado(id)).toMatchObject({ tiene: false, hay: 1, nadie: false });
    expect(await bytesDe(await otro.archivos.pedir(id, PERSONA))).toEqual(BYTES);
  });

  it('si nadie más lo tiene se dice, y llega cuando quien lo compartió lo vuelve a poner', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { antes, otro, caer, volver } = conRecarga({ directa: false });
      await esperar(CADA_CONCIENCIA + 50);
      const id = enLaMesa(antes);
      await esperar(CADA_CAMBIOS + 50);
      caer();
      await esperar(20);
      const despues = volver();
      await esperar(CADA_CONCIENCIA + 50);
      const llega = otro.archivos.pedir(id, PERSONA);
      // The others had a moment to say they have it.
      expect(otro.archivos.estado(id).nadie).toBe(false);
      vi.setSystemTime(Date.now() + ESPERA_NADIE);
      expect(otro.archivos.estado(id)).toMatchObject({ tiene: false, hay: 0, nadie: true });
      expect(despues.archivos.estado(id).nadie).toBe(true);
      // In the same tab, with the same id.
      expect(despues.archivos.compartir(new Blob([BYTES], { type: 'application/pdf' }), 'apunte.pdf', id)).toBe(id);
      expect(await bytesDe(await llega)).toEqual(BYTES);
    } finally {
      vi.useRealTimers();
    }
  });

  it('la mesa no está vacía hasta que llega de los demás, o no hay nadie que la traiga', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { antes, otro, caer, volver } = conRecarga();
      expect(antes.cargada()).toBe(false);
      await esperar(CADA_CONCIENCIA + 50);
      expect(antes.cargada()).toBe(true);
      otro.doc.getMap('pestanas').set('p1', { tipo: 'pizarra' });
      await esperar(CADA_CAMBIOS + 30);
      caer();
      const despues = volver();
      // Just back from the reload: the table is on its way, not empty.
      expect(despues.cargada()).toBe(false);
      await esperar(30);
      expect(despues.cargada()).toBe(true);
      expect(despues.doc.getMap('pestanas').get('p1')).toEqual({ tipo: 'pizarra' });
      // Alone, it is what there is after the first wait; one just made, at once.
      const [solo] = redesLocales(1).map((red) => crearSesion({ red, yo: { nombre: 'Solo' } }));
      const [hecha] = redesLocales(1).map((red) => crearSesion({ red, yo: { nombre: 'Hecha' }, nueva: true }));
      abiertas.push(solo, hecha);
      expect(hecha.cargada()).toBe(true);
      expect(solo.cargada()).toBe(false);
      vi.setSystemTime(Date.now() + ESPERA_MESA);
      expect(solo.cargada()).toBe(true);
      expect(TOPE_MESA).toBeGreaterThan(ESPERA_MESA);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un archivo de más de 25 MB no se comparte', () => {
    const [a] = armar(1);
    const grande = { size: 26 * 1024 * 1024 };
    Object.setPrototypeOf(grande, Blob.prototype);
    expect(() => a.archivos.compartir(grande, 'x.pdf')).toThrow(/25 MB/);
  });

  it('un mensaje roto no rompe la sesión', async () => {
    const redes = redesLocales(2);
    const a = crearSesion({ red: redes[0], yo: { nombre: 'A', color: '#000' } });
    const b = crearSesion({ red: redes[1], yo: { nombre: 'B', color: '#000' } });
    abiertas.push(a, b);
    redes[1].mandar(new Uint8Array([2, 200, 1, 2]));
    redes[1].mandar(new Uint8Array([99]));
    b.doc.getText('t').insert(0, 'sigue');
    await esperar(CADA_CAMBIOS + 30);
    expect(a.doc.getText('t').toString()).toBe('sigue');
  });

  it('el texto de cada pestaña para Consultron, sin la que falla', () => {
    const [a] = armar(1);
    a.paraConsultron('p1', () => 'uno');
    const sacar = a.paraConsultron('p2', () => {
      throw new Error('x');
    });
    expect(a.textos()).toEqual([{ id: 'p1', texto: 'uno' }]);
    sacar();
    expect(a.textos()).toHaveLength(1);
  });
});

vi.setConfig({ testTimeout: 5000 });
