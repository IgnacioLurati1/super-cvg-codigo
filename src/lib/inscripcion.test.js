import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarCursos, cargarAreas, cargarMaterias, cursosDeCategoria, inscribirmeEn, revisarInscripcion } from './campus';
import { DEMO } from './demo';
import {
  anioDe, armarAreas, categoriasConCursos, coincide, conDocentes, cursoDelCatalogo, enRama, esDeOtroAnio, estaAbierta, inscripcionPropia, juntar, letraDe, lugarDe,
  nombreCorto, partesDe, patronDeBusqueda, porLetra, sinAnio,
} from './inscripcion';
import { TOKEN_DEMO } from './modoDemo';
import { iniciarSesion, tokenActual, vaciarCache } from './sesion';

const categoria = (id, name, path, coursecount, sortorder) => ({ id, name, path, coursecount, sortorder, parent: Number(path.split('/').at(-2)) || 0, depth: path.split('/').length - 1 });
const CATEGORIAS = [
  categoria(1, 'Ingeniería Química', '/1', 0, 10),
  categoria(2, 'Primer año', '/1/2', 4, 20),
  categoria(3, 'Comisión A', '/1/2/3', 2, 30),
  categoria(4, 'Posgrado', '/4', 0, 40),
  categoria(5, 'Ingreso &amp; nivelación', '/5', 3, 50),
  // Its parent (9) is out of sight for the student.
  categoria(6, 'Electivas', '/9/6', 1, 60),
];

describe('armarAreas without «Grado»', () => {
  const arbol = armarAreas(CATEGORIAS);

  it('takes the top categories with courses as the areas, in the campus order', () => {
    expect(arbol.departamentos).toEqual([]);
    expect(arbol.otras.map((c) => c.nombre)).toEqual(['Ingeniería Química', 'Ingreso & nivelación', 'Electivas']);
  });

  it('lists the parts of an area that hold courses, named from the area down', () => {
    expect(arbol.otras[0].partes).toEqual([{ id: 2, nombre: 'Primer año' }, { id: 3, nombre: 'Primer año, Comisión A' }]);
    expect(arbol.otras[1].partes).toEqual([]);
    expect(arbol.otras[0].cursos).toBe(6);
  });

  it('knows which courses are in a career or a part of it', () => {
    expect(enRama(arbol, 3, 1)).toBe(true);
    expect(enRama(arbol, 3, 2)).toBe(true);
    expect(enRama(arbol, 2, 3)).toBe(false);
    expect(enRama(arbol, 5, 1)).toBe(false);
    expect(enRama(arbol, 77, 1)).toBe(false);
    expect(enRama(arbol, 77, 0)).toBe(true);
  });

  it('says career and year of a course, or the campus category name when it is out of sight', () => {
    expect(lugarDe(arbol, { categoria: 3, categoriaNombre: 'x' })).toBe('Ingeniería Química, Primer año, Comisión A');
    expect(lugarDe(arbol, { categoria: 77, categoriaNombre: 'Otra' })).toBe('Otra');
  });

  it('leaves out of the place what the lists already say', () => {
    expect(lugarDe(arbol, { categoria: 3 }, 1)).toBe('Primer año, Comisión A');
    expect(lugarDe(arbol, { categoria: 3 }, 3)).toBe('');
    expect(lugarDe(arbol, { categoria: 3 }, 5)).toBe('Ingeniería Química, Primer año, Comisión A');
  });

  it('lists a career from the categories that hold courses of their own', () => {
    expect(categoriasConCursos(arbol, 1)).toEqual([2, 3]);
    expect(categoriasConCursos(arbol, 3)).toEqual([3]);
  });

  it('copes with an answer that is not a list', () => {
    expect(armarAreas({ exception: 'x' })).toMatchObject({ departamentos: [], otras: [] });
  });
});

