// supercvg-disenos: lo que llega de la página y lo que se le pasa a la base, sin red ni base (se prueba con vitest).
// Lo que llega es público: cualquier campo puede faltar, venir con otro tipo o ser enorme. Un diseño es un código de
// estilo de Super CVG (src/lib/codigoDeEstilo.js), un nombre y una descripción corta. Todo es texto: nada de HTML.

export const MAX_CUERPO = 4 * 1024;
export const MAX_NOMBRE = 40;
export const MAX_DESCRIPCION = 160;
export const MAX_COMENTARIO = 500;
export const MAX_BUSCAR = 40;
export const POR_PAGINA = 24;

export type Motivo =
  | 'origen' | 'metodo' | 'grande' | 'invalido' | 'seguido' | 'llave' | 'bloqueada' | 'tope' | 'repetido' | 'no-existe' | 'propio' | 'error';
export const ESTADO: Record<Motivo, number> = {
  origen: 403,
  metodo: 405,
  grande: 413,
  invalido: 400,
  seguido: 429,
  llave: 401,
  bloqueada: 403,
  tope: 429,
  repetido: 409,
  'no-existe': 404,
  propio: 400,
  error: 502,
};

// Lo que la base contesta en `resultado` y lo que la función responde.
const DE_LA_BASE: Record<string, Motivo> = {
  llave: 'llave',
  bloqueada: 'bloqueada',
  tope: 'tope',
  seguido: 'seguido',
  repetido: 'repetido',
  'no-existe': 'no-existe',
  propio: 'propio',
  invalido: 'invalido',
};

// Las acciones: las que leen no piden llave (con ella, marcan lo propio y el voto de cada uno); las otras, sí.
export const LEEN = new Set(['lista', 'comentarios']);
export const ESCRIBEN = new Set(['publicar', 'editar', 'borrar', 'votar', 'comentar', 'borrar-comentario', 'denunciar']);

