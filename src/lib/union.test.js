import { describe, expect, it } from 'vitest';
import { sanearMio } from './mio';
import { MAX_CODIGO } from './laboratorio/saneo';
import { armar, juntarCodigos, juntarTextos, marcar, mismasPiezas, piezas, unir, VIDA_BORRADOS_MS } from './union';

const H = 1_800_000_000_000;
const limpio = (d) => sanearMio(d);

const base = () => limpio({
  materias: {
    7: {
      secciones: [3, 'p12'], ocultos: ['101'], nombres: { 101: 'Apunte' }, orden: { 3: ['101', 'c55'] }, vistos: ['101'], parcial: ['102'],
      nota: 'Repasar semáforos', tareas: [{ id: 1, texto: 'TP 1', hecha: false, fecha: '2026-11-10' }], fechas: [{ id: 2, titulo: 'Parcial', cuando: 1_790_000_000, sinHora: true }],
      descartes: ['abc'], foto: { 101: 5 }, classroom: '700001', lugares: { c55: 'p12' },
    },
  },
  eventos: [{ id: 9, titulo: 'Final', cuando: 1_790_000_000, sinHora: false, tipo: 'examen', materiaId: 7 }],
  cursos: { 700001: 1_780_000_000 },
  campus: { 501: { borrado: true }, 502: { titulo: 'Parcial corrido', cuando: 1_790_000_000, sinHora: false, tipo: 'parcial', materiaId: 7, vence: true } },
  horario: {
    extras: [{ id: 4, materia: 'Ingeniería y Calidad de Software', comision: '4K01', aulas: { 3: 'Aula 210' } }],
    aMano: { cursos: { 7: [{ dia: 2, desde: 480, hasta: 600, aula: 'Lab 1', cuatrimestre: 1 }] }, extras: { 4: [] } },
  },
  propias: [{
    id: 'pabcdef12', nombre: 'Mi materia', base: null, classroom: null, de: null, cambiada: 1_780_000_000,
    categorias: [
      { id: 11, nombre: 'General', bloques: [{ id: 21, tipo: 'texto', texto: 'Hola' }, { id: 22, tipo: 'archivo', archivoId: 'archivo0001', nombre: 'tp.pdf', peso: 10 }] },
      { id: 12, nombre: 'Links', bloques: [{ id: 23, tipo: 'enlace', url: 'https://example.com/', titulo: 'Ej' }] },
    ],
  }],
});

// A device: its data and its marks, changed the way mio.js and sincro.js change them.
function dispositivo(datos, marcas = { t: {}, d: {} }) {
  return {
    datos: limpio(datos),
    marcas,
    unido: false,
    cambiar(fn, ahora) {
      const despues = limpio(fn(structuredClone(this.datos)));
      this.marcas = marcar(this.marcas, this.datos, despues, ahora);
      this.datos = despues;
    },
  };
}

// What sincro.js does with the copy: join, keep the result and what the copy does not have yet.
function sincronizar(disp, copia, ahora) {
  const r = unir({ datos: disp.datos, t: disp.marcas.t, d: disp.marcas.d }, copia, { primera: !disp.unido, ahora });
  disp.datos = limpio(r.datos);
  disp.marcas = { t: r.t, d: {} };
  disp.unido = true;
  return { datos: disp.datos, t: r.t };
}

describe('los elementos', () => {
  it('se arman de vuelta igual, con todo lo que guarda un alumno', () => {
    const d = base();
    expect(limpio(armar(piezas(d)))).toEqual(d);
    expect(mismasPiezas(limpio(armar(piezas(d))), d)).toBe(true);
  });

  it('las marcas de una materia propia y el nombre de una sección del campus también viajan', () => {
    const d = limpio({ materias: { 7: { nombres: { s3: 'Prácticos' } }, pabc1234: { vistos: ['p11'], parcial: ['55'], plegadas: ['p1'], nombres: { p12: 'Mío' } } } });
    expect(limpio(armar(piezas(d)))).toEqual(d);
  });

  it('una nota vacía o un orden vacío no son elementos', () => {
    const d = limpio({ materias: { 7: { nota: '', orden: { 3: [] } } } });
    expect(piezas(d)).toEqual({});
  });
});