// Like the real campus: secretariats and Ingreso on top, the departments inside «Grado», Posgrado with its kinds.
const CAMPUS_REAL = [
  categoria(18, 'Sec. Académica', '/18', 3, 10),
  categoria(1, 'Ingreso', '/1', 6, 20),
  categoria(3, 'Grado', '/3', 0, 30),
  categoria(10, 'Depto Ingeniería Eléctrica', '/3/10', 40, 31),
  categoria(13, 'Depto Ingeniería en Sistemas', '/3/13', 90, 32),
  categoria(8, 'Depto Materias Básicas', '/3/8', 120, 33),
  categoria(9, 'Depto Ingeniería Civil', '/3/9', 0, 34),
  categoria(91, 'Comisión 01', '/3/9/91', 5, 35),
  categoria(14, 'Depto vacío', '/3/14', 0, 36),
  categoria(2, 'Posgrado y Educación Continua', '/2', 0, 40),
  categoria(21, 'Diplomaturas', '/2/21', 7, 41),
];

describe('armarAreas on the campus as it is', () => {
  const arbol = armarAreas(CAMPUS_REAL);

  it('takes the departments from inside «Grado», by their short name, leaving the empty ones out', () => {
    expect(arbol.departamentos.map((d) => [d.corto, d.cursos])).toEqual([['Básicas', 120], ['Civil', 5], ['Eléctrica', 40], ['Sistemas', 90]]);
    expect(arbol.departamentos.find((d) => d.corto === 'Civil').partes).toEqual([{ id: 91, nombre: 'Comisión 01' }]);
  });

  it('keeps the rest of the campus apart, in its order, without «Grado»', () => {
    expect(arbol.otras.map((o) => o.nombre)).toEqual(['Sec. Académica', 'Ingreso', 'Posgrado y Educación Continua']);
    expect(arbol.otras[2].partes).toEqual([{ id: 21, nombre: 'Diplomaturas' }]);
  });

  it('says where a course is the way students do', () => {
    expect(lugarDe(arbol, { categoria: 13 })).toBe('Sistemas');
    expect(lugarDe(arbol, { categoria: 91 })).toBe('Civil, Comisión 01');
    expect(lugarDe(arbol, { categoria: 91 }, 9)).toBe('Comisión 01');
    expect(lugarDe(arbol, { categoria: 21 })).toBe('Posgrado y Educación Continua, Diplomaturas');
    expect(lugarDe(arbol, { categoria: 13 }, 13)).toBe('');
  });
});

describe('nombreCorto', () => {
  it('drops «Depto» and «Ingeniería en» the way students say it', () => {
    expect(nombreCorto('Depto Ingeniería en Sistemas')).toBe('Sistemas');
    expect(nombreCorto('Depto Materias Básicas')).toBe('Básicas');
    expect(nombreCorto('Departamento de Ingeniería Química')).toBe('Química');
    expect(nombreCorto('Ingreso')).toBe('Ingreso');
  });
});

describe('years in a course name', () => {
  it('finds the year, the last one, and never one inside a code', () => {
    expect(anioDe('Algoritmos y Estructuras de Datos 2026')).toBe(2026);
    expect(anioDe('Economía - Ingeniería Civil 3°01-2025')).toBe(2025);
    expect(anioDe('Seminario Universitario 2027 - Convenio')).toBe(2027);
    expect(anioDe('Análisis Matemático II-201ISI')).toBeNull();
    expect(anioDe('1 AVA 21')).toBeNull();
    expect(anioDe('Comisión 20261')).toBeNull();
  });

  it('takes it out of the name, with the dash around it', () => {
    expect(sinAnio('Algoritmos y Estructuras de Datos 2026')).toBe('Algoritmos y Estructuras de Datos');
    expect(sinAnio('Algoritmos y Estructuras de Datos - Mesa de examen  2022')).toBe('Algoritmos y Estructuras de Datos - Mesa de examen');
    expect(sinAnio('Economía - Ingeniería Civil 3°01-2025')).toBe('Economía - Ingeniería Civil 3°01');
    expect(sinAnio('ECONOMIA ING CIVIL 2026 (3 01)')).toBe('ECONOMIA ING CIVIL (3 01)');
    expect(sinAnio('Física (2026)')).toBe('Física');
    expect(sinAnio('2026')).toBe('2026');
  });

  it('calls old only a course whose name says an earlier year', () => {
    expect(esDeOtroAnio({ nombre: 'Física II 2025' }, 2026)).toBe(true);
    expect(esDeOtroAnio({ nombre: 'Física II 2026' }, 2026)).toBe(false);
    expect(esDeOtroAnio({ nombre: 'Seminario 2027' }, 2026)).toBe(false);
    expect(esDeOtroAnio({ nombre: 'Física II' }, 2026)).toBe(false);
  });
});

