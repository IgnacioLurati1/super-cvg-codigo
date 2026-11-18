// How a student passes their week to a classmate, with no server: a link whose data travels in the hash (it never
// reaches a server). Only what the student chose on the faculty's schedules goes: each subject by its official name in
// them, its commission, the classrooms they wrote and the classes they changed by hand. Nothing of the campus: no
// course names, no course numbers. A campus course that isn't in the schedules stays out, as its name is the campus'.
// What comes in is hostile by default: another student wrote it. It goes through sanearMio, as if each subject were one
// added from the schedules, and then only the names the faculty's schedules have stay.
import { deflateSync, strFromU8, strToU8 } from 'fflate';
import { claveDeFecha, fechaDeClave } from './datos';
import { armarSemana, hoyClave } from './facultad';
import { cambiarMio, MAX_MATERIAS_DE_LA_FACULTAD, sanearMio } from './mio';
import { aBase64, deBase64, falla, inflarConTope, limpiarTexto } from './paquete';

const TIPO = 'super-cvg-horario';
const VERSION = 1;
const PREFIJO_HASH = '#horario=';
// Far more than the 20 subjects of a week with all their classes by hand, and their classrooms.
const LIMITE = 32 * 1024;
const LIMITE_TEXTO = Math.ceil((LIMITE * 4) / 3) + 1024;
// As many as a student can add from the schedules: the same check of mio.js.
export const MAX_MATERIAS = MAX_MATERIAS_DE_LA_FACULTAD;
// Under this, in minutes, the time between two classes is a break, not a gap to meet.
export const HUECO_MINIMO = 30;

const ROTO = 'Este link no es un horario de Super CVG o llegó cortado. Pedile a tu compañero que te lo mande de nuevo.';
const OTRA_VERSION = 'Este horario se armó con una versión de Super CVG que no conocemos. Recargá la página y probá de nuevo.';
const SIN_GUARDAR = 'No se pudo guardar en este navegador.';

const esPlano = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const esFecha = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && claveDeFecha(fechaDeClave(f)) === f;
const claseParaElLink = ({ dia, desde, hasta, aula, cuatrimestre }) => ({ dia, desde, hasta, ...(aula ? { aula } : {}), ...(cuatrimestre ? { cuatrimestre } : {}) });

/** What goes in the link: `paquete`, and `fuera`, the names of the campus courses with classes that stay out because
 * they aren't in the faculty's schedules (only for the screen of whoever shares). `datos`, the faculty's schedules;
 * `cursos`, the campus courses in progress; `mio`, the student's choices. */
export function armarHorario({ datos, cursos = [], mio, hoy = hoyClave() }) {
  const { materias: items } = armarSemana({ datos, cursos, mio });
  const materias = [];
  const fuera = [];
  for (const m of items) {
    if (m.noLaCursa) continue;
    const clases = (m.curso ? mio?.horario?.aMano?.cursos?.[m.curso.id] : mio?.horario?.aMano?.extras?.[m.extra.id]) ?? null;
    // Without classes there is nothing to see: a subject with no commission yet, or not in it.
    if (!(clases ? clases.length : m.deLaFacultad.length)) continue;
    if (!m.materia) {
      fuera.push(m.nombre);
      continue;
    }
    if (materias.length >= MAX_MATERIAS || materias.some((x) => x.materia === m.materia)) continue;
    const aulas = (m.curso ? mio?.materias?.[m.curso.id]?.aulas : m.extra.aulas) ?? {};
    materias.push({
      materia: m.materia,
      ...(m.codigo ? { comision: m.codigo } : {}),
      ...(Object.keys(aulas).length ? { aulas: { ...aulas } } : {}),
      ...(clases ? { clases: clases.map(claseParaElLink) } : {}),
    });
  }
  return { paquete: { tipo: TIPO, version: VERSION, fecha: hoy, ciclo: datos?.ciclo ?? null, materias }, fuera };
}

export const hayHorarioEnHash = (hash) => String(hash ?? '').startsWith(PREFIJO_HASH);

export function hashDeHorario(paquete) {
  const bytes = strToU8(JSON.stringify(paquete));
  if (bytes.length > LIMITE) throw falla('Tu horario es muy grande para pasarlo por link.');
  return PREFIJO_HASH + aBase64(deflateSync(bytes, { level: 9 }));
}

/** Whatever came in, with known fields, types and sizes: { fecha, ciclo, materias }. Each subject with an `id` of its
 * own (its place), `materia`, `comision` (or null), `aulas` by day and `clases`, the ones changed by hand (or null).
 * Throws if it isn't a week. */
