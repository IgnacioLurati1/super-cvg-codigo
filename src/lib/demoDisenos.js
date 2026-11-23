// Diseños en `npm run dev` (también con /?demo=1): contesta como la función supercvg-disenos, con diseños de ejemplo y
// en memoria, así ninguno de prueba llega a la base. Valida con las mismas reglas que la función (reglas.ts). Producción
// no lo trae: disenos.js lo pide solo en desarrollo.
//   Sin llave, lee. Con la de ejemplo de Resúmenes (vincularDemo), la cuenta es «santi»; con cualquier otra, «vos».
import { codigoDeEstilo } from './codigoDeEstilo';
import { normalizar } from './ajustes';
import { sanearMio } from './mio';
import { ESCRIBEN, POR_PAGINA, validar } from '../../supabase/functions/supercvg-disenos/reglas.ts';

const LLAVE_DEMO = 'demo-de-super-cvg-0000';
const ESPERA_MS = import.meta.env.MODE === 'test' ? 0 : 350;
const hace = (dias, horas = 0) => new Date(Date.now() - (dias * 24 + horas) * 3_600_000).toISOString();
let siguiente = 1;
const nuevoId = () => `d15e0000-0000-4000-8000-${String(siguiente++).padStart(12, '0')}`;
const mio = sanearMio({});

const EJEMPLOS = [
  { nombre: 'Noche cósmica', descripcion: 'Violeta con estrellas de fondo. Para estudiar de noche sin quemarte los ojos.', autor: 'meli', dias: 2,
    ajustes: { tema: 'cosmico', potente: true, menu: { estilo: 'pastillas' } }, votos: [5, 5, 4, 5, 4, 5] },
  { nombre: 'Hoja de carpeta', descripcion: 'Renglones, margen rojo y letra grande. Como la carpeta de primer año.', autor: 'tomi_utn', dias: 9,
    ajustes: { estilo: 'hoja', letra: 'grande', resaltador: '#b6f36b' }, votos: [4, 5, 4, 4] },
  { nombre: 'Plano de Civil', descripcion: 'Cuadrícula azul y el menú a la izquierda.', autor: 'juli', dias: 5,
    ajustes: { estilo: 'plano', tema: 'oscuro', menu: { posicion: 'izquierda', estilo: 'iconos' } }, votos: [5, 4, 3] },
  { nombre: 'Batiseñal', descripcion: '', autor: 'fran', dias: 1,
    ajustes: { estilo: 'batman', menu: { estilo: 'solo-iconos' } }, votos: [3, 4] },
  { nombre: 'Pizarrón del aula 1', descripcion: 'Tiza sobre verde. Con el resaltador celeste.', autor: 'cami', dias: 14,
    ajustes: { estilo: 'pizarron', tema: 'oscuro', resaltador: '#8fe3ff' }, votos: [4, 4, 5, 3, 4] },
  { nombre: 'Bosque tranquilo', descripcion: 'Verde oscuro y luciérnagas.', autor: 'agus', dias: 0, horas: 3,
    ajustes: { tema: 'bosque', potente: true, contraste: 'alto' }, votos: [] },
  { nombre: 'Café de biblioteca', descripcion: 'Tonos marrones, letra cómoda y PDF en sepia.', autor: 'meli', dias: 20,
    ajustes: { tema: 'cafe', pdf: 'sepia', menu: { estilo: 'iconos' } }, votos: [4, 3, 4] },
  { nombre: 'Glaciar profesional', descripcion: 'Degradados fríos para la semana de parciales.', autor: 'tomi_utn', dias: 3,
    ajustes: { estilo: 'profesional', tema: 'glaciar', accion: '#0b5a9e' }, votos: [5, 4] },
];

const COMENTARIOS = {
  'Noche cósmica': [['tomi_utn', 'Lo uso todas las noches. Las estrellas no distraen.', 1], ['juli', 'Con el resaltador lima queda mejor todavía.', 0]],
  'Hoja de carpeta': [['fran', 'Me hace acordar a Análisis I.', 4]],
};

let estado = null;
function armar() {
  const disenos = EJEMPLOS.map((e) => ({
    id: nuevoId(),
    nombre: e.nombre,
    descripcion: e.descripcion,
    codigo: codigoDeEstilo(normalizar(e.ajustes), mio),
    autor: e.autor,
    creado: hace(e.dias, e.horas ?? 0),
    votos: Object.fromEntries(e.votos.map((v, i) => [`otro-${i}`, v])),
    comentarios: (COMENTARIOS[e.nombre] ?? []).map(([autor, texto, dias]) => ({ id: nuevoId(), autor, texto, creado: hace(dias, 2) })),
    denuncias: new Set(),
  }));
  return { disenos };
}

const quien = (llave) => (!llave ? null : llave === LLAVE_DEMO ? 'santi' : 'vos');
const promedio = (d) => {
  const v = Object.values(d.votos);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};