describe('porLetra', () => {
  it('goes in alphabetical order by the name without its year, accents aside, the newest first', () => {
    const grupos = porLetra([
      { id: 1, nombre: 'Bases de Datos' },
      { id: 2, nombre: 'Álgebra 2025' },
      { id: 3, nombre: 'Álgebra 2026' },
      { id: 4, nombre: 'Análisis Numérico' },
      { id: 5, nombre: '1 AVA 21' },
    ]);
    expect(grupos.map((g) => [g.letra, g.cursos.map((c) => c.id)])).toEqual([['#', [5]], ['A', [3, 2, 4]], ['B', [1]]]);
    expect(letraDe('«Ética»')).toBe('E');
  });
});

describe('conDocentes', () => {
  it('lists up to three, and counts the rest', () => {
    expect(conDocentes([])).toBe('');
    expect(conDocentes(['Ana'])).toBe('Con Ana');
    expect(conDocentes(['Ana', 'Beto'])).toBe('Con Ana y Beto');
    expect(conDocentes(['Ana', 'Beto', 'Caro'])).toBe('Con Ana, Beto y Caro');
    expect(conDocentes(['Ana', 'Beto', 'Caro', 'Dani'])).toBe('Con Ana, Beto y 2 más');
  });
});

describe('patronDeBusqueda', () => {
  it('lets each vowel stand for itself with or without an accent', () => {
    expect(patronDeBusqueda('Física')).toBe('f_s_c_');
    expect(patronDeBusqueda('fisica')).toBe('f_s_c_');
    expect(patronDeBusqueda('análisis  2')).toBe('_n_l_s_s 2');
    expect(patronDeBusqueda('Diseño')).toBe('d_s_ñ_');
  });

  it('leaves out the signs that would change the campus search', () => {
    expect(patronDeBusqueda('+fisica -quimica 100%')).toBe('f_s_c_ q__m_c_ 100');
  });

  it('sends the words as they are when they are only vowels', () => {
    expect(patronDeBusqueda('ia')).toBe('ia');
  });
});

describe('coincide and partesDe', () => {
  const curso = { nombre: 'Física I', corto: 'FIS1-ISI' };
  it('match every word without minding capitals or accents, also in the short name', () => {
    expect(coincide(curso, 'fisica')).toBe(true);
    expect(coincide(curso, 'FÍSICA isi')).toBe(true);
    expect(coincide(curso, 'fisica 2')).toBe(false);
  });

  it('mark what matched in the name as it is written', () => {
    expect(partesDe('Física I', 'fisica')).toEqual([{ texto: 'Física', marca: true }, { texto: ' I', marca: false }]);
    expect(partesDe('Física I', '')).toEqual([{ texto: 'Física I', marca: false }]);
  });
});

describe('cursoDelCatalogo', () => {
  it('keeps the name as text and knows whether it has a self enrolment', () => {
    const c = cursoDelCatalogo({ id: 5, fullname: 'x', displayname: '<b>Física</b> I', shortname: 'F1', categoryid: 2, categoryname: 'Primer año', enrollmentmethods: ['manual', 'self'] });
    expect(c).toMatchObject({ id: 5, nombre: 'Física I', corto: 'F1', categoria: 2, propia: true });
    expect(cursoDelCatalogo({ id: 6, fullname: 'y', enrollmentmethods: ['manual'] }).propia).toBe(false);
    expect(cursoDelCatalogo({ fullname: 'sin número' })).toBeNull();
  });
});

