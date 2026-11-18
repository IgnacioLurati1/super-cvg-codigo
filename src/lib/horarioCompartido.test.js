import { deflateSync, strToU8 } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { armarSemana } from './facultad';
import {
  armarHorario, conLosHorarios, copiarMateria, deshacerCopia, estadoDe, hashDeHorario, hayHorarioEnHash, horarioDeHash, huecosDelDia, juntarSemanas,
  MAX_MATERIAS, sanearHorarioCompartido, semanaCompartida,
} from './horarioCompartido';
import { cambiarMio, fijarUsuario, mioActual } from './mio';

const DATOS = {
  ciclo: 2026,
  materias: ['Bases de Datos', 'Economía', 'Física II', 'Ciencia de Datos', 'Inglés I'],
  comisiones: [
    { codigo: '2K01', turno: 'Mañana', clases: [[1, 1, 480, 600, 2, 'Ruiz'], [2, 1, 480, 600, 2, 'Ruiz']] },
    { codigo: '3K02', turno: 'Mañana', clases: [[1, 2, 480, 675, 0, 'Reynares'], [2, 2, 480, 675, 0, 'Reynares'], [0, 3, 525, 675, 1, '']] },
    { codigo: '3K04', turno: 'Tarde', clases: [[1, 2, 840, 1000, 0, 'Meca'], [2, 2, 840, 1000, 0, 'Meca']] },
    { codigo: '3EK01', turno: 'Mañana', clases: [[2, 5, 435, 600, 3, 'Bigatti']] },
    { codigo: '1K01', turno: 'Mañana', clases: [[0, 4, 600, 690, 4, '']] },
  ],
};

// The one who shares: three campus courses, one of them not in the schedules, and one subject added from them.
const CURSOS = [
  { id: 10, nombre: 'Bases de Datos - Campus Secreto 2026' },
  { id: 11, nombre: 'Economía' },
  { id: 12, nombre: 'Física II - 2026 - 2K1' },
  { id: 13, nombre: 'Taller del campus' },
];
const MIO = {
  materias: { 10: { comision: '3K02', aulas: { 2: 'Aula 302' } }, 11: { comision: 'ninguna' }, 13: {} },
  horario: {
    extras: [{ id: 7, materia: 'Inglés I', comision: '1K01', aulas: {} }],
    aMano: { cursos: { 13: [{ dia: 4, desde: 1080, hasta: 1140, aula: 'Lab', cuatrimestre: 0 }] }, extras: { 7: [{ dia: 4, desde: 600, hasta: 690, aula: 'Aula 5', cuatrimestre: 0 }] } },
  },
};

