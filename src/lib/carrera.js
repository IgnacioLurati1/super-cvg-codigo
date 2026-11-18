import { normalizar } from './datos';
import { esTroncal } from './santoResumen';
import { ENTRE_LINEAS } from './sysacadPestanas';

// «Tu carrera» (pages/Carrera.jsx): where the student stands in the plan, read from the copies of Sysacad that Sysacad
// Lindo keeps (sysacadPestanas.js). Only in memory, like the copies themselves.
//
// What each tab gives:
// - Estado académico: every subject of the plan, by year, with its state («Aprobada con 8 en 2024…», «Regularidad en
//   2025…», empty when pending).
// - Correlatividad para cursar / para rendir: only the subjects not passed yet. Each says «Puede cursar» / «Puede
//   inscribirse», or one line per missing requirement: «No regularizó X (Ord. 1878)», «No cursó X», «No aprobó ni está
//   inscripto a X». For rendir, «No regularizó <itself>» means it is not regular yet.
// Sysacad cuts the subject column at 40 characters («Sistemas de Información Geográfica (Elec»); the requirements carry
// the whole names, so a cut name is completed from them when one starts like it.

const ACCIONES = [
  [/^regulariz[oó]$/i, 'Regularizar'],
  [/^curs[oó]$/i, 'Cursar'],
  [/^aprob[oó] ni est[aá] inscripto a$/i, 'Aprobar o inscribirte a'],
  [/^aprob[oó]$/i, 'Aprobar'],
];
const REQUISITO = /^No (regulariz[oó]|curs[oó]|aprob[oó] ni est[aá] inscripto a|aprob[oó])\s+(.+)$/i;
const ORDENANZA = /\s*\(Ord\.?\s*\d+\)\s*$/i;
const HORAS_ELECTIVAS = /faltan aprobar (\d+) de (\d+) horas/i;
// Sysacad cuts at 40; one less covers a cut that leaves a trailing space.
const CORTE = 39;

// Electives: what El Santo Resumen doesn't list as a subject of the plan (santoResumen.js).
const esElectiva = (nombre) => !esTroncal(nombre);

/** The first table of a tab whose columns include all of these (compared without accents or capitals). */
function tablaCon(pestana, columnas) {
  for (const b of pestana?.bloques ?? []) {
    if (b.t !== 'tabla') continue;
    const nombres = b.columnas.map(normalizar);
    if (columnas.every((c) => nombres.includes(c))) return { indice: (c) => nombres.indexOf(c), filas: b.filas };
  }
  return null;
}

const anioDe = (texto) => {
  const n = Number.parseInt(texto, 10);
  return Number.isSafeInteger(n) && n >= 0 && n <= 9 ? n : null;
};

/** What a state of Estado académico says: aprobada, regular, cursando, pendiente or otro, and the grade if it has one. */
export function leerEstado(texto) {
  const crudo = (texto ?? '').trim();
  const n = normalizar(crudo);
  const tipo = !n || /^no curs/.test(n) ? 'pendiente'
    : /^(aprobad|promocion|equivalen)/.test(n) ? 'aprobada'
    : /^regular/.test(n) ? 'regular'
    : /^(cursa|inscript)/.test(n) ? 'cursando'
    : 'otro';
  const nota = crudo.match(/\bcon\s+(\d{1,2}(?:[.,]\d+)?)\b/i)?.[1];
  return { tipo, nota: nota ? Number(nota.replace(',', '.')) : null, crudo };
}

// A cell that says it can't without saying why: the card says one is missing, and this is the one.
const NO_DETALLA = 'Algo que Sysacad no detalla';

/** One cell of a correlatividad table: whether it can, and what is missing. */
export function leerCorrelatividad(celda) {
  const lineas = (celda ?? '').split(ENTRE_LINEAS).map((l) => l.replace(ORDENANZA, '').trim()).filter(Boolean);
  if (!lineas.length) return { puede: false, faltan: [], otros: [NO_DETALLA] };
  if (/^puede/i.test(lineas[0])) return { puede: true, faltan: [], otros: [] };
  const faltan = [];
  const otros = [];
  for (const linea of lineas) {
    // The list of elective codes after the hours line says nothing to a student.
    if (/^(c[oó]digo materia|\d+=)/i.test(linea)) continue;
    const horas = linea.match(HORAS_ELECTIVAS);
    if (horas) {
      otros.push(`${horas[1]} de ${horas[2]} horas de electivas`);
      continue;
    }
    const r = linea.match(REQUISITO);
    if (!r) {
      otros.push(linea);
      continue;
    }
    const accion = ACCIONES.find(([re]) => re.test(r[1]))[1];
    faltan.push({ accion, texto: r[2].trim(), clave: normalizar(r[2]) });
  }
  if (!faltan.length && !otros.length) otros.push(NO_DETALLA);
  return { puede: false, faltan, otros };
}