describe('inscripcionPropia', () => {
  it('finds an open self enrolment, among others that are not', () => {
    expect(inscripcionPropia([])).toEqual({ estado: 'sin' });
    expect(inscripcionPropia([{ id: 1, type: 'guest', status: true }])).toEqual({ estado: 'sin' });
    expect(inscripcionPropia([{ id: 2, type: 'self', status: 'No se admiten nuevas matriculaciones' }])).toEqual({ estado: 'cerrada' });
    expect(inscripcionPropia([{ id: 2, type: 'self', status: 'llena' }, { id: 3, type: 'self', status: true }])).toEqual({ estado: 'abierta', instancia: 3 });
    expect(inscripcionPropia({ exception: 'x' })).toEqual({ estado: 'sin' });
  });

  it('takes only a clear yes as open', () => {
    expect([true, 1, '1', 'true'].every(estaAbierta)).toBe(true);
    expect([false, 0, '', null, undefined, 'Matrícula cerrada'].some(estaAbierta)).toBe(false);
  });
});

describe('juntar', () => {
  const tandas = [[1, 2, 3], [4, 5], [6], [7, 8]].map((ids, n, todas) => ({ cursos: ids.map((id) => ({ id })), fin: n === todas.length - 1 }));
  const traer = vi.fn(async (n) => tandas[n]);
  beforeEach(() => traer.mockClear());

  it('stops once it has enough', async () => {
    expect(await juntar(traer, { quiero: 4 })).toEqual({ cursos: [1, 2, 3, 4, 5].map((id) => ({ id })), siguiente: 2 });
    expect(traer).toHaveBeenCalledTimes(2);
  });

  it('stops at the last batch and at the most batches allowed', async () => {
    expect((await juntar(traer, { desde: 2, quiero: 10 })).siguiente).toBeNull();
    expect(await juntar(traer, { quiero: 10, vueltas: 1 })).toMatchObject({ siguiente: 1 });
  });

  it('keeps only what it accepts, once each', async () => {
    const repetidas = async () => ({ cursos: [{ id: 1 }, { id: 1 }, { id: 2 }], fin: true });
    expect((await juntar(repetidas, { aceptar: (c) => c.id !== 2 })).cursos).toEqual([{ id: 1 }]);
  });
});