const comprimir = (texto) => {
  let binario = '';
  for (const b of deflateSync(strToU8(texto))) binario += String.fromCharCode(b);
  return `#horario=${btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
};
const enLink = (x) => comprimir(typeof x === 'string' ? x : JSON.stringify(x));
const base = (materias, extra = {}) => ({ tipo: 'super-cvg-horario', version: 1, fecha: '2026-11-08', ciclo: 2026, materias, ...extra });

beforeEach(() => {
  localStorage.clear();
  fijarUsuario(null);
  fijarUsuario(6);
});

describe('armarHorario', () => {
  it('lleva cada materia por su nombre oficial, con su comisión, sus aulas y lo cambiado a mano', () => {
    const { paquete, fuera } = armarHorario({ datos: DATOS, cursos: CURSOS, mio: MIO, hoy: '2026-11-08' });
    expect(paquete).toMatchObject({ tipo: 'super-cvg-horario', version: 1, fecha: '2026-11-08', ciclo: 2026 });
    expect(paquete.materias).toEqual([
      { materia: 'Bases de Datos', comision: '3K02', aulas: { 2: 'Aula 302' } },
      { materia: 'Física II', comision: '2K01' },
      { materia: 'Inglés I', comision: '1K01', clases: [{ dia: 4, desde: 600, hasta: 690, aula: 'Aula 5' }] },
    ]);
    // The campus course that isn't in the schedules stays out: its name is the campus'. Only the one sharing sees it.
    expect(fuera).toEqual(['Taller del campus']);
  });

  it('no lleva nada del campus', () => {
    const texto = JSON.stringify(armarHorario({ datos: DATOS, cursos: CURSOS, mio: MIO }).paquete);
    for (const delCampus of ['Campus Secreto', 'Taller', 'Economía', 'Lab', '"id"', 'curso', 'nombre', 'docentes', 'Reynares']) expect(texto).not.toContain(delCampus);
    for (const m of armarHorario({ datos: DATOS, cursos: CURSOS, mio: MIO }).paquete.materias) {
      expect(Object.keys(m).every((k) => ['materia', 'comision', 'aulas', 'clases'].includes(k))).toBe(true);
    }
  });

  it('deja afuera lo que no tiene clases y no repite una materia', () => {
    const mio = { materias: { 10: { comision: '3EK01' } }, horario: { extras: [{ id: 1, materia: 'Bases de Datos', comision: '3K04', aulas: {} }, { id: 2, materia: 'Economía', comision: null, aulas: {} }] } };
    const cursos = [{ id: 10, nombre: 'Bases de Datos' }, { id: 14, nombre: 'Bases de Datos' }];
    const { paquete } = armarHorario({ datos: DATOS, cursos, mio: { ...mio, materias: { ...mio.materias, 14: { comision: '3K02' } } } });
    expect(paquete.materias.map((m) => [m.materia, m.comision])).toEqual([['Bases de Datos', '3K02']]);
    expect(armarHorario({ datos: DATOS, cursos: [], mio: {} }).paquete.materias).toEqual([]);
  });
});

describe('ida y vuelta', () => {
  it('por el link, saneada y con un número para cada materia', () => {
    const { paquete } = armarHorario({ datos: DATOS, cursos: CURSOS, mio: MIO, hoy: '2026-11-08' });
    const hash = hashDeHorario(paquete);
    expect(hash).toMatch(/^#horario=[A-Za-z0-9_-]+$/);
    expect(hayHorarioEnHash(hash)).toBe(true);
    expect(hayHorarioEnHash('#orden=abc')).toBe(false);
    expect(horarioDeHash(hash)).toEqual({
      fecha: '2026-11-08',
      ciclo: 2026,
      materias: [
        { id: 1, materia: 'Bases de Datos', comision: '3K02', aulas: { 2: 'Aula 302' }, clases: null },
        { id: 2, materia: 'Física II', comision: '2K01', aulas: {}, clases: null },
        { id: 3, materia: 'Inglés I', comision: '1K01', aulas: {}, clases: [{ dia: 4, desde: 600, hasta: 690, aula: 'Aula 5', cuatrimestre: 0 }] },
      ],
    });
  });
});

describe('entrada hostil', () => {
  const rechaza = (hash, patron = /no es un horario/) => expect(() => horarioDeHash(hash)).toThrow(patron);

  it('rechaza un link roto, cortado o de otra cosa', () => {
    for (const roto of ['', '#horario=', '#horario=!!!!', '#horario=abc def', '#horario=AAAA', '#horario=ñandú', '#orden=abc', null, undefined, 5]) rechaza(roto);
    const entero = hashDeHorario(base([{ materia: 'Bases de Datos', comision: '3K02', aulas: { 2: 'Un aula con un nombre largo para que comprima' } }]));
    rechaza(entero.slice(0, entero.length / 2));
    rechaza(enLink('no soy json'));
    for (const x of [[], null, 'super-cvg-horario', { tipo: 'campus-lindo-orden', version: 1, materias: [] }]) rechaza(enLink(x));
    rechaza(enLink(base([])));
    rechaza(enLink(base('Bases de Datos')));
  });

  it('avisa una versión que no conoce', () => {
    rechaza(enLink(base([{ materia: 'Bases de Datos' }], { version: 2 })), /versión/);
  });

  it('frena una bomba de compresión y un link enorme sin inflarlos', () => {
    let binario = '';
    for (const b of deflateSync(new Uint8Array(50 * 1024 * 1024))) binario += String.fromCharCode(b);
    const bomba = `#horario=${btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    const antes = performance.now();
    rechaza(bomba);
    expect(performance.now() - antes).toBeLessThan(500);
    rechaza(`#horario=${'A'.repeat(200_000)}`);
  });

  it('deja solo campos, tipos y tamaños conocidos', () => {
    const h = horarioDeHash(enLink(base([
      {
        materia: 'Bases de Datos', comision: '3K02; drop', aulas: { 2: 'x'.repeat(500), 9: 'Afuera', 3: 42, 4: '‮evil​' }, otro: 'campo',
        clases: [{ dia: 1, desde: 480, hasta: 600, aula: 'Aula\u0000 1' }, { dia: 8, desde: 480, hasta: 600 }, { dia: 2, desde: 600, hasta: 500 }, { dia: 2, desde: -5, hasta: 60 }, 'texto'],
      },
      { materia: 'Bases de Datos', comision: '3K04' },
      { materia: '', comision: '3K02' },
      { materia: { toString: 'x' } },
      'texto',
      { materia: '​Economía⁦', comision: 'ninguna', clases: 'muchas' },
    ], { fecha: '2026-13-45', ciclo: 1e9, extra: 'algo' })));
    expect(h.fecha).toBeNull();
    expect(h.ciclo).toBeNull();
    expect(Object.keys(h)).toEqual(['fecha', 'ciclo', 'materias']);
    const [bases, economia] = h.materias;
    expect(h.materias).toHaveLength(2);
    expect(bases).toEqual({ id: 1, materia: 'Bases de Datos', comision: null, aulas: { 2: 'x'.repeat(40), 4: 'evil' }, clases: [{ dia: 1, desde: 480, hasta: 600, aula: 'Aula 1', cuatrimestre: 0 }] });
    expect(economia).toEqual({ id: 5, materia: 'Economía', comision: null, aulas: {}, clases: null });
  });

  it('no se deja cambiar el prototipo', () => {
    const h = horarioDeHash(enLink('{"tipo":"super-cvg-horario","version":1,"materias":[{"materia":"Bases de Datos","aulas":{"__proto__":{"1":"Trampa"},"2":"A"},"__proto__":{"comision":"3K02"}}],"__proto__":{"ciclo":2026}}'));
    expect(h).toEqual({ fecha: null, ciclo: null, materias: [{ id: 1, materia: 'Bases de Datos', comision: null, aulas: { 2: 'A' }, clases: null }] });
    expect({}.comision).toBeUndefined();
  });

  it('corta en la cantidad de materias y de clases de una semana', () => {
    const clases = Array.from({ length: 15 }, (_, i) => ({ dia: 1, desde: 480 + i, hasta: 540 + i }));
    const h = horarioDeHash(enLink(base(Array.from({ length: 30 }, (_, i) => ({ materia: `Materia ${i}`, clases })))));
    expect(h.materias).toHaveLength(MAX_MATERIAS);
    expect(Math.max(...h.materias.map((m) => m.clases.length))).toBeLessThanOrEqual(12);
  });

  it('solo quedan las materias de los horarios de la facultad', () => {
    const h = sanearHorarioCompartido(base([{ materia: 'Bases de Datos', comision: '3K02' }, { materia: 'Llamame al 341 555 0000' }, { materia: 'Física II', comision: '2K01' }]));
    const { materias, faltan } = conLosHorarios(h, DATOS);
    expect(materias.map((m) => m.materia)).toEqual(['Bases de Datos', 'Física II']);
    expect(faltan).toBe(1);
  });
});