describe('dos dispositivos sin conexión', () => {
  const empezar = () => {
    const a = dispositivo(base());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(base());
    sincronizar(b, copia, H + 1);
    return { a, b, copia };
  };

  it('cada uno cambió una cosa distinta: quedan las dos', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], nombres: { ...d.materias[7].nombres, 101: 'Apunte de la compu' } } } }), H + 10);
    b.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], ocultos: [...d.materias[7].ocultos, '102'] } } }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    const final = sincronizar(a, c3, H + 50).datos;
    expect(final.materias[7].nombres[101]).toBe('Apunte de la compu');
    expect(final.materias[7].ocultos.sort()).toEqual(['101', '102']);
    expect(b.datos).toEqual(final);
  });

  it('la misma nota en los dos: quedan las dos versiones, la última primero', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], nota: 'Desde la compu' } } }), H + 10);
    b.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], nota: 'Desde el celu' } } }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    expect(c3.datos.materias[7].nota).toBe('Desde el celu\n\nDesde la compu');
    expect(sincronizar(a, c3, H + 50).datos.materias[7].nota).toBe('Desde el celu\n\nDesde la compu');
  });

  it('una nota que siguió escribiéndose en un solo lado no se duplica', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], nota: 'Repasar semáforos y monitores' } } }), H + 10);
    const c2 = sincronizar(a, copia, H + 20);
    expect(sincronizar(b, c2, H + 30).datos.materias[7].nota).toBe('Repasar semáforos y monitores');
  });

  it('la misma tarea en los dos: gana el último cambio', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], tareas: [{ ...d.materias[7].tareas[0], hecha: true }] } } }), H + 20);
    b.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], tareas: [{ ...d.materias[7].tareas[0], texto: 'TP 1 corregido' }] } } }), H + 10);
    const c2 = sincronizar(b, copia, H + 30);
    const c3 = sincronizar(a, c2, H + 40);
    expect(c3.datos.materias[7].tareas).toEqual([{ id: 1, texto: 'TP 1', hecha: true, fecha: '2026-11-10' }]);
  });

  it('borrada en uno y editada en el otro: queda la editada, en los dos órdenes', () => {
    for (const primero of ['borra', 'edita']) {
      const { a, b, copia } = empezar();
      a.cambiar((d) => ({ ...d, eventos: [] }), H + 10);
      b.cambiar((d) => ({ ...d, eventos: [{ ...d.eventos[0], titulo: 'Final de SO' }] }), H + 5);
      const [uno, otro] = primero === 'borra' ? [a, b] : [b, a];
      const c2 = sincronizar(uno, copia, H + 30);
      const c3 = sincronizar(otro, c2, H + 40);
      expect(c3.datos.eventos.map((e) => e.titulo)).toEqual(['Final de SO']);
      expect(sincronizar(uno, c3, H + 50).datos.eventos.map((e) => e.titulo)).toEqual(['Final de SO']);
    }
  });

  it('borrada en uno solo: se borra en el otro y no vuelve', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => ({ ...d, eventos: [], materias: { 7: { ...d.materias[7], ocultos: [] } } }), H + 10);
    const c2 = sincronizar(a, copia, H + 20);
    const c3 = sincronizar(b, c2, H + 30);
    expect(c3.datos.eventos).toEqual([]);
    expect(c3.datos.materias[7].ocultos).toEqual([]);
    expect(sincronizar(a, c3, H + 40).datos.eventos).toEqual([]);
  });

  it('un dispositivo con el reloj atrasado no deshace lo que ya vio', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], classroom: '700002' } } }), H + 100_000);
    const c2 = sincronizar(a, copia, H + 100_001);
    sincronizar(b, c2, H + 10);
    // Its clock says earlier, but its change comes after what it saw.
    b.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], classroom: '700003' } } }), H + 20);
    const c3 = sincronizar(b, c2, H + 30);
    expect(sincronizar(a, c3, H + 100_002).datos.materias[7].classroom).toBe('700003');
  });

  it('si otro dispositivo pisó la copia con una vieja, lo nuevo de acá vuelve a ganar', () => {
    const { a, b, copia } = empezar();
    b.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], nombres: { 101: 'Del celu' } } } }), H + 10);
    sincronizar(b, copia, H + 20);
    // The computer joined with the copy from before and wrote over the celu's.
    const pisada = sincronizar(a, copia, H + 30);
    expect(sincronizar(b, pisada, H + 40).datos.materias[7].nombres[101]).toBe('Del celu');
  });

  it('una sección tuya borrada en uno mientras el otro le sumaba algo vuelve, con lo sumado', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => ({ ...d, propias: [{ ...d.propias[0], categorias: [d.propias[0].categorias[0]] }] }), H + 10);
    b.cambiar((d) => {
      const p = d.propias[0];
      const links = { ...p.categorias[1], bloques: [...p.categorias[1].bloques, { id: 24, tipo: 'texto', texto: 'Nuevo' }] };
      return { ...d, propias: [{ ...p, categorias: [p.categorias[0], links] }] };
    }, H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    const links = c3.datos.propias[0].categorias.find((c) => c.id === 12);
    expect(links.bloques.map((x) => x.id)).toEqual([24]);
    expect(links.nombre).toBe('Recuperada de otro dispositivo');
  });

  it('un bloque de texto editado en los dos se junta; mover un bloque de sección se ve en el otro', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => {
      const p = d.propias[0];
      const [general, links] = p.categorias;
      const archivo = general.bloques[1];
      return { ...d, propias: [{ ...p, categorias: [{ ...general, bloques: [{ ...general.bloques[0], texto: 'Hola compu' }] }, { ...links, bloques: [...links.bloques, archivo] }] }] };
    }, H + 10);
    b.cambiar((d) => {
      const p = d.propias[0];
      return { ...d, propias: [{ ...p, categorias: [{ ...p.categorias[0], bloques: [{ ...p.categorias[0].bloques[0], texto: 'Hola celu' }, p.categorias[0].bloques[1]] }, p.categorias[1]] }] };
    }, H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    const [general, links] = c3.datos.propias[0].categorias;
    expect(general.bloques.map((x) => x.texto ?? x.nombre)).toEqual(['Hola celu\n\nHola compu']);
    expect(links.bloques.map((x) => x.id)).toEqual([23, 22]);
  });

  it('secciones y materias sumadas en los dos quedan todas, en un orden', () => {
    const { a, b, copia } = empezar();
    a.cambiar((d) => ({ ...d, propias: [...d.propias, { id: 'pcompu0001', nombre: 'De la compu', categorias: [{ id: 31, nombre: 'Uno', bloques: [] }] }] }), H + 10);
    b.cambiar((d) => ({ ...d, propias: [...d.propias, { id: 'pcelu00001', nombre: 'Del celu', categorias: [{ id: 41, nombre: 'Dos', bloques: [] }] }] }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    expect(c3.datos.propias.map((p) => p.nombre).sort()).toEqual(['De la compu', 'Del celu', 'Mi materia']);
    expect(sincronizar(a, c3, H + 50).datos).toEqual(c3.datos);
  });
});