describe('the sample catalog', () => {
  beforeEach(() => {
    vaciarCache();
    sessionStorage.clear();
    iniciarSesion(TOKEN_DEMO);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('searches like the campus: «fisica» as typed misses «Física», the pattern finds it', async () => {
    const tal = await DEMO.responder('core_course_search_courses', { criterianame: 'search', criteriavalue: 'fisica', page: 0, perpage: 50 });
    expect(tal.total).toBe(0);
    const { cursos } = await buscarCursos('fisica', 0);
    expect(cursos.length).toBeGreaterThan(3);
    expect(cursos.every((c) => c.nombre.startsWith('Física'))).toBe(true);
  });

  it('has the departments of the campus, and lists one with who gives each course', async () => {
    const arbol = await cargarAreas();
    expect(arbol.departamentos.map((d) => d.corto)).toEqual(['Básicas', 'Civil', 'Eléctrica', 'Mecánica', 'Química', 'Sistemas']);
    expect(arbol.otras.map((o) => o.nombre)).toContain('Ingreso');
    const basicas = await cursosDeCategoria(arbol.departamentos[0].id);
    expect(basicas.map((c) => c.nombre)).toContain('Análisis Matemático I');
    expect(basicas.find((c) => c.id === 101).docentes.length).toBeGreaterThan(0);
  });

  it('enrols for pretend, asks for the key «demo», and never touches the network', async () => {
    const red = vi.fn(async () => { throw new Error('no network in the sample mode'); });
    vi.stubGlobal('fetch', red);
    const algebra = await revisarInscripcion(102);
    expect(algebra).toEqual({ estado: 'abierta', instancia: 1021, conClave: true });
    await expect(inscribirmeEn(102, { instancia: 1021, clave: 'otra' })).rejects.toMatchObject({ codigo: 'clave_incorrecta' });
    expect(await inscribirmeEn(102, { instancia: 1021, clave: 'demo' })).toEqual({ ya: false });
    const { enCurso, otras } = await cargarMaterias();
    expect([...enCurso, ...otras].map((m) => m.id)).toContain(102);
    expect(await revisarInscripcion(113)).toEqual({ estado: 'cerrada' });
    expect(await revisarInscripcion(104)).toEqual({ estado: 'sin' });
    expect(red).not.toHaveBeenCalled();
  });
});

describe('against the campus', () => {
  // A stand-in campus: each function answers what the test says, and every request is kept.
  let respuestas;
  const pedidos = [];
  beforeEach(() => {
    vaciarCache();
    sessionStorage.clear();
    localStorage.clear();
    iniciarSesion('real');
    pedidos.length = 0;
    respuestas = {
      core_webservice_get_site_info: () => ({ userid: 9, firstname: 'Ana' }),
      core_enrol_get_users_courses: () => [{ id: 1, fullname: 'Una' }],
      core_course_get_enrolled_courses_by_timeline_classification: () => ({ courses: [{ id: 1 }] }),
    };
    vi.stubGlobal('fetch', vi.fn(async (_url, { body }) => {
      const funcion = body.get('wsfunction');
      pedidos.push(funcion);
      return new Response(JSON.stringify(respuestas[funcion]?.(body) ?? {}), { headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const negado = () => ({ exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Access control exception' });

  it('keeps the session when the campus only closes a function of Inscripción', async () => {
    respuestas.core_course_search_courses = negado;
    await expect(buscarCursos('fisica', 0)).rejects.toMatchObject({ codigo: 'sin_permiso' });
    expect(tokenActual()).toBe('real');
    expect(pedidos).toEqual(['core_course_search_courses', 'core_webservice_get_site_info']);
  });

  it('closes it when the key is the one that died', async () => {
    respuestas.core_course_search_courses = negado;
    respuestas.core_webservice_get_site_info = negado;
    await expect(buscarCursos('fisica', 0)).rejects.toMatchObject({ codigo: 'sesion' });
    expect(tokenActual()).toBeNull();
  });

  it('searches with the pattern, and with the words as typed when the pattern finds nothing', async () => {
    const valores = [];
    respuestas.core_course_search_courses = (body) => {
      valores.push([body.get('criteriavalue'), body.get('page'), body.get('perpage')]);
      return body.get('criteriavalue') === 'fisica' ? { total: 1, courses: [{ id: 5, fullname: 'fisica', enrollmentmethods: ['self'] }] } : { total: 0, courses: [] };
    };
    expect((await buscarCursos('fisica', 0)).cursos.map((c) => c.id)).toEqual([5]);
    expect(valores).toEqual([['f_s_c_', '0', '50'], ['fisica', '0', '50']]);
  });

  it('enrols, and the courses of the student are asked again', async () => {
    respuestas.enrol_self_enrol_user = () => ({ status: true, warnings: [] });
    await cargarMaterias();
    expect(await inscribirmeEn(5, { instancia: 51, clave: 'k' })).toEqual({ ya: false });
    pedidos.length = 0;
    await cargarMaterias();
    expect(pedidos).toContain('core_enrol_get_users_courses');
  });

  it('takes «closed» from a course the student is already in as done', async () => {
    respuestas.enrol_self_enrol_user = () => ({ status: false, warnings: [{ warningcode: '1', message: 'x' }] });
    respuestas.core_enrol_get_users_courses = () => [{ id: 5, fullname: 'Ya mía' }];
    expect(await inscribirmeEn(5, { instancia: 51 })).toEqual({ ya: true });
  });

  it('asks how a course takes students: methods, then the instance', async () => {
    respuestas.core_enrol_get_course_enrolment_methods = () => [{ id: 51, courseid: 5, type: 'self', status: true, wsfunction: 'enrol_self_get_instance_info' }];
    respuestas.enrol_self_get_instance_info = (body) => ({ id: Number(body.get('instanceid')), courseid: 5, type: 'self', status: true, enrolpassword: 'Clave' });
    expect(await revisarInscripcion(5)).toEqual({ estado: 'abierta', instancia: 51, conClave: true });
    expect(pedidos).toEqual(['core_enrol_get_course_enrolment_methods', 'enrol_self_get_instance_info']);
  });
});