export const LLAVE = /^[A-Za-z0-9_-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// El texto como lo guarda la base: un solo tipo de salto de línea, sin caracteres de control ni espacios alrededor.
// `<` y `>` no pasan: así nada que llegue se puede leer como HTML, aunque la página igual lo muestra como texto.
export function limpiarTexto(v: unknown, { renglones = false } = {}): string {
  if (typeof v !== 'string') return '';
  let t = v.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  t = renglones ? t.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n') : t.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return t.replace(/[ \t]{2,}/g, ' ').trim();
}
export const largo = (t: string) => [...t].length;
export const conHtml = (t: string) => /[<>]/.test(t);

// El código de estilo, como lo arma la página: «CVG-» y grupos de cinco, en base 32 de Crockford, con un último
// carácter que controla el resto (el mismo cálculo que codigoDeEstilo.js). Acá solo se mira la forma: qué dice lo
// lee la página de cada uno, que descarta lo que no entiende.
const ABC = '0123456789abcdefghjkmnpqrstvwxyz';
const PESOS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
const control = (texto: string) => ABC[[...texto].reduce((t, c, i) => t + ABC.indexOf(c) * PESOS[i % PESOS.length] + 3, 0) % 32];
export function codigoValido(escrito: unknown): string | null {
  if (typeof escrito !== 'string' || escrito.length > 200) return null;
  let t = escrito.toLowerCase().replace(/[\s-]/g, '');
  if (!t.startsWith('cvg')) return null;
  t = t.slice(3).replace(/o/g, '0').replace(/[il]/g, '1');
  if (t.length < 20 || t.length > 120 || !/^[1-9]/.test(t) || ![...t].every((c) => ABC.includes(c))) return null;
  if (control(t.slice(0, -1)) !== t.at(-1)) return null;
  return `CVG-${t.toUpperCase().match(/.{1,5}/g)!.join('-')}`;
}

export type Pedido =
  | { a: 'lista'; orden: 'mejores' | 'nuevos'; buscar: string; desde: number }
  | { a: 'comentarios'; id: string }
  | { a: 'publicar'; nombre: string; descripcion: string; codigo: string }
  | { a: 'editar'; id: string; nombre: string; descripcion: string; codigo: string }
  | { a: 'borrar'; id: string }
  | { a: 'votar'; id: string; estrellas: number }
  | { a: 'comentar'; id: string; texto: string }
  | { a: 'borrar-comentario'; id: string }
  | { a: 'denunciar'; tipo: 'diseno' | 'comentario'; id: string };

const id = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

// Publicar y editar llevan lo mismo: nombre, descripción y código, con los mismos topes.
function disenoDe(cuerpo: Record<string, unknown>): { nombre: string; descripcion: string; codigo: string } | null {
  const nombre = limpiarTexto(cuerpo.nombre);
  const descripcion = limpiarTexto(cuerpo.descripcion ?? '');
  const codigo = codigoValido(cuerpo.codigo);
  if (!nombre || largo(nombre) > MAX_NOMBRE || largo(descripcion) > MAX_DESCRIPCION || conHtml(nombre + descripcion) || !codigo) return null;
  return { nombre, descripcion, codigo };
}

/** Lo único que se lee del cuerpo, según la acción. */
export function validar(cuerpo: Record<string, unknown>): Pedido | { motivo: Motivo } {
  const no = { motivo: 'invalido' as const };
  switch (cuerpo.a) {
    case 'lista': {
      const orden = cuerpo.orden === 'nuevos' ? 'nuevos' : cuerpo.orden === 'mejores' || cuerpo.orden === undefined ? 'mejores' : null;
      const buscar = cuerpo.buscar === undefined ? '' : limpiarTexto(cuerpo.buscar);
      const desde = cuerpo.desde === undefined ? 0 : cuerpo.desde;
      if (!orden || largo(buscar) > MAX_BUSCAR || !Number.isSafeInteger(desde) || (desde as number) < 0 || (desde as number) > 10_000) return no;
      return { a: 'lista', orden, buscar, desde: desde as number };
    }
    case 'comentarios':
    case 'borrar':
    case 'borrar-comentario': {
      const v = id(cuerpo.id);
      return v ? { a: cuerpo.a, id: v } : no;
    }
    case 'publicar': {
      const d = disenoDe(cuerpo);
      return d ? { a: 'publicar', ...d } : no;
    }
    case 'editar': {
      const v = id(cuerpo.id);
      const d = disenoDe(cuerpo);
      return v && d ? { a: 'editar', id: v, ...d } : no;
    }
    case 'votar': {
      const v = id(cuerpo.id);
      const e = cuerpo.estrellas;
      return v && Number.isInteger(e) && (e as number) >= 1 && (e as number) <= 5 ? { a: 'votar', id: v, estrellas: e as number } : no;
    }
    case 'comentar': {
      const v = id(cuerpo.id);
      const texto = limpiarTexto(cuerpo.texto, { renglones: true });
      return v && texto && largo(texto) <= MAX_COMENTARIO && !conHtml(texto) ? { a: 'comentar', id: v, texto } : no;
    }
    case 'denunciar': {
      const v = id(cuerpo.id);
      const tipo = cuerpo.tipo === 'diseno' || cuerpo.tipo === 'comentario' ? cuerpo.tipo : null;
      return v && tipo ? { a: 'denunciar', tipo, id: v } : no;
    }
    default:
      return no;
  }
}

/** La función de la base y sus argumentos para un pedido. `llave` e `ip`: los hash, o null. */
export function llamadaDe(p: Pedido, llave: string | null, ip: string | null): { nombre: string; args: Record<string, unknown> } {
  switch (p.a) {
    case 'lista':
      return { nombre: 'supercvg_disenos_lista', args: { p_llave_hash: llave, p_orden: p.orden, p_buscar: p.buscar, p_desde: p.desde } };
    case 'comentarios':
      return { nombre: 'supercvg_disenos_comentarios', args: { p_llave_hash: llave, p_diseno: p.id } };
    case 'publicar':
      return { nombre: 'supercvg_disenos_publicar', args: { p_llave_hash: llave, p_ip_hash: ip, p_nombre: p.nombre, p_descripcion: p.descripcion, p_codigo: p.codigo } };
    case 'editar':
      return { nombre: 'supercvg_disenos_editar', args: { p_llave_hash: llave, p_ip_hash: ip, p_diseno: p.id, p_nombre: p.nombre, p_descripcion: p.descripcion, p_codigo: p.codigo } };
    case 'borrar':
      return { nombre: 'supercvg_disenos_borrar', args: { p_llave_hash: llave, p_diseno: p.id } };
    case 'votar':
      return { nombre: 'supercvg_disenos_votar', args: { p_llave_hash: llave, p_ip_hash: ip, p_diseno: p.id, p_estrellas: p.estrellas } };
    case 'comentar':
      return { nombre: 'supercvg_disenos_comentar', args: { p_llave_hash: llave, p_ip_hash: ip, p_diseno: p.id, p_texto: p.texto } };
    case 'borrar-comentario':
      return { nombre: 'supercvg_disenos_borrar_comentario', args: { p_llave_hash: llave, p_comentario: p.id } };
    case 'denunciar':
      return { nombre: 'supercvg_disenos_denunciar', args: { p_llave_hash: llave, p_ip_hash: ip, p_tipo: p.tipo, p_objeto: p.id } };
  }
}

/** Lo que contestó la base, para la página: { ok: true, ...datos } o el motivo. Sin `resultado: 'ok'`, error. */
export function leerResultado(datos: unknown): { ok: true; datos: Record<string, unknown> } | { motivo: Motivo } {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return { motivo: 'error' };
  const { resultado, ...resto } = datos as Record<string, unknown>;
  if (resultado === 'ok') return { ok: true, datos: resto };
  return { motivo: (typeof resultado === 'string' && DE_LA_BASE[resultado]) || 'error' };
}

/** La huella de una conexión para el freno de la base: sha256 de la sal de la función, el día y la IP. Sin la sal no
 * se puede volver a la IP, y cambia cada día, así que no sirve para seguir a nadie. Sin sal o sin IP, null. */
export async function huellaDeConexion(sal: string | undefined, ip: string | null, dia: string): Promise<string | null> {
  if (!sal || sal.length < 16 || !ip) return null;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sal}|${dia}|${ip}`)));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}
