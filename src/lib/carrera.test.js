import { describe, expect, it } from 'vitest';
import { armarCarrera, carreraParaConsultron, conSupuestas, cuentas, leerCorrelatividad, leerEstado, loQueDestraba, nombreDelAnio } from './carrera';
import { CURSAR, RENDIR } from './carrera.fixture';
import { mensajeDeEjemplo } from './demoSysacad';
import { leerPestanas } from './sysacadPestanas';

const COLUMNAS = ['Año', 'Materia', 'Correlatividad', 'Plan'];
const pestana = (clave, columnas, filas, fecha = 1000) => ({ clave, titulo: clave, fecha, bloques: [{ t: 'tabla', titulo: null, columnas, filas }] });
const reales = () => [
  pestana('correlativas-cursar', COLUMNAS, CURSAR.filter((f) => f.length), 2000),
  pestana('correlativas-rendir', COLUMNAS, RENDIR.filter((f) => f.length), 3000),
];
const de = (carrera, nombre) => carrera.materias.find((m) => m.nombre === nombre);

describe('leerCorrelatividad', () => {
  it('reads «Puede cursar» and «Puede inscribirse» as free', () => {
    expect(leerCorrelatividad('Puede cursar')).toEqual({ puede: true, faltan: [], otros: [] });
    expect(leerCorrelatividad('Puede inscribirse').puede).toBe(true);
  });

  it('reads each missing requirement without the ordinance', () => {
    const r = leerCorrelatividad('No regularizó Legislación (Ord. 1878) · No aprobó ni está inscripto a Administración de Sistemas de Información · No cursó Redes de Datos');
    expect(r.puede).toBe(false);
    expect(r.faltan).toEqual([
      { accion: 'Regularizar', texto: 'Legislación', clave: 'legislacion' },
      { accion: 'Aprobar o inscribirte a', texto: 'Administración de Sistemas de Información', clave: 'administracion de sistemas de informacion' },
      { accion: 'Cursar', texto: 'Redes de Datos', clave: 'redes de datos' },
    ]);
  });

  it('keeps the elective hours as a line apart and skips the code list', () => {
    const r = leerCorrelatividad('Faltan aprobar 12 de 20 horas de electivas · Código Materia · 123=Algo');
    expect(r.faltan).toEqual([]);
    expect(r.otros).toEqual(['12 de 20 horas de electivas']);
    // A cell that says nothing, or only the codes: one thing missing that Sysacad does not name.
    expect(leerCorrelatividad('').otros).toEqual(['Algo que Sysacad no detalla']);
    expect(leerCorrelatividad('Código Materia · 123=Algo').otros).toEqual(['Algo que Sysacad no detalla']);
  });
});

describe('leerEstado', () => {
  it('tells passed, regular, taking and pending, with the grade', () => {
    expect(leerEstado('Aprobada con 8 en 2024 (Tomo 3 Folio 12)')).toMatchObject({ tipo: 'aprobada', nota: 8 });
    expect(leerEstado('Promocionada con 9,50')).toMatchObject({ tipo: 'aprobada', nota: 9.5 });
    expect(leerEstado('Regularidad en 2025')).toMatchObject({ tipo: 'regular', nota: null });
    expect(leerEstado('Cursa en 2026')).toMatchObject({ tipo: 'cursando' });
    expect(leerEstado('')).toMatchObject({ tipo: 'pendiente' });
  });
});

