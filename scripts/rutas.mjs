// Las páginas públicas: las fijas de sitio.config.js más las que salen de la base (`dinamicas`), como cada producto.
// La build le arma a cada una su HTML, y el sitemap las lista.
import { loadEnv } from 'vite';
import { SITIO } from '../sitio.config.js';

// La ruta viene de la base y se vuelve una carpeta en dist: solo minúsculas, números, guiones y barras. Nada de ../.
const RUTA_VALIDA = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

/** Saca las rutas inválidas o repetidas. Una fija gana sobre una de la base con la misma ruta. */
export function filtrarRutas(fijas, dinamicas) {
  const vistas = new Set(fijas.map((p) => p.ruta));
  const validas = [];
  for (const p of dinamicas) {
    if (!p?.titulo || typeof p.ruta !== 'string' || !RUTA_VALIDA.test(p.ruta) || vistas.has(p.ruta)) continue;
    vistas.add(p.ruta);
    validas.push({ ...p, descripcion: p.descripcion || SITIO.descripcion });
  }
  return [...fijas, ...validas];
}

/** Sin base configurada (desarrollo, capturas) no suma nada. Si la base falla, en el deploy frena: publicaría un sitio
 * sin sus productos. En la PC avisa y sigue. */
export async function rutasPublicas({ raiz = process.cwd(), modo = 'production' } = {}) {
  if (!SITIO.dinamicas) return SITIO.publicas;
  const env = { ...loadEnv(modo, raiz, 'VITE_'), ...process.env };
  const url = env.VITE_SUPABASE_URL;
  const clave = env.VITE_SUPABASE_KEY;
  const consultar = async (consulta) => {
    if (!url || !clave) return [];
    const r = await fetch(`${url}/rest/v1/${consulta}`, { headers: { apikey: clave } });
    if (!r.ok) throw new Error(`la base respondió ${r.status} a ${consulta}`);
    return r.json();
  };
  try {
    return filtrarRutas(SITIO.publicas, await SITIO.dinamicas(consultar));
  } catch (e) {
    if (process.env.CI) throw e;
    console.warn(`aviso  no pude traer las páginas de la base: ${e.message}`);
    return SITIO.publicas;
  }
}