describe('las dos semanas', () => {
  it('juntan las clases de la misma materia y comisión, y los huecos libres de los dos', () => {
    const compartido = sanearHorarioCompartido(base([
      { materia: 'Bases de Datos', comision: '3K02' },
      { materia: 'Física II', comision: '2K01' },
      { materia: 'Inglés I', clases: [{ dia: 1, desde: 720, hasta: 800 }] },
    ]));
    const suya = semanaCompartida(compartido.materias, DATOS, 1);
    const mio = { materias: { 10: { comision: '3K02' }, 11: { comision: '3K04' } }, horario: { extras: [], aMano: { cursos: { 12: [{ dia: 1, desde: 610, hasta: 700, aula: '', cuatrimestre: 0 }] } } } };
    const cursos = [{ id: 10, nombre: 'Bases de Datos' }, { id: 12, nombre: 'Física II' }];
    const mia = armarSemana({ datos: DATOS, cursos, mio, cuatrimestre: 1 });
    const dias = juntarSemanas(mia.clases, suya.clases);
    expect(dias.map((d) => d.dia)).toEqual([1, 2, 3, 4, 5]);
    const [lunes, martes, miercoles] = dias;
    // Monday: theirs 8:00 to 10:00 and 12:00 to 13:20; mine 10:10 to 11:40. A break of ten minutes isn't a gap.
    expect(lunes.mias.map((c) => c.desde)).toEqual([610]);
    expect(lunes.suyas.map((c) => c.desde).sort()).toEqual([480, 720]);
    expect(lunes.huecos).toEqual([]);
    expect(huecosDelDia([...lunes.mias, ...lunes.suyas], 20)).toEqual([{ desde: 700, hasta: 720 }]);
    expect(martes.juntas.map((j) => [j.mia.materia, j.suya.comision, j.mia.desde])).toEqual([['Bases de Datos', '3K02', 480]]);
    expect(martes.mias).toEqual([]);
    expect(miercoles.sinClases).toBe(true);
  });

  it('suman el sábado solo si alguno cursa ese día', () => {
    expect(juntarSemanas([], [{ id: 'x', dia: 6, desde: 480, hasta: 600 }]).map((d) => d.dia)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('un hueco va entre la primera clase y la última de los dos, aunque se pisen', () => {
    expect(huecosDelDia([{ desde: 480, hasta: 600 }, { desde: 500, hasta: 560 }, { desde: 700, hasta: 760 }, { desde: 780, hasta: 900 }])).toEqual([{ desde: 600, hasta: 700 }]);
    expect(huecosDelDia([])).toEqual([]);
  });
});

describe('copiar de un compañero', () => {
  const CURSOS_MIOS = [{ id: 10, nombre: 'Bases de Datos' }, { id: 11, nombre: 'Economía' }];
  const sembrar = () => cambiarMio(() => ({
    materias: { 10: { comision: '3K04', aulas: { 2: 'Mi aula' }, nota: 'MI NOTA' }, 11: { comision: 'ninguna' } },
    horario: { extras: [{ id: 3, materia: 'Inglés I', comision: null, aulas: {} }], aMano: { cursos: { 10: [{ dia: 2, desde: 850, hasta: 990, aula: '', cuatrimestre: 0 }] }, extras: {} } },
  }));
  const compartido = sanearHorarioCompartido(base([
    { materia: 'Bases de Datos', comision: '3K02', aulas: { 2: 'Aula 302', 3: 'Aula 9' } },
    { materia: 'Inglés I', comision: '1K01', clases: [{ dia: 4, desde: 600, hasta: 690, aula: 'Aula 5' }] },
    { materia: 'Física II', comision: '2K01' },
    { materia: 'Economía', comision: '3K02' },
  ]));
  const [bases, ingles, fisica, economia] = compartido.materias;
  const misMaterias = () => armarSemana({ datos: DATOS, cursos: CURSOS_MIOS, mio: mioActual(), cuatrimestre: 1 }).materias;

  it('sabe qué es cada materia para quien la recibe', () => {
    sembrar();
    expect(estadoDe(bases, misMaterias()).estado).toBe('otra');
    expect(estadoDe(ingles, misMaterias())).toMatchObject({ estado: 'otra', mia: { clave: 'x3' } });
    expect(estadoDe(fisica, misMaterias())).toEqual({ estado: 'falta', mia: null });
    expect(estadoDe(economia, misMaterias())).toMatchObject({ estado: 'falta', mia: { clave: 'c11', noLaCursa: true } });
  });

  it('pasa a su comisión un curso del campus, sin pisar tus aulas ni tus notas, y lo deshace', () => {
    sembrar();
    const antes = copiarMateria(bases, estadoDe(bases, misMaterias()).mia);
    const m = mioActual();
    expect(m.materias[10]).toMatchObject({ comision: '3K02', aulas: { 2: 'Mi aula', 3: 'Aula 9' }, nota: 'MI NOTA' });
    expect(m.horario.aMano.cursos[10]).toBeUndefined();
    expect(estadoDe(bases, misMaterias()).estado).toBe('juntos');
    deshacerCopia(antes);
    expect(mioActual().materias[10]).toMatchObject({ comision: '3K04', aulas: { 2: 'Mi aula' }, nota: 'MI NOTA' });
    expect(mioActual().horario.aMano.cursos[10]).toEqual([{ dia: 2, desde: 850, hasta: 990, aula: '', cuatrimestre: 0 }]);
  });

  it('a una materia sumada le pasa también lo que cambió a mano, y lo deshace', () => {
    sembrar();
    const antes = copiarMateria(ingles, estadoDe(ingles, misMaterias()).mia);
    expect(mioActual().horario.extras[0]).toMatchObject({ id: 3, comision: '1K01' });
    expect(mioActual().horario.aMano.extras[3]).toEqual([{ dia: 4, desde: 600, hasta: 690, aula: 'Aula 5', cuatrimestre: 0 }]);
    deshacerCopia(antes);
    expect(mioActual().horario.extras[0]).toEqual({ id: 3, materia: 'Inglés I', comision: null, aulas: {} });
    expect(mioActual().horario.aMano.extras[3]).toBeUndefined();
  });

  it('suma la que no tenés, o vuelve a cursar la que no cursabas, y lo deshace', () => {
    sembrar();
    const nueva = copiarMateria(fisica, null);
    expect(mioActual().horario.extras.map((x) => [x.materia, x.comision])).toEqual([['Inglés I', null], ['Física II', '2K01']]);
    expect(estadoDe(fisica, misMaterias()).estado).toBe('juntos');
    deshacerCopia(nueva);
    expect(mioActual().horario.extras.map((x) => x.materia)).toEqual(['Inglés I']);

    const vuelta = copiarMateria(economia, estadoDe(economia, misMaterias()).mia);
    expect(mioActual().materias[11].comision).toBe('3K02');
    expect(estadoDe(economia, misMaterias()).estado).toBe('juntos');
    deshacerCopia(vuelta);
    expect(mioActual().materias[11].comision).toBe('ninguna');
  });

  it('no suma más materias que el máximo ni una que ya está, y sin alumno no guarda', () => {
    cambiarMio(() => ({ horario: { extras: Array.from({ length: MAX_MATERIAS }, (_, i) => ({ id: i + 1, materia: `Otra ${i}`, comision: null, aulas: {} })) } }));
    expect(() => copiarMateria(fisica, null)).toThrow(/el máximo/);
    sembrar();
    expect(() => copiarMateria(ingles, null)).toThrow(/No se pudo guardar/);
    fijarUsuario(null);
    expect(() => copiarMateria(fisica, null)).toThrow(/No se pudo guardar/);
  });
});