describe('datos de antes, sin fechas', () => {
  it('la primera vez no se pierde nada de ninguno de los dos', () => {
    const compu = dispositivo({ materias: { 7: { ocultos: ['101'], nota: 'Nota de la compu', nombres: { 101: 'Compu' } } }, eventos: [{ id: 1, titulo: 'Uno', cuando: 1_790_000_000 }] });
    const celu = dispositivo({ materias: { 7: { ocultos: ['102'], nota: 'Nota del celu' }, 8: { vistos: ['5'] } }, eventos: [{ id: 2, titulo: 'Dos', cuando: 1_790_000_000 }] });
    const c1 = sincronizar(compu, null, H);
    const c2 = sincronizar(celu, c1, H + 10);
    const m = c2.datos.materias;
    expect(m[7].ocultos.sort()).toEqual(['101', '102']);
    expect(m[7].nota).toContain('Nota de la compu');
    expect(m[7].nota).toContain('Nota del celu');
    expect(m[7].nombres[101]).toBe('Compu');
    expect(m[8].vistos).toEqual(['5']);
    expect(c2.datos.eventos.map((e) => e.titulo)).toEqual(['Uno', 'Dos']);
    expect(sincronizar(compu, c2, H + 20).datos).toEqual(c2.datos);
  });

  it('lo que se cambió después de esta versión gana sobre lo viejo', () => {
    const compu = dispositivo({ materias: { 7: { classroom: '700001' } } });
    compu.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], classroom: '700009' } } }), H);
    const celu = dispositivo({ materias: { 7: { classroom: '700002' } } });
    const c1 = sincronizar(celu, null, H + 5);
    expect(sincronizar(compu, c1, H + 10).datos.materias[7].classroom).toBe('700009');
  });
});

describe('las marcas', () => {
  it('sin cambios no tocan nada; con uno, la fecha sube y guardan la de antes una sola vez', () => {
    const d = base();
    const m0 = { t: { 'm/7/nota': H }, d: {} };
    expect(marcar(m0, d, structuredClone(d), H + 10)).toBe(m0);
    const otra = limpio({ ...d, materias: { 7: { ...d.materias[7], nota: 'Otra' } } });
    const m1 = marcar(m0, d, otra, H - 50);
    expect(m1.t['m/7/nota']).toBe(H + 1);
    expect(m1.d['m/7/nota']).toBe(H);
    const m2 = marcar(m1, otra, limpio({ ...otra, materias: { 7: { ...otra.materias[7], nota: 'Y otra' } } }), H + 100);
    expect(m2.t['m/7/nota']).toBe(H + 100);
    expect(m2.d['m/7/nota']).toBe(H);
  });

  it('un borrado queda un tiempo y después se olvida', () => {
    const a = dispositivo(base());
    a.cambiar((d) => ({ ...d, eventos: [] }), H);
    expect(sincronizar(a, null, H + 10).t['e/9']).toBe(H);
    expect(sincronizar(a, null, H + VIDA_BORRADOS_MS + 10).t['e/9']).toBeUndefined();
  });
});

describe('juntar textos', () => {
  it('si uno tiene al otro queda ese, si no los dos', () => {
    expect(juntarTextos('Hola, qué tal', 'Hola')).toBe('Hola, qué tal');
    expect(juntarTextos('Hola', 'Hola, qué tal')).toBe('Hola, qué tal');
    expect(juntarTextos('B', 'A')).toBe('B\n\nA');
    expect(juntarTextos('x'.repeat(15_000), 'y'.repeat(15_000))).toHaveLength(20_000);
  });

  it('si las dos versiones no entran, la unión lo cuenta', () => {
    const a = dispositivo(base());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(base());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], nota: 'a'.repeat(15_000) } } }), H + 10);
    b.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], nota: 'b'.repeat(15_000) } } }), H + 20);
    const deB = unir({ datos: b.datos, t: b.marcas.t, d: b.marcas.d }, copia, { ahora: H + 30 });
    const r = unir({ datos: a.datos, t: a.marcas.t, d: a.marcas.d }, { datos: limpio(deB.datos), t: deB.t }, { ahora: H + 40 });
    expect(r.recortes).toBe(1);
    expect(limpio(r.datos).materias[7].nota).toHaveLength(20_000);
    expect(deB.recortes).toBe(0);
  });
});

describe('el orden de las secciones y las plegadas', () => {
  const conSecciones = () => limpio({ ...base(), materias: { 7: { ...base().materias[7], ordenSecciones: ['p12', 3, 1], plegadas: [3, 'p12'] } } });

  it('son elementos propios, que no chocan con el orden de los ítems, y se arman de vuelta igual', () => {
    const d = conSecciones();
    const p = piezas(d);
    expect(p['m/7/os']).toEqual(['p12', 3, 1]);
    expect(p['m/7/pl/3']).toBe(1);
    expect(p['m/7/pl/p12']).toBe(1);
    expect(p['m/7/orden/3']).toEqual(['101', 'c55']);
    expect(limpio(armar(p))).toEqual(d);
    expect(limpio(armar(p)).materias[7].plegadas).toEqual([3, 'p12']);
  });

  it('un orden vacío no es un elemento', () => {
    expect(Object.keys(piezas(limpio({ materias: { 7: { ordenSecciones: [], plegadas: [] } } })))).toEqual([]);
  });

  it('pasan de un dispositivo al otro: el último orden gana entero y cada plegada va por su lado', () => {
    const a = dispositivo(conSecciones());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conSecciones());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], ordenSecciones: [1, 3, 'p12'], plegadas: [3] } } }), H + 10);
    b.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], ordenSecciones: [3, 1, 'p12'], plegadas: [3, 'p12', 1] } } }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    const final = sincronizar(a, c3, H + 50).datos;
    expect(final.materias[7].ordenSecciones).toEqual([3, 1, 'p12']);
    // a opened p12, b folded 1: both stay.
    expect([...final.materias[7].plegadas].sort()).toEqual([1, 3]);
    expect(b.datos).toEqual(final);
  });
});

