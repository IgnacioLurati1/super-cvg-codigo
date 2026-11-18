import { MAX_SENALADORES, nombreDeSenalador } from '../lectura';
import { colorSeguro } from './apunte';
import { anotar, borrarMarca, leerMarcas, MAX_MARCAS, nuevoId, ponerMarca } from './marcasApunte';

// A PDF of the table opens in the site's reader (VisorPdf.jsx), with what it keeps for a file of the student's
// (resaltados.js): highlights with their notes, and bookmarks. On the table they are the session's: in the tab's map,
// shared and in memory only, never in the student's things. Each highlight is a mark of marcasApunte.js, in the color
// of whoever made it; a bookmark is `s:<page>`. The reader's ids are numbers: a mark's 12 hex digits, read as one.

const CLAVE_SENAL = /^s:(\d{1,5})$/;
const MAX_PAGINA = 5000;
// When there is no color to read, the color of the reader's own notes.
const SIN_COLOR = '#5b5bd6';

const hexDe = (id) => (Number.isSafeInteger(id) && id >= 0 && id < 2 ** 48 ? id.toString(16).padStart(12, '0') : null);

/** What the reader shows: { pagina: null, resaltados, senaladores }, each highlight with its `autor` (de, nombre,
 * color, and `propio` when it is of `yo`) and the `texto` it took. */
export function lecturaDeLaMesa(datos, yo) {
  const resaltados = leerMarcas(datos).map((m) => ({
    id: Number.parseInt(m.id, 16),
    pagina: m.pagina,
    cajas: m.cajas,
    desde: m.desde,
    hasta: m.hasta,
    color: 'amarillo',
    nota: m.nota,
    texto: m.texto,
    creado: m.cuando || 1,
    cambiado: m.cuando || 1,
    autor: { de: m.de, nombre: m.nombre, color: colorSeguro(m.color) ?? SIN_COLOR, propio: m.de === yo.id },
  }));
  const senaladores = [];
  datos.forEach((v, clave) => {
    const x = CLAVE_SENAL.exec(clave);
    const pagina = x ? Number(x[1]) : 0;
    if (!x || pagina < 1 || pagina > MAX_PAGINA || !v || typeof v !== 'object') return;
    const nombre = nombreDeSenalador(v.nombre);
    senaladores.push({ pagina, creado: Number.isFinite(v.cuando) ? v.cuando : 1, ...(nombre ? { nombre } : {}) });
  });
  senaladores.sort((a, b) => a.pagina - b.pagina);
  return { pagina: null, resaltados, senaladores: senaladores.slice(0, MAX_SENALADORES) };
}

/** Where the reader keeps them on the table (the `notas` of VisorPdf's `compartido`). */
export function notasDeLaMesa(doc, datos, yo) {
  const senales = () => [...datos.keys()].filter((k) => CLAVE_SENAL.test(k)).length;
  return {
    sinLugar: `Este apunte ya tiene ${MAX_MARCAS} resaltados. Borrá alguno para sumar otro.`,
    nuevoId: () => Number.parseInt(nuevoId(), 16),
    // A new one is of `yo`; one deleted coming back («Deshacer»), of whoever made it.
    resaltar(r) {
      const id = hexDe(r?.id);
      if (!id) return false;
      const autor = r.autor ?? null;
      return ponerMarca(doc, datos, {
        id,
        pagina: r.pagina,
        cajas: r.cajas,
        desde: r.desde,
        hasta: r.hasta,
        texto: r.texto ?? '',
        nota: r.nota ?? '',
        de: autor ? autor.de : yo.id,
        nombre: autor ? autor.nombre : yo.nombre,
        color: autor ? autor.color : yo.color,
        cuando: autor ? r.creado : Date.now(),
      });
    },
    // Only the note, and only its author's: the color is whoever made it.
    cambiar(id, cambios) {
      const h = hexDe(id);
      if (!h) return false;
      return 'nota' in cambios ? anotar(datos, h, yo, cambios.nota) : true;
    },
    borrar(id) {
      const h = hexDe(id);
      if (h) borrarMarca(datos, h);
      return true;
    },
    senalar(n) {
      if (!Number.isInteger(n) || n < 1 || n > MAX_PAGINA || senales() >= MAX_SENALADORES) return false;
      datos.set(`s:${n}`, { cuando: Date.now(), de: yo.id });
      return true;
    },
    sacar(n) {
      if (!datos.has(`s:${n}`)) return false;
      datos.delete(`s:${n}`);
      return true;
    },
    nombrar(n, nombre) {
      const v = datos.get(`s:${n}`);
      if (!v || typeof v !== 'object') return false;
      datos.set(`s:${n}`, { ...v, nombre: nombreDeSenalador(nombre) });
      return true;
    },
  };
}