export function sanearHorarioCompartido(datos) {
  if (!esPlano(datos) || datos.tipo !== TIPO) throw falla(ROTO);
  if (datos.version !== VERSION) throw falla(OTRA_VERSION);
  const crudas = (Array.isArray(datos.materias) ? datos.materias : []).filter(esPlano).slice(0, MAX_MATERIAS);
  // Each one as a subject added from the schedules: mio.js checks every value as it does with the student's own.
  const extras = crudas.map((m, i) => ({ id: i + 1, materia: typeof m.materia === 'string' ? limpiarTexto(m.materia) : '', comision: m.comision, aulas: esPlano(m.aulas) ? m.aulas : {} }));
  const aMano = Object.fromEntries(crudas.map((m, i) => [i + 1, m.clases]).filter(([, c]) => Array.isArray(c)));
  const { horario } = sanearMio({ horario: { extras, aMano: { cursos: {}, extras: aMano } } });
  const sinInvisibles = (aulas) => Object.fromEntries(Object.entries(aulas).map(([dia, aula]) => [dia, limpiarTexto(aula)]).filter(([, aula]) => aula));
  const materias = horario.extras.map((x) => ({
    id: x.id,
    materia: x.materia,
    comision: x.comision,
    aulas: sinInvisibles(x.aulas),
    clases: horario.aMano.extras[x.id]?.map((k) => ({ ...k, aula: limpiarTexto(k.aula) })) ?? null,
  }));
  if (!materias.length) throw falla(ROTO);
  return {
    fecha: esFecha(datos.fecha) ? datos.fecha : null,
    ciclo: Number.isInteger(datos.ciclo) && datos.ciclo >= 2000 && datos.ciclo <= 2100 ? datos.ciclo : null,
    materias,
  };
}

export function horarioDeHash(hash) {
  const texto = String(hash ?? '').slice(PREFIJO_HASH.length);
  if (!hayHorarioEnHash(hash) || !/^[A-Za-z0-9_-]+$/.test(texto) || texto.length > LIMITE_TEXTO) throw falla(ROTO);
  let inflado;
  try {
    inflado = inflarConTope(deBase64(texto), LIMITE, ROTO);
  } catch (error) {
    if (error.conocido) throw error;
    throw falla(ROTO);
  }
  let datos;
  try {
    datos = JSON.parse(strFromU8(inflado));
  } catch {
    throw falla(ROTO);
  }
  return sanearHorarioCompartido(datos);
}

/** Only the subjects of the faculty's schedules this site has: any other name is text another student wrote. `faltan`,
 * how many stayed out. */
export function conLosHorarios(compartido, datos) {
  const oficiales = new Set(datos?.materias ?? []);
  const materias = compartido.materias.filter((m) => oficiales.has(m.materia));
  return { ...compartido, materias, faltan: compartido.materias.length - materias.length };
}

/** The classmate's week for a cuatrimestre, as armarSemana builds the student's: each of their subjects as one added
 * from the schedules, with its classes changed by hand. */
export function semanaCompartida(materias, datos, cuatrimestre) {
  const mio = {
    horario: {
      extras: materias.map(({ id, materia, comision, aulas }) => ({ id, materia, comision, aulas })),
      aMano: { cursos: {}, extras: Object.fromEntries(materias.filter((m) => m.clases).map((m) => [m.id, m.clases])) },
    },
  };
  return armarSemana({ datos, cursos: [], mio, cuatrimestre });
}

/** The times of a day nobody of the two has a class, between the first class and the last of either: [{ desde, hasta }]. */
export function huecosDelDia(clases, minimo = HUECO_MINIMO) {
  const huecos = [];
  let fin = null;
  for (const c of [...clases].sort((a, b) => a.desde - b.desde)) {
    if (fin !== null && c.desde - fin >= minimo) huecos.push({ desde: fin, hasta: c.desde });
    fin = fin === null ? c.hasta : Math.max(fin, c.hasta);
  }
  return huecos;
}

// The same subject in the same commission, on the same day and hours: a class they take together.
const mismaClase = (a, b) => Boolean(a.comision) && a.comision === b.comision && a.materia === b.materia && a.dia === b.dia && a.desde === b.desde && a.hasta === b.hasta;

/** The two weeks in one, by day (Monday to Friday, and Saturday if one of them has classes then): `mias` and `suyas`,
 * the classes of each alone; `juntas`, the ones they take together ({ mia, suya }); and `huecos`, free for both. */
export function juntarSemanas(mias, suyas) {
  const dias = [1, 2, 3, 4, 5, ...([...mias, ...suyas].some((c) => c.dia === 6) ? [6] : [])];
  return dias.map((dia) => {
    const deEl = suyas.filter((c) => c.dia === dia);
    const soloMias = [];
    const juntas = [];
    for (const c of mias.filter((x) => x.dia === dia)) {
      const i = deEl.findIndex((s) => mismaClase(c, s));
      if (i >= 0) juntas.push({ mia: c, suya: deEl.splice(i, 1)[0] });
      else soloMias.push(c);
    }
    const todas = [...soloMias, ...deEl, ...juntas.map((j) => j.mia)];
    return { dia, mias: soloMias, suyas: deEl, juntas, huecos: huecosDelDia(todas), sinClases: !todas.length };
  });
}