describe('lo del tablón de Classroom pasado a una sección', () => {
  const conTablon = () => limpio({ ...base(), materias: { 7: { ...base().materias[7], lugares: { t904: 3, 't904.1x2y3z': 'p12', 'c55.ab': 3 }, ocultos: ['101', 't903'] } } });

  it('cada lugar es un elemento con la clave del mensaje o del adjunto, y se arma de vuelta igual', () => {
    const d = conTablon();
    const p = piezas(d);
    expect(p['m/7/l/t904']).toBe(3);
    expect(p['m/7/l/t904.1x2y3z']).toBe('p12');
    expect(p['m/7/o/t903']).toBe(1);
    // Nothing of what Classroom says: only numbers and keys.
    expect(JSON.stringify(p)).not.toMatch(/Tabl|mensaje/i);
    expect(limpio(armar(p))).toEqual(d);
  });

  it('pasa de un dispositivo al otro, y volver a Classroom en uno gana si es lo último', () => {
    const a = dispositivo(conTablon());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conTablon());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], lugares: { ...d.materias[7].lugares, t906: 'p12' } } } }), H + 10);
    b.cambiar((d) => ({ ...d, materias: { 7: { ...d.materias[7], lugares: Object.fromEntries(Object.entries(d.materias[7].lugares).filter(([k]) => k !== 't904')) } } }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    const final = sincronizar(a, c3, H + 50).datos;
    expect(final.materias[7].lugares).toEqual({ 't904.1x2y3z': 'p12', 'c55.ab': 3, t906: 'p12' });
    expect(b.datos).toEqual(final);
  });
});

describe('los horarios cambiados a mano', () => {
  const clase = (dia, desde, hasta) => ({ dia, desde, hasta, aula: '', cuatrimestre: 0 });

  it('cada materia es un elemento con su lista entera, también vacía, y se arma de vuelta igual', () => {
    const d = base();
    const p = piezas(d);
    expect(p['hm/c/7']).toEqual({ clases: [{ dia: 2, desde: 480, hasta: 600, aula: 'Lab 1', cuatrimestre: 1 }] });
    expect(p['hm/x/4']).toEqual({ clases: [] });
    expect(Object.keys(p).some((k) => k.startsWith('k/'))).toBe(false);
    expect(limpio(armar(p))).toEqual(d);
  });

  it('cambiada en los dos, gana la última lista; vuelta al horario de la facultad en uno, se ve en el otro', () => {
    const a = dispositivo(base());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(base());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, horario: { ...d.horario, aMano: { ...d.horario.aMano, cursos: { 7: [clase(1, 480, 600)] } } } }), H + 10);
    b.cambiar((d) => ({ ...d, horario: { ...d.horario, aMano: { ...d.horario.aMano, cursos: { 7: [clase(3, 600, 720), clase(5, 480, 540)] } } } }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    expect(c3.datos.horario.aMano.cursos[7].map((k) => k.dia)).toEqual([3, 5]);
    // The first one gets the list of the other, and then goes back to the faculty's schedule.
    const c3b = sincronizar(a, c3, H + 45);
    expect(a.datos.horario.aMano.cursos[7].map((k) => k.dia)).toEqual([3, 5]);
    a.cambiar((d) => ({ ...d, horario: { ...d.horario, aMano: { ...d.horario.aMano, cursos: {} } } }), H + 50);
    const c4 = sincronizar(a, c3b, H + 60);
    expect(sincronizar(b, c4, H + 70).datos.horario.aMano.cursos).toEqual({});
  });

  it('las clases sueltas de antes se descartan, y lo de una materia quitada no queda', () => {
    const viejo = limpio({ horario: { clases: [{ id: 3, materiaId: 7, titulo: 'Materia', dia: 2, desde: 480, hasta: 600 }], extras: [], aMano: { extras: { 9: [clase(1, 480, 600)] }, cursos: { 7: [clase(9, 480, 600), clase(2, 600, 540)] } } } });
    expect(viejo.horario).toEqual({ extras: [], aMano: { cursos: { 7: [] }, extras: {} } });
  });
});

describe('lo marcado como hecho', () => {
  // Near today: a mark is forgotten 60 days after its date.
  const VENCE = Math.floor(Date.now() / 1000) + 5 * 86_400;
  const conMarca = (valor) => limpio({ ...base(), hechas: { t2: valor, q15: VENCE } });

  it('cada marca es un elemento con su número, y se arma de vuelta igual', () => {
    const d = conMarca(VENCE);
    expect(piezas(d)['he/t2']).toBe(VENCE);
    expect(piezas(d)['he/q15']).toBe(VENCE);
    expect(limpio(armar(piezas(d)))).toEqual(d);
  });

  it('desmarcada en un dispositivo, el otro que todavía la tenía no la vuelve a marcar', () => {
    const a = dispositivo(conMarca(VENCE));
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conMarca(VENCE));
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, hechas: { ...d.hechas, t2: -VENCE } }), H + 10);
    const despues = sincronizar(a, copia, H + 11);
    sincronizar(b, despues, H + 20);
    expect(b.datos.hechas).toEqual({ t2: -VENCE, q15: VENCE });
    expect(a.datos.hechas).toEqual({ t2: -VENCE, q15: VENCE });
  });

  it('marcada en uno y desmarcada en el otro sin conexión: gana la última', () => {
    const a = dispositivo(conMarca(VENCE));
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conMarca(VENCE));
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, hechas: { ...d.hechas, t2: -VENCE } }), H + 10);
    b.cambiar((d) => ({ ...d, hechas: { ...d.hechas, t2: VENCE + 60 } }), H + 20);
    const deA = sincronizar(a, copia, H + 30);
    const deB = sincronizar(b, deA, H + 40);
    sincronizar(a, deB, H + 50);
    expect(a.datos.hechas.t2).toBe(VENCE + 60);
    expect(b.datos.hechas.t2).toBe(VENCE + 60);
  });

  it('deshecha la marca en uno, no vuelve desde el otro', () => {
    const a = dispositivo(conMarca(VENCE));
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conMarca(VENCE));
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, hechas: { q15: VENCE } }), H + 10);
    const deA = sincronizar(a, copia, H + 11);
    sincronizar(b, deA, H + 20);
    expect(b.datos.hechas).toEqual({ q15: VENCE });
  });
});