describe('armarCarrera with the real Sysacad pages', () => {
  const carrera = armarCarrera(reales());

  it('has every pending subject once, by year', () => {
    expect(carrera.materias).toHaveLength(37);
    expect(new Set(carrera.materias.map((m) => m.clave)).size).toBe(37);
    expect(carrera.anios).toEqual([1, 2, 3, 4, 5]);
    expect(carrera.fecha).toBe(2000);
    expect(carrera.tiene).toEqual({ estado: false, cursar: true, rendir: true });
  });

  it('completes the names Sysacad cuts from the requirements that name them whole', () => {
    expect(de(carrera, 'Administración de Sistemas de Información')).toMatchObject({ anio: 4 });
    expect(de(carrera, 'Sistemas de Información Integrados para la Industria (Elec.)')).toMatchObject({ anio: 5, electiva: true });
    expect(carrera.materias.some((m) => m.nombre === 'Administración de Sistemas de Informació')).toBe(false);
  });

  it('tells regular ones (free for the final) from the ones to start', () => {
    expect(de(carrera, 'Física II').estado).toBe('regular');
    expect(de(carrera, 'Física II').rendir.puede).toBe(true);
    expect(de(carrera, 'Comunicación de Datos').estado).toBe('cursar');
    expect(de(carrera, 'Redes de Datos')).toMatchObject({ estado: 'falta' });
    expect(de(carrera, 'Redes de Datos').cursar.faltan).toEqual([{ accion: 'Regularizar', texto: 'Comunicación de Datos', clave: 'comunicacion de datos' }]);
  });

  it('a regular subject that lacks another for the final says which', () => {
    const seminario = de(carrera, 'Seminario Integrador');
    expect(seminario.estado).toBe('cursar');
    expect(seminario.rendir.propia).toBe(true);
    expect(seminario.rendir.faltan.map((r) => r.texto)).toEqual(['Física II', 'Comunicación de Datos']);
  });

  it('ranks what holds back the most: first what opens right away, then the whole chain', () => {
    // Before, by the direct ones only: Administración (3), Comunicación, Redes, Simulación (2 each).
    expect(carrera.frenos.map((f) => [f.nombre, f.abre, f.frena])).toEqual([
      ['Simulación', 2, 2],
      // Redes de Datos, and down from it Seguridad and Proyecto Final.
      ['Comunicación de Datos', 1, 3],
      // Gestión Gerencial, Seguridad and Proyecto Final: the electives it also holds don't count.
      ['Administración de Sistemas de Información', 0, 3],
      ['Redes de Datos', 0, 2],
    ]);
    expect(carrera.frenos[0].enMapa).toBe(true);
  });

  it('the finals it can sit, counting only what asks for them passed', () => {
    // Proyecto Final asks for Física II and Tecnologías para la Automatización passed (Seminario Integrador is an elective).
    expect(carrera.paraRendir.map((f) => [f.nombre, f.abre, f.frena])).toEqual([
      ['Física II', 0, 1],
      ['Tecnologías para la Automatización', 0, 1],
      ['Entornos Gráficos (Elec.)', 0, 0],
      ['Tecnologías de Desarrollo de Software ID', 0, 0],
    ]);
  });

  it('says what a subject frees, and what supposing it frees', () => {
    const { cursar } = loQueDestraba(carrera, 'comunicacion de datos');
    expect(cursar.map((m) => m.nombre)).toEqual(expect.arrayContaining(['Redes de Datos', 'Seguridad en los Sistemas de Información']));
    const libres = conSupuestas(carrera, new Set(['comunicacion de datos']));
    expect([...libres.cursar]).toEqual(['redes de datos']);
    const dos = conSupuestas(carrera, new Set(['comunicacion de datos', 'redes de datos', 'administracion de sistemas de informacion']));
    expect(dos.cursar.has('seguridad en los sistemas de informacion')).toBe(true);
    expect(dos.cursar.has('redes de datos')).toBe(false);
    expect(conSupuestas(carrera, new Set()).cursar.size).toBe(0);
  });
});