const puntaje = (d) => {
  const v = Object.values(d.votos);
  return (v.reduce((a, b) => a + b, 0) + 9) / (v.length + 3);
};
const fila = (d, yo) => ({
  id: d.id, nombre: d.nombre, descripcion: d.descripcion, codigo: d.codigo, autor: d.autor,
  estrellas: promedio(d), votos: Object.keys(d.votos).length, comentarios: d.comentarios.length, creado: d.creado,
  mio: d.autor === yo, oculto: false, mi_voto: yo ? d.votos[yo] ?? null : null,
});

function atender(p, yo) {
  const { disenos } = estado;
  const diseno = (id) => disenos.find((d) => d.id === id);
  switch (p.a) {
    case 'lista': {
      const b = p.buscar.toLowerCase();
      const lista = disenos
        .filter((d) => !b || d.nombre.toLowerCase().includes(b))
        .sort((x, y) => (p.orden === 'mejores' ? puntaje(y) - puntaje(x) : 0) || y.creado.localeCompare(x.creado));
      return { ok: true, disenos: lista.slice(p.desde, p.desde + POR_PAGINA).map((d) => fila(d, yo)), mas: lista.length > p.desde + POR_PAGINA };
    }
    case 'comentarios': {
      const d = diseno(p.id);
      if (!d) return { ok: false, motivo: 'no-existe' };
      return { ok: true, comentarios: d.comentarios.map((c) => ({ ...c, mio: c.autor === yo })) };
    }
    case 'publicar': {
      const propios = disenos.filter((d) => d.autor === yo);
      if (propios.some((d) => d.codigo === p.codigo)) return { ok: false, motivo: 'repetido' };
      if (propios.length >= 20) return { ok: false, motivo: 'tope' };
      const d = { id: nuevoId(), nombre: p.nombre, descripcion: p.descripcion, codigo: p.codigo, autor: yo, creado: new Date().toISOString(), votos: {}, comentarios: [], denuncias: new Set() };
      disenos.unshift(d);
      return { ok: true, id: d.id };
    }
    case 'borrar': {
      const i = disenos.findIndex((d) => d.id === p.id && d.autor === yo);
      if (i < 0) return { ok: false, motivo: 'no-existe' };
      disenos.splice(i, 1);
      return { ok: true };
    }
    case 'votar': {
      const d = diseno(p.id);
      if (!d) return { ok: false, motivo: 'no-existe' };
      if (d.autor === yo) return { ok: false, motivo: 'propio' };
      d.votos[yo] = p.estrellas;
      return { ok: true, estrellas: promedio(d), votos: Object.keys(d.votos).length, mi_voto: p.estrellas };
    }
    case 'comentar': {
      const d = diseno(p.id);
      if (!d) return { ok: false, motivo: 'no-existe' };
      const c = { id: nuevoId(), autor: yo, texto: p.texto, creado: new Date().toISOString() };
      d.comentarios.push(c);
      return { ok: true, comentario: { ...c, mio: true } };
    }
    case 'borrar-comentario': {
      for (const d of disenos) {
        const i = d.comentarios.findIndex((c) => c.id === p.id && c.autor === yo);
        if (i >= 0) {
          d.comentarios.splice(i, 1);
          return { ok: true };
        }
      }
      return { ok: false, motivo: 'no-existe' };
    }
    case 'denunciar': {
      const d = p.tipo === 'diseno' ? diseno(p.id) : disenos.find((x) => x.comentarios.some((c) => c.id === p.id));
      if (!d) return { ok: false, motivo: 'no-existe' };
      const autor = p.tipo === 'diseno' ? d.autor : d.comentarios.find((c) => c.id === p.id).autor;
      if (autor === yo) return { ok: false, motivo: 'propio' };
      return { ok: true };
    }
    default:
      return { ok: false, motivo: 'invalido' };
  }
}

// To look at the other states by hand: sessionStorage 'cl.demo.disenos' = 'caido' (the service doesn't answer) or
// 'vacio' (nobody published yet). Only here, in development.
const modoDeMuestra = () => {
  try {
    return sessionStorage.getItem('cl.demo.disenos');
  } catch {
    return null;
  }
};

/** Contesta un pedido de disenos.js como la función. */
export async function responderDisenos(cuerpo, llave) {
  await new Promise((listo) => setTimeout(listo, ESPERA_MS));
  const modo = modoDeMuestra();
  if (modo === 'caido') return { ok: false, motivo: 'red' };
  if (modo === 'vacio' && cuerpo?.a === 'lista') return { ok: true, disenos: [], mas: false };
  estado ??= armar();
  const p = validar(cuerpo && typeof cuerpo === 'object' ? cuerpo : {});
  if ('motivo' in p) return { ok: false, motivo: p.motivo };
  const yo = quien(llave);
  if (ESCRIBEN.has(p.a) && !yo) return { ok: false, motivo: 'llave' };
  // Lo que vuelve viaja como JSON, igual que de la función.
  return JSON.parse(JSON.stringify(atender(p, yo)));
}

/** Para las pruebas: vuelve a los ejemplos. */
export const reiniciarDemoDisenos = () => {
  estado = null;
};