function filasDeCorrelatividad(pestana) {
  const t = tablaCon(pestana, ['ano', 'materia', 'correlatividad']);
  if (!t) return null;
  const [a, m, c] = ['ano', 'materia', 'correlatividad'].map(t.indice);
  return t.filas
    .filter((f) => f[m])
    .map((f) => ({ anio: anioDe(f[a] ?? ''), nombre: f[m].trim(), ...leerCorrelatividad(f[c]) }));
}

function filasDeEstado(pestana) {
  const t = tablaCon(pestana, ['ano', 'materia', 'estado']);
  if (!t) return null;
  const [a, m, e, n] = ['ano', 'materia', 'estado', 'nota'].map(t.indice);
  return t.filas.filter((f) => f[m]).map((f) => {
    const estado = leerEstado(f[e]);
    // Some copies bring the grade in a column of its own.
    const nota = n >= 0 ? Number.parseFloat((f[n] ?? '').replace(',', '.')) : Number.NaN;
    return { anio: anioDe(f[a] ?? ''), nombre: f[m].trim(), ...estado, nota: estado.nota ?? (nota >= 1 && nota <= 10 ? nota : null) };
  });
}

/**
 * The whole picture from the copies of Sysacad ({ pestanas } as sysacadPestanas.js reads them) and the finals Sysacad
 * Lindo gives ([{ nombre, nota }], may be null).
 *
 * Each subject: { clave, nombre, anio, electiva, estado, nota, cursar, rendir }.
 * `estado`: 'aprobada', 'regular' (can sit the final once `rendir.puede`), 'cursando', 'cursar' (can start it),
 * 'falta' (something missing to start it) or 'pendiente' (nothing else known).
 * `cursar` / `rendir`: { puede, faltan: [{ accion, texto, clave }], otros: [texto] } or null when that tab is missing.
 * Also: `tiene` (which tabs it used), `fecha` (the oldest copy used), `anios`, `frenos` (what holds back the most).
 */
export function armarCarrera(pestanas, finales = null) {
  const de = (clave) => pestanas?.find((p) => p.clave === clave) ?? null;
  const estado = filasDeEstado(de('estado'));
  const cursar = filasDeCorrelatividad(de('correlativas-cursar'));
  const rendir = filasDeCorrelatividad(de('correlativas-rendir'));
  const usadas = [estado && de('estado'), cursar && de('correlativas-cursar'), rendir && de('correlativas-rendir')].filter(Boolean);

  // Whole names known from the requirements: a cut subject name takes the one that starts like it.
  const enteros = new Map();
  for (const f of [...(cursar ?? []), ...(rendir ?? [])]) for (const r of f.faltan) enteros.set(r.clave, r.texto);
  const completar = (nombre) => {
    if (nombre.length < CORTE) return nombre;
    const corto = normalizar(nombre);
    for (const [clave, texto] of enteros) if (clave.length > corto.length && clave.startsWith(corto)) return texto;
    return nombre;
  };

  const materias = new Map();
  // The same subject by its whole key, or by a cut one (a requirement names it whole, a row cut).
  const buscar = (clave) => {
    if (materias.has(clave)) return materias.get(clave);
    for (const m of materias.values()) {
      if (m.clave.length >= CORTE - 1 && clave.startsWith(m.clave)) return m;
      if (clave.length >= CORTE - 1 && m.clave.startsWith(clave)) return m;
    }
    return null;
  };
  const sumar = (fila) => {
    const nombre = completar(fila.nombre);
    const clave = normalizar(nombre);
    let m = buscar(clave);
    if (!m) {
      m = { clave, nombre, anio: fila.anio, electiva: esElectiva(nombre), estado: 'pendiente', sysacad: null, nota: null, cursar: null, rendir: null };
      materias.set(clave, m);
    } else if (nombre.length > m.nombre.length) {
      m.nombre = nombre;
      m.electiva = esElectiva(nombre);
    }
    m.anio ??= fila.anio;
    return m;
  };

  for (const f of estado ?? []) {
    const m = sumar(f);
    m.sysacad = f.tipo;
    m.nota = f.nota;
  }
  for (const f of cursar ?? []) sumar(f).cursar = { puede: f.puede, faltan: f.faltan, otros: f.otros };
  for (const f of rendir ?? []) {
    const m = sumar(f);
    // «No regularizó <itself>»: what it lacks for the final is to be regular. That says it is not regular yet.
    const propia = f.faltan.some((r) => r.clave === m.clave || (m.clave.length >= CORTE - 1 && r.clave.startsWith(m.clave)));
    m.rendir = { puede: f.puede, faltan: f.faltan.filter((r) => r.clave !== m.clave && !(m.clave.length >= CORTE - 1 && r.clave.startsWith(m.clave))), otros: f.otros, propia };
  }

  // Finals with a grade: passed, with the grade Sysacad gives. Without Estado académico they are the only way to know.
  for (const fin of finales ?? []) {
    const m = buscar(normalizar(fin.nombre));
    if (m) {
      m.sysacad = 'aprobada';
      m.nota ??= fin.nota;
    }
  }

  for (const m of materias.values()) m.estado = estadoDe(m);

  // Requirements point at the subject they name, by its key in the map, when it is there.
  for (const m of materias.values()) {
    for (const r of [...(m.cursar?.faltan ?? []), ...(m.rendir?.faltan ?? [])]) {
      const destino = buscar(r.clave);
      if (destino) r.clave = destino.clave;
    }
  }

  const lista = [...materias.values()].sort((a, b) => (a.anio ?? 99) - (b.anio ?? 99) || a.electiva - b.electiva);
  const anios = [...new Set(lista.map((m) => m.anio))].sort((a, b) => (a ?? 99) - (b ?? 99));
  return {
    materias: lista,
    anios,
    frenos: frenosDe(lista),
    tiene: { estado: Boolean(estado), cursar: Boolean(cursar), rendir: Boolean(rendir) },
    fecha: usadas.length ? Math.min(...usadas.map((p) => p.fecha)) : null,
    aprobadasSinMapa: estado ? 0 : (finales ?? []).filter((f) => !buscar(normalizar(f.nombre))).length,
  };
}