describe('armarCarrera with Estado académico and finals', () => {
  const estado = pestana('estado', ['Año', 'Materia', 'Estado', 'Plan'], [
    ['1', 'Análisis Matemático I', 'Aprobada con 8 en 2024', '2023'],
    ['2', 'Física II', 'Regularidad en 2025', '2023'],
    ['3', 'Comunicación de Datos', '', '2023'],
    ['4', 'Redes de Datos', '', '2023'],
    ['3', 'Lenguaje de Programación Java (Elec.)', '', '2023'],
  ]);
  const cursar = pestana('correlativas-cursar', COLUMNAS, [
    ['2', 'Física II', 'Puede cursar', '2023'],
    ['3', 'Comunicación de Datos', 'Puede cursar', '2023'],
    ['4', 'Redes de Datos', 'No regularizó Comunicación de Datos (Ord. 1878)', '2023'],
    ['3', 'Lenguaje de Programación Java (Elec.)', 'Puede cursar', '2023'],
  ]);

  it('puts the passed ones on the map with their grade, and counts without electives', () => {
    const c = armarCarrera([estado, cursar]);
    expect(de(c, 'Análisis Matemático I')).toMatchObject({ estado: 'aprobada', nota: 8, anio: 1 });
    expect(de(c, 'Física II').estado).toBe('regular');
    expect(cuentas(c.materias)).toMatchObject({ aprobada: 1, regular: 1, cursar: 1, falta: 1, total: 4 });
  });

  it('without Estado académico, finals mark what is on the map and count the rest apart', () => {
    const c = armarCarrera([cursar], [{ nombre: 'FÍSICA II', nota: 7 }, { nombre: 'Análisis Matemático I', nota: 8 }]);
    expect(de(c, 'Física II')).toMatchObject({ estado: 'aprobada', nota: 7 });
    expect(c.aprobadasSinMapa).toBe(1);
  });

  it('with nothing usable, an empty map', () => {
    const c = armarCarrera([pestana('certificados', [], [])]);
    expect(c.materias).toEqual([]);
    expect(c.tiene).toEqual({ estado: false, cursar: false, rendir: false });
    expect(c.fecha).toBeNull();
  });
});

describe('the demo of Sysacad', () => {
  it('passes the extension check and gives a map with every state', () => {
    const copias = leerPestanas(mensajeDeEjemplo());
    const c = armarCarrera(copias.pestanas);
    const estados = new Set(c.materias.map((m) => m.estado));
    for (const e of ['aprobada', 'regular', 'cursando', 'cursar', 'falta']) expect(estados.has(e)).toBe(true);
    expect(c.frenos.length).toBeGreaterThan(0);
  });
});

it('names the years', () => {
  expect(nombreDelAnio(1)).toBe('Primer año');
  expect(nombreDelAnio(0)).toBe('Ingreso');
  expect(nombreDelAnio(null)).toBe('Sin año');
});

describe('what Consultron reads', () => {
  const carrera = armarCarrera(leerPestanas(mensajeDeEjemplo()).pestanas);
  it('the subjects by state with their year, what each lacks, and the screen alone', () => {
    const p = carreraParaConsultron(carrera, { fecha: 'hace 3 días' });
    const dato = (e) => p.datos.find(([k]) => k === e)?.[1] ?? '';
    expect(p).toMatchObject({ titulo: 'Tu carrera', sola: true });
    expect(dato('Aprobadas')).toMatch(/Análisis Matemático I \(1\.º año, nota 8\)/);
    expect(dato('Podés cursar')).toContain('Legislación (4.º año)');
    expect(dato('Regulares')).toMatch(/Física II \(2\.º año, podés rendirla\)/);
    expect(dato('Te falta algo para cursarlas')).toMatch(/Redes de Datos \(4\.º año, te falta regularizar Comunicación de Datos\)/);
    expect(p.resultado[0]).toEqual(['Lo que más te frena para cursar', expect.stringMatching(/^Simulación \(te abre 2 materias ya, frena 2 materias contando la cadena\); Análisis de Sistemas de Información \(te abre 1 materia ya, frena 6 materias contando la cadena\)/)]);
    expect(p.resultado[1]).toEqual(['Qué final rendir primero, contando solo las que la piden aprobada', 'Análisis Matemático II (te abre 1 materia ya, frena 4 materias contando la cadena); Física II (te abre 1 materia ya, frena 1 materia contando la cadena)']);
    expect(p.notas).toContain('hace 3 días');
  });

  it('the one open and what a supposition opens', () => {
    const clave = carrera.materias.find((m) => m.nombre === 'Comunicación de Datos').clave;
    const supuestas = new Set([clave]);
    const p = carreraParaConsultron(carrera, { supuestas, abren: conSupuestas(carrera, supuestas), elegida: clave });
    const [abierta, suponiendo] = p.resultado.slice(2);
    expect(abierta[0]).toBe('La materia abierta, Comunicación de Datos (3.º año)');
    expect(abierta[1]).toMatch(/^cursando\. te la piden para cursar .*Redes de Datos/);
    expect(suponiendo).toEqual(['Suponiendo que tenés Comunicación de Datos', expect.stringContaining('se te abren para cursar Redes de Datos')]);
  });
});