/** What a subject of the classmate is for the student, among the subjects of their week (armarSemana's `materias`):
 * `juntos` (theirs, in the same commission), `otra` (theirs, in another commission or none yet) or `falta` (not
 * theirs). `mia`, their subject: the one they take, or a campus course they said they don't take, or null. */
export function estadoDe(suya, misMaterias) {
  const delMismo = misMaterias.filter((m) => m.materia === suya.materia);
  const mia = delMismo.find((m) => !m.noLaCursa) ?? null;
  if (!mia) return { estado: 'falta', mia: delMismo[0] ?? null };
  return { estado: suya.comision && mia.codigo === suya.comision ? 'juntos' : 'otra', mia };
}

const conAMano = (horario) => ({ cursos: { ...horario.aMano?.cursos }, extras: { ...horario.aMano?.extras } });
const ponerOSacar = (lista, id, clases) => {
  if (clases) lista[id] = clases.map((k) => ({ ...k }));
  else delete lista[id];
};

/** The classmate's commission in one subject of the student, with the classrooms they wrote (the student's own win)
 * and the classes they changed by hand; without those, the student's go back to the faculty's. `mia`, the student's
 * subject (armarSemana's, also a campus course they don't take), or null to add it from the schedules. Returns what
 * was there, for `deshacerCopia`. Throws if it can't be saved. */
export function copiarMateria(suya, mia) {
  let antes = null;
  let error = SIN_GUARDAR;
  const ok = cambiarMio((m) => {
    const horario = m.horario;
    const aMano = conAMano(horario);
    if (mia?.curso) {
      const id = mia.curso.id;
      const materia = m.materias[id] ?? {};
      antes = { tipo: 'curso', id, comision: materia.comision ?? null, aulas: { ...materia.aulas }, clases: horario.aMano?.cursos?.[id] ?? null };
      ponerOSacar(aMano.cursos, id, suya.clases);
      // Without a commission of the classmate (all by hand), one the student doesn't take comes back with none.
      const comision = suya.comision ?? (antes.comision === 'ninguna' ? null : antes.comision);
      return { ...m, materias: { ...m.materias, [id]: { ...materia, comision, aulas: { ...suya.aulas, ...materia.aulas } } }, horario: { ...horario, aMano } };
    }
    if (mia?.extra) {
      const id = mia.extra.id;
      const actual = horario.extras.find((x) => x.id === id);
      if (!actual) return m;
      antes = { tipo: 'extra', id, extra: { ...actual, aulas: { ...actual.aulas } }, clases: horario.aMano?.extras?.[id] ?? null };
      ponerOSacar(aMano.extras, id, suya.clases);
      const extras = horario.extras.map((x) => (x.id === id ? { ...x, comision: suya.comision ?? x.comision, aulas: { ...suya.aulas, ...x.aulas } } : x));
      return { ...m, horario: { ...horario, extras, aMano } };
    }
    if (horario.extras.length >= MAX_MATERIAS_DE_LA_FACULTAD) {
      error = `Ya sumaste ${MAX_MATERIAS_DE_LA_FACULTAD} materias, el máximo. Quitá una para sumar otra.`;
      return m;
    }
    if (horario.extras.some((x) => x.materia === suya.materia)) return m;
    const id = Math.max(Date.now(), ...horario.extras.map((x) => x.id + 1));
    antes = { tipo: 'nueva', id };
    ponerOSacar(aMano.extras, id, suya.clases);
    const extras = [...horario.extras, { id, materia: suya.materia, comision: suya.comision ?? null, aulas: { ...suya.aulas } }];
    return { ...m, horario: { ...horario, extras, aMano } };
  });
  if (!ok || !antes) throw falla(error);
  return antes;
}

/** Undoes `copiarMateria`: that subject goes back as it was. What changed in other subjects in between stays. */
export function deshacerCopia(antes) {
  const ok = cambiarMio((m) => {
    const horario = m.horario;
    const aMano = conAMano(horario);
    if (antes.tipo === 'curso') {
      ponerOSacar(aMano.cursos, antes.id, antes.clases);
      const materia = { ...m.materias[antes.id], comision: antes.comision, aulas: antes.aulas };
      return { ...m, materias: { ...m.materias, [antes.id]: materia }, horario: { ...horario, aMano } };
    }
    ponerOSacar(aMano.extras, antes.id, antes.tipo === 'extra' ? antes.clases : null);
    const extras = antes.tipo === 'extra'
      ? horario.extras.map((x) => (x.id === antes.id ? antes.extra : x))
      : horario.extras.filter((x) => x.id !== antes.id);
    return { ...m, horario: { ...horario, extras, aMano } };
  });
  if (!ok) throw falla(SIN_GUARDAR);
}