describe('los señaladores de un PDF', () => {
  const conSenaladores = (...paginas) => limpio({ ...base(), lecturas: { '7-101': { pagina: 4, senaladores: paginas.map((pagina) => ({ pagina, creado: H - 1000 + pagina })) } } });
  const paginasDe = (d) => (d.lecturas['7-101']?.senaladores ?? []).map((s) => s.pagina);
  const empezar = (...paginas) => {
    const a = dispositivo(conSenaladores(...paginas));
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conSenaladores(...paginas));
    sincronizar(b, copia, H + 1);
    return { a, b, copia };
  };
  const poner = (pagina) => (d) => ({ ...d, lecturas: { '7-101': { ...d.lecturas['7-101'], senaladores: [...d.lecturas['7-101'].senaladores, { pagina, creado: H + pagina }] } } });
  const sacar = (pagina) => (d) => ({ ...d, lecturas: { '7-101': { ...d.lecturas['7-101'], senaladores: d.lecturas['7-101'].senaladores.filter((s) => s.pagina !== pagina) } } });

  it('puestos en los dos sin conexión, en páginas distintas: quedan todos', () => {
    const { a, b, copia } = empezar(3);
    a.cambiar(poner(10), H + 10);
    b.cambiar(poner(20), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    sincronizar(a, c3, H + 50);
    expect(paginasDe(a.datos)).toEqual([3, 10, 20]);
    expect(b.datos).toEqual(a.datos);
  });

  it('sacado en uno, se saca en el otro y no vuelve', () => {
    const { a, b, copia } = empezar(3, 8);
    a.cambiar(sacar(3), H + 10);
    const c2 = sincronizar(a, copia, H + 20);
    const c3 = sincronizar(b, c2, H + 30);
    expect(paginasDe(c3.datos)).toEqual([8]);
    expect(paginasDe(sincronizar(a, c3, H + 40).datos)).toEqual([8]);
  });

  it('sacado en uno y vuelto a poner en el otro sin conexión: queda puesto, en los dos órdenes', () => {
    for (const primero of ['saca', 'pone']) {
      const { a, b, copia } = empezar(3);
      a.cambiar(sacar(3), H + 10);
      b.cambiar((d) => poner(3)(sacar(3)(d)), H + 5);
      const [uno, otro] = primero === 'saca' ? [a, b] : [b, a];
      const c2 = sincronizar(uno, copia, H + 30);
      const c3 = sincronizar(otro, c2, H + 40);
      expect(paginasDe(c3.datos)).toEqual([3]);
      expect(paginasDe(sincronizar(uno, c3, H + 50).datos)).toEqual([3]);
    }
  });

  it('el nombre viaja con el señalador: cambiado en uno, llega al otro; borrado, vuelve a «Página N»', () => {
    const nombrar = (nombre) => (d) => ({ ...d, lecturas: { '7-101': { ...d.lecturas['7-101'], senaladores: d.lecturas['7-101'].senaladores.map((s) => (s.pagina === 3 ? { pagina: 3, creado: s.creado, ...(nombre ? { nombre } : {}) } : s)) } } });
    const nombreDe = (d) => d.lecturas['7-101'].senaladores.find((s) => s.pagina === 3)?.nombre;
    const { a, b, copia } = empezar(3, 8);
    a.cambiar(nombrar('Teorema de Bayes'), H + 10);
    const c2 = sincronizar(a, copia, H + 20);
    sincronizar(b, c2, H + 30);
    expect(nombreDe(b.datos)).toBe('Teorema de Bayes');
    b.cambiar(nombrar(''), H + 40);
    const c4 = sincronizar(b, c2, H + 50);
    sincronizar(a, c4, H + 60);
    expect(nombreDe(a.datos)).toBeUndefined();
    expect(paginasDe(a.datos)).toEqual([3, 8]);
  });

  it('renombrado en los dos sin conexión: queda el último', () => {
    const nombrar = (nombre) => (d) => ({ ...d, lecturas: { '7-101': { ...d.lecturas['7-101'], senaladores: d.lecturas['7-101'].senaladores.map((s) => (s.pagina === 3 ? { ...s, nombre } : s)) } } });
    const { a, b, copia } = empezar(3);
    a.cambiar(nombrar('Primero'), H + 10);
    b.cambiar(nombrar('Después'), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    sincronizar(a, c3, H + 50);
    expect(a.datos.lecturas['7-101'].senaladores[0].nombre).toBe('Después');
    expect(b.datos).toEqual(a.datos);
  });

  it('el último señalador sacado se lleva el archivo si no tenía nada más, también del otro lado', () => {
    const a = dispositivo(limpio({ lecturas: { '7-101': { senaladores: [{ pagina: 6, creado: H }] } } }));
    const copia = sincronizar(a, null, H);
    const b = dispositivo(limpio({ lecturas: { '7-101': { senaladores: [{ pagina: 6, creado: H }] } } }));
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, lecturas: {} }), H + 10);
    sincronizar(b, sincronizar(a, copia, H + 20), H + 30);
    expect(b.datos.lecturas).toEqual({});
  });
});