function estadoDe(m) {
  if (m.sysacad === 'aprobada') return 'aprobada';
  // Listed for the final without lacking itself: it is regular.
  if (m.sysacad === 'regular' || (m.rendir && !m.rendir.propia)) return 'regular';
  if (m.sysacad === 'cursando') return 'cursando';
  if (m.cursar) return m.cursar.puede ? 'cursar' : 'falta';
  return 'pendiente';
}

/** The subjects that hold back the most others (for starting them), with how many. Only ones that hold back two or more.
 * Electives don't count: there are many and none is a must. */
function frenosDe(materias) {
  const cuenta = new Map();
  for (const m of materias) {
    if (m.estado !== 'falta' || m.electiva) continue;
    for (const clave of new Set(m.cursar.faltan.map((r) => r.clave))) cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  const porClave = new Map(materias.map((m) => [m.clave, m]));
  return [...cuenta]
    .filter(([, n]) => n >= 2)
    .map(([clave, n]) => ({ clave, nombre: porClave.get(clave)?.nombre ?? clave, cuenta: n, enMapa: porClave.has(clave) }))
    .sort((a, b) => b.cuenta - a.cuenta || a.nombre.localeCompare(b.nombre, 'es'));
}

/** The subjects that name this one among what they lack to start them (or, regular ones, to sit the final). */
export function loQueDestraba(carrera, clave) {
  const cursar = carrera.materias.filter((m) => m.estado === 'falta' && m.cursar.faltan.some((r) => r.clave === clave));
  const rendir = carrera.materias.filter((m) => m.estado === 'regular' && m.rendir?.faltan.some((r) => r.clave === clave));
  return { cursar, rendir };
}

/**
 * Supposing the student gets these subjects (a Set of keys): the ones that would be left with nothing missing to start
 * them, and the regular ones left with nothing missing to sit the final.
 */
export function conSupuestas(carrera, supuestas) {
  const libre = (lado) => lado && !lado.puede && !lado.otros.length && lado.faltan.length > 0 && lado.faltan.every((r) => supuestas.has(r.clave));
  const cursar = new Set();
  const rendir = new Set();
  if (!supuestas.size) return { cursar, rendir };
  for (const m of carrera.materias) {
    if (supuestas.has(m.clave)) continue;
    if (m.estado === 'falta' && libre(m.cursar)) cursar.add(m.clave);
    if (m.estado === 'regular' && libre(m.rendir)) rendir.add(m.clave);
  }
  return { cursar, rendir };
}

/** How many subjects in each state, electives apart. */
export function cuentas(materias) {
  const c = { aprobada: 0, regular: 0, cursando: 0, cursar: 0, falta: 0, pendiente: 0, total: 0 };
  for (const m of materias) {
    if (m.electiva) continue;
    c[m.estado] += 1;
    c.total += 1;
  }
  return c;
}

const ORDINALES = ['Ingreso', 'Primer año', 'Segundo año', 'Tercer año', 'Cuarto año', 'Quinto año', 'Sexto año'];
/** «Primer año», «Ingreso»; «Sin año» when Sysacad did not say. */
export const nombreDelAnio = (anio) => (anio === null ? 'Sin año' : ORDINALES[anio] ?? `Año ${anio}`);

// What Consultron reads of Tu carrera, in its words: short, by state, with the year of each subject and what it lacks.
const ESTADOS = { aprobada: 'aprobada', regular: 'regular', cursando: 'cursando', cursar: 'podés cursarla', falta: 'te falta algo para cursarla', pendiente: 'sin datos' };
const anioEnTexto = (m) => (m.anio === null ? '' : m.anio === 0 ? 'ingreso' : `${m.anio}.º año`);
const nota = (n) => String(n).replace('.', ',');

/**
 * Tu carrera as Consultron reads it (consultron/pantalla.js): the subjects by state, what it can take or sit for, what
 * holds back the most, the one open and what a supposition opens. `abren`: what conSupuestas gave.
 */
export function carreraParaConsultron(carrera, { supuestas = new Set(), abren = { cursar: new Set(), rendir: new Set() }, elegida = null, fecha = '', preguntada = false } = {}) {
  const porClave = new Map(carrera.materias.map((m) => [m.clave, m]));
  const nombre = (clave, texto) => porClave.get(clave)?.nombre ?? texto;
  const falta = (lado) => [...lado.faltan.map((r) => `${r.accion.toLowerCase()} ${nombre(r.clave, r.texto)}`), ...lado.otros.map((o) => o.charAt(0).toLowerCase() + o.slice(1))].join(', ');
  const con = (m, extra = '') => {
    const partes = [anioEnTexto(m), m.electiva && !/elec/i.test(m.nombre) ? 'electiva' : '', extra].filter(Boolean);
    return partes.length ? `${m.nombre} (${partes.join(', ')})` : m.nombre;
  };
  const de = (estado, { electivas = true } = {}) => carrera.materias.filter((m) => m.estado === estado && (electivas || !m.electiva));
  const lista = (ms, extra) => ms.map((m) => con(m, extra?.(m))).join('; ');
  const datos = [
    ['Aprobadas', lista(de('aprobada'), (m) => (m.nota ? `nota ${nota(m.nota)}` : ''))],
    ['Regulares', lista(de('regular'), (m) => (!m.rendir ? '' : m.rendir.puede ? 'podés rendirla' : `para rendirla te falta ${falta(m.rendir)}`))],
    ['Cursando', lista(de('cursando'))],
    ['Podés cursar', lista(de('cursar'))],
    // Electives not started are many and say little: only the ones it can take, above.
    ['Te falta algo para cursarlas', lista(de('falta', { electivas: false }), (m) => `te falta ${falta(m.cursar)}`)],
    ['Sin datos de Sysacad', lista(de('pendiente', { electivas: false }))],
  ].filter(([, v]) => v);

  const resultado = [];
  if (carrera.frenos.length) resultado.push(['Lo que más te frena', carrera.frenos.slice(0, 5).map((f) => `${f.nombre} (frena ${f.cuenta} materias)`).join('; ')]);
  const m = elegida ? porClave.get(elegida) : null;
  if (m) {
    const d = loQueDestraba(carrera, m.clave);
    const partes = [m.estado === 'aprobada' && m.nota ? `aprobada con ${nota(m.nota)}` : ESTADOS[m.estado]];
    if (m.estado === 'falta') partes.push(`para cursarla te falta ${falta(m.cursar)}`);
    if (m.estado === 'regular' && m.rendir?.puede) partes.push('podés rendirla');
    if (m.estado === 'regular' && m.rendir && !m.rendir.puede) partes.push(`para rendirla te falta ${falta(m.rendir)}`);
    if (d.cursar.length) partes.push(`te la piden para cursar ${d.cursar.map((x) => x.nombre).join(', ')}`);
    if (d.rendir.length) partes.push(`te la piden para rendir ${d.rendir.map((x) => x.nombre).join(', ')}`);
    // From another screen it's the one the question names, not one open.
    resultado.push([`${preguntada ? 'La materia por la que pregunta' : 'La materia abierta'}, ${con(m)}`, partes.join('. ')]);
  }
  if (supuestas.size) {
    const se = [...abren.cursar].map((k) => nombre(k, k));
    const rinde = [...abren.rendir].map((k) => nombre(k, k));
    resultado.push([
      `Suponiendo que tenés ${[...supuestas].map((k) => nombre(k, k)).join(', ')}`,
      se.length || rinde.length ? [se.length && `se te abren para cursar ${se.join(', ')}`, rinde.length && `para rendir ${rinde.join(', ')}`].filter(Boolean).join('; ') : 'no se te abre ninguna más',
    ]);
  }
  const c = cuentas(carrera.materias);
  return {
    titulo: 'Tu carrera',
    datos,
    resultado,
    notas: `Sale de lo que el alumno abrió de Sysacad${fecha ? ` ${fecha}` : ''}. Sin contar electivas, tiene ${c.aprobada} de ${c.total} materias aprobadas. «Podés cursar» y «podés rendir» son lo que dice Sysacad hoy.`,
    sola: true,
  };
}