describe('los archivos del laboratorio', () => {
  const lab = (extra = {}) => ({ id: 'labc12345', nombre: 'Primos', lenguaje: 'python', codigo: 'print(2)\n', materia: 7, creado: H, cambiado: H, ...extra });
  const conLab = (...archivos) => limpio({ ...base(), laboratorio: archivos });

  it('cada archivo es un elemento propio, y se arma de vuelta igual', () => {
    const d = conLab(lab(), lab({ id: 'lzzz99999', nombre: 'Notas', lenguaje: 'sql', codigo: 'SELECT 1;', materia: null }));
    const p = piezas(d);
    expect(Object.keys(p).filter((k) => k.startsWith('lab/'))).toEqual(['lab/labc12345', 'lab/lzzz99999']);
    expect(p['lab/labc12345']).toEqual({ nombre: 'Primos', lenguaje: 'python', codigo: 'print(2)\n', materia: 7, creado: H, cambiado: H });
    expect(limpio(armar(p))).toEqual(d);
    expect(limpio(armar({ ...p, 'lab/../x': lab(), 'lab/x': lab() })).laboratorio).toHaveLength(2);
  });

  it('uno nuevo en cada dispositivo: quedan los dos; borrado en uno, se borra en el otro', () => {
    const a = dispositivo(base());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(base());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, laboratorio: [lab()] }), H + 10);
    b.cambiar((d) => ({ ...d, laboratorio: [lab({ id: 'lbbb22222', nombre: 'Del celu' })] }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    expect(c3.datos.laboratorio.map((x) => x.nombre).sort()).toEqual(['Del celu', 'Primos']);
    a.cambiar((d) => d, H + 45);
    const c4 = sincronizar(a, c3, H + 50);
    a.cambiar((d) => ({ ...d, laboratorio: d.laboratorio.filter((x) => x.id !== 'lbbb22222') }), H + 60);
    const c5 = sincronizar(a, c4, H + 70);
    expect(sincronizar(b, c5, H + 80).datos.laboratorio.map((x) => x.nombre)).toEqual(['Primos']);
  });

  it('el mismo archivo cambiado en los dos: corre el último, y el otro queda abajo comentado', () => {
    const a = dispositivo(conLab(lab()));
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conLab(lab()));
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, laboratorio: [lab({ codigo: 'print(3)\n', cambiado: H + 10 })] }), H + 10);
    b.cambiar((d) => ({ ...d, laboratorio: [lab({ codigo: 'print(5)\nprint(7)\n', cambiado: H + 20 })] }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    expect(c3.datos.laboratorio[0].codigo).toBe('print(5)\nprint(7)\n\n# Lo que tenía este archivo en otro dispositivo:\n# print(3)\n#\n');
    expect(sincronizar(a, c3, H + 50).datos.laboratorio[0].codigo).toBe(c3.datos.laboratorio[0].codigo);
  });

  it('en SQL se comenta con dos guiones; si uno tiene al otro, queda ese; y con el tope, la unión lo cuenta', () => {
    expect(juntarCodigos('SELECT 2;', 'SELECT 1;', 'sql')).toBe('SELECT 2;\n\n-- Lo que tenía este archivo en otro dispositivo:\n-- SELECT 1;\n');
    expect(juntarCodigos('console.log(2);', 'console.log(1);', 'javascript')).toBe('console.log(2);\n\n// Lo que tenía este archivo en otro dispositivo:\n// console.log(1);\n');
    expect(juntarCodigos('print(1)\nprint(2)', 'print(1)', 'python')).toBe('print(1)\nprint(2)');
    expect(juntarCodigos('print(1)', 'print(1)\nprint(2)', 'python')).toBe('print(1)\nprint(2)');
    let recortes = 0;
    const junto = juntarCodigos('a'.repeat(MAX_CODIGO), 'b', 'python', () => {
      recortes += 1;
    });
    expect(junto).toHaveLength(MAX_CODIGO);
    expect(recortes).toBe(1);
  });
});

describe('cómo cada alumno arma Hoy', () => {
  const conHoy = (hoy) => limpio({ ...base(), hoy });

  it('el orden va entero, cada oculto y cada materia sacada por su lado, y se arma de vuelta igual', () => {
    const d = conHoy({ orden: ['fechas', 'pendientes', 'avisos'], ocultos: ['ultimo', 'facu'], cuenta: ['entregas'], dias: 30, fuera: [7, 12], semana: 'calendario' });
    const p = piezas(d);
    expect(p['hoy/orden']).toEqual(['fechas', 'pendientes', 'avisos']);
    expect(p['hoy/o/facu']).toBe(1);
    expect(p['hoy/m/12']).toBe(1);
    expect(p['hoy/cuenta']).toEqual(['entregas']);
    expect(p['hoy/dias']).toBe(30);
    expect(p['hoy/semana']).toBe('calendario');
    expect(limpio(armar(p))).toEqual(d);
  });

  it('sin elegir nada no hay elementos; nada contado sí es una elección', () => {
    expect(Object.keys(piezas(limpio({}))).filter((k) => k.startsWith('hoy/'))).toEqual([]);
    const nada = conHoy({ cuenta: [] });
    expect(piezas(nada)['hoy/cuenta']).toEqual([]);
    expect(limpio(armar(piezas(nada))).hoy.cuenta).toEqual([]);
  });

  it('pasa de un dispositivo al otro: lo ocultado en uno y la materia sacada en el otro quedan las dos; el último orden gana', () => {
    const a = dispositivo(base());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(base());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, hoy: { ...d.hoy, ocultos: ['avisos'], orden: ['tareas'], columnas: { facu: 'principal' } } }), H + 10);
    b.cambiar((d) => ({ ...d, hoy: { ...d.hoy, fuera: [7], orden: ['fechas'] } }), H + 20);
    const deA = sincronizar(a, copia, H + 30);
    const deB = sincronizar(b, deA, H + 40);
    sincronizar(a, deB, H + 50);
    expect(a.datos.hoy).toEqual({ orden: ['fechas'], columnas: { facu: 'principal' }, ocultos: ['avisos'], cuenta: null, dias: null, fuera: [7], semana: null });
    expect(b.datos.hoy).toEqual(a.datos.hoy);
  });

  it('vuelto a mostrar en uno, no se esconde de nuevo desde el otro', () => {
    const a = dispositivo(conHoy({ ocultos: ['avisos'], fuera: [7] }));
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conHoy({ ocultos: ['avisos'], fuera: [7] }));
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, hoy: { ...d.hoy, ocultos: [], fuera: [] } }), H + 10);
    const deA = sincronizar(a, copia, H + 11);
    sincronizar(b, deA, H + 20);
    expect(b.datos.hoy.ocultos).toEqual([]);
    expect(b.datos.hoy.fuera).toEqual([]);
  });
});


describe('los tipos de aviso ocultos', () => {
  it('cada tipo oculto es un elemento, y se arma de vuelta igual', () => {
    const d = limpio({ ...base(), avisosOcultos: ['foros', 'contactos'] });
    const p = piezas(d);
    expect(Object.keys(p).filter((k) => k.startsWith('av/'))).toEqual(['av/foros', 'av/contactos']);
    expect(limpio(armar(p)).avisosOcultos.sort()).toEqual(['contactos', 'foros']);
    expect(limpio(armar({ ...p, 'av/<b>': 1, 'av/raro': 1 })).avisosOcultos.sort()).toEqual(['contactos', 'foros']);
  });

  it('ocultado en uno y vuelto a mostrar en el otro: gana el último; lo de cada tipo va por su lado', () => {
    const a = dispositivo(base());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(base());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, avisosOcultos: ['foros', 'notas'] }), H + 10);
    const c2 = sincronizar(a, copia, H + 20);
    expect(sincronizar(b, c2, H + 30).datos.avisosOcultos.sort()).toEqual(['foros', 'notas']);
    b.cambiar((d) => ({ ...d, avisosOcultos: ['notas'] }), H + 40);
    a.cambiar((d) => ({ ...d, avisosOcultos: [...d.avisosOcultos, 'contactos'] }), H + 45);
    const c3 = sincronizar(b, c2, H + 50);
    const c4 = sincronizar(a, c3, H + 60);
    expect(c4.datos.avisosOcultos.sort()).toEqual(['contactos', 'notas']);
    expect(sincronizar(b, c4, H + 70).datos.avisosOcultos.sort()).toEqual(['contactos', 'notas']);
  });
});

describe('las secciones que no baja la descarga de noche', () => {
  it('cada sección salteada es un elemento con solo números, y se arma de vuelta igual', () => {
    const d = limpio({ ...base(), sinDescargar: { 12: [30, 4], 7: [9] } });
    const p = piezas(d);
    expect(Object.keys(p).filter((k) => k.startsWith('nd/')).sort()).toEqual(['nd/12/30', 'nd/12/4', 'nd/7/9']);
    expect(limpio(armar(p)).sinDescargar).toEqual({ 7: [9], 12: [4, 30] });
    expect(limpio(armar({ ...p, 'nd/x/1': 1, 'nd/3/<b>': 1, 'nd/0/1': 1 })).sinDescargar).toEqual({ 7: [9], 12: [4, 30] });
  });

  it('salteada en uno y vuelta a bajar en el otro: gana el último, cada sección por su lado', () => {
    const a = dispositivo(base());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(base());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, sinDescargar: { 12: [4, 30] } }), H + 10);
    const c2 = sincronizar(a, copia, H + 20);
    expect(sincronizar(b, c2, H + 30).datos.sinDescargar).toEqual({ 12: [4, 30] });
    b.cambiar((d) => ({ ...d, sinDescargar: { 12: [30] } }), H + 40);
    a.cambiar((d) => ({ ...d, sinDescargar: { 12: [...d.sinDescargar[12], 50] } }), H + 45);
    const c3 = sincronizar(b, c2, H + 50);
    const c4 = sincronizar(a, c3, H + 60);
    expect(c4.datos.sinDescargar).toEqual({ 12: [30, 50] });
    expect(sincronizar(b, c4, H + 70).datos.sinDescargar).toEqual({ 12: [30, 50] });
  });
});

describe('las carpetas de Drive', () => {
  const A = 'carpetaDeDriveA1';
  const B = 'carpetaDeDriveB2';
  it('cada carpeta sumada y cada cosa escondida es un elemento, y se arma de vuelta igual', () => {
    const d = limpio({ ...base(), drive: { propios: [{ id: A, nombre: 'Física', k: null }], sinCarrera: true, ocultos: [B] } });
    const p = piezas(d);
    expect(Object.keys(p).filter((k) => k.startsWith('dr/')).sort()).toEqual([`dr/o/${B}`, `dr/p/${A}`, 'dr/sin']);
    expect(limpio(armar(p)).drive).toEqual(d.drive);
    expect(limpio(armar({ ...p, 'dr/p/<b>': { nombre: 'x' }, 'dr/o/corto': 1 })).drive).toEqual(d.drive);
  });

  it('una carpeta sumada en un dispositivo llega al otro, y quitarla también', () => {
    const a = dispositivo(base());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(base());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, drive: { ...d.drive, propios: [{ id: A, nombre: 'Física', k: null }], ocultos: [B] } }), H + 10);
    const c2 = sincronizar(a, copia, H + 20);
    expect(sincronizar(b, c2, H + 30).datos.drive.propios.map((x) => x.id)).toEqual([A]);
    b.cambiar((d) => ({ ...d, drive: { ...d.drive, propios: [], sinCarrera: true } }), H + 40);
    const c3 = sincronizar(b, c2, H + 50);
    const fin = sincronizar(a, c3, H + 60).datos.drive;
    expect(fin.propios).toEqual([]);
    expect(fin.sinCarrera).toBe(true);
    expect(fin.ocultos).toEqual([B]);
  });
});

describe('fijadas, archivadas y la tarjeta de cada materia', () => {
  const conLugares = () => limpio({ materias: { 7: { enLista: 'fijada', tarjeta: 'franja' }, 8: { enLista: 'archivada' }, pabc1234: { enLista: 'fijada', tarjeta: 'portada' } } });

  it('son elementos de la materia, del campus o tuya, y se arman de vuelta igual', () => {
    const d = conLugares();
    expect(piezas(d)).toEqual({ 'm/7/el': 'fijada', 'm/7/tj': 'franja', 'm/8/el': 'archivada', 'm/pabc1234/el': 'fijada', 'm/pabc1234/tj': 'portada' });
    expect(limpio(armar(piezas(d)))).toEqual(d);
  });

  it('sin lugar ni tarjeta propia no son elementos', () => {
    expect(piezas(limpio({ materias: { 7: { enLista: null, tarjeta: null } } }))).toEqual({});
  });

  it('pasan de un dispositivo al otro: la última tarjeta gana, y sacarla del archivo también viaja', () => {
    const a = dispositivo(conLugares());
    const copia = sincronizar(a, null, H);
    const b = dispositivo(conLugares());
    sincronizar(b, copia, H + 1);
    a.cambiar((d) => ({ ...d, materias: { ...d.materias, 7: { ...d.materias[7], enLista: 'archivada', tarjeta: 'sello' }, 8: { ...d.materias[8], enLista: null } } }), H + 10);
    b.cambiar((d) => ({ ...d, materias: { ...d.materias, 7: { ...d.materias[7], tarjeta: 'minima' } } }), H + 20);
    const c2 = sincronizar(a, copia, H + 30);
    const c3 = sincronizar(b, c2, H + 40);
    const final = sincronizar(a, c3, H + 50).datos;
    expect(final.materias[7]).toMatchObject({ enLista: 'archivada', tarjeta: 'minima' });
    expect(final.materias[8]?.enLista ?? null).toBe(null);
    expect(final.materias.pabc1234).toMatchObject({ enLista: 'fijada', tarjeta: 'portada' });
    expect(b.datos).toEqual(final);
  });
});

describe('la apariencia', () => {
  const con = (apariencia) => limpio({ apariencia });

  it('los filtros del fondo: cada uno es un elemento, y dos dispositivos se unen por ajuste', () => {
    const mio = con({ fondoFiltro: 'sepia', fondoIntensidad: 35, fondoTono: 290, fondoDesenfoque: 40 });
    expect(limpio(armar(piezas(mio)))).toEqual(mio);
    expect(Object.keys(piezas(mio)).filter((k) => k.startsWith('aj/fondo')).sort()).toEqual(['aj/fondoDesenfoque', 'aj/fondoFiltro', 'aj/fondoIntensidad', 'aj/fondoTono']);
  });

  it('cada ajuste es un elemento, y se arma de vuelta igual: sin apariencia, con la de entrada y con cambios', () => {
    for (const a of [null, {}, { estilo: 'hoja', letra: 'grande', menu: { estilo: 'iconos', posicion: 'izquierda', orden: [], lugares: {} } }]) {
      const mio = con(a);
      expect(limpio(armar(piezas(mio)))).toEqual(mio);
    }
    expect(Object.keys(piezas(con({ estilo: 'hoja' }))).filter((k) => k.startsWith('aj'))).toEqual(['aj', 'aj/estilo']);
  });

  it('un dispositivo nuevo recibe la de la copia, aunque ya tuviera la suya sin fecha', () => {
    const remoto = { datos: con({ estilo: 'hoja' }), t: { aj: H, 'aj/estilo': H } };
    const r = unir({ datos: con({ estilo: 'batman', letra: 'grande' }), t: {}, d: {} }, remoto, { primera: true, ahora: H + 10 });
    expect(limpio(r.datos).apariencia).toEqual({ estilo: 'hoja', letra: 'grande' });
  });

  it('volver a como venía en otro dispositivo llega como tal', () => {
    const remoto = { datos: con({}), t: { aj: H, 'aj/estilo': H + 5 } };
    const r = unir({ datos: con({ estilo: 'hoja' }), t: { aj: H, 'aj/estilo': H }, d: {} }, remoto, { ahora: H + 10 });
    expect(limpio(r.datos).apariencia).toEqual({});
  });
});

describe('los nombres de Sysacad que el alumno dijo que son suyos', () => {
  it('cada par es un elemento, solo como huella', () => {
    const d = limpio({ ...base(), sysacadSuyo: ['1x9ab', 'zz'] });
    const p = piezas(d);
    expect(Object.keys(p).filter((k) => k.startsWith('sy/')).sort()).toEqual(['sy/1x9ab', 'sy/zz']);
    expect(limpio(armar(p)).sysacadSuyo).toEqual(['1x9ab', 'zz']);
    expect(limpio(armar({ ...p, 'sy/PEREZ': 1, 'sy/<b>': 1, 'sy/abcdefgh': 1 })).sysacadSuyo).toEqual(['1x9ab', 'zz']);
    expect(limpio({ ...base(), sysacadSuyo: ['Pérez, Juan', 3, 'ok1'] }).sysacadSuyo).toEqual(['ok1']);
  });
});
