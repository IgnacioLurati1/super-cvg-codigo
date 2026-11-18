import { describe, expect, it, vi } from 'vitest';
import {
  CARPETA_ADJUNTOS, clienteAdjuntos, descartarAdjunto, ETIQUETA_ADJUNTO, largoDelAdjunto, leerAdjunto, linkDeArchivo, prepararAdjunto, problemaDeArchivo,
  sanearNombre, textoConAdjunto, TOPE_ADJUNTO, TROZO,
} from './adjuntos';
import { leerBloques } from './bloquesCampus';
import { mensaje } from './mensajes';
import { linkTemporal } from './temporales';

const PERMISO = 'ya29.permiso-de-prueba';
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const OTRO = '1ZyXwVuTsRqPoNmLkJiHgFeDcBa987654';
const LINK = `https://drive.google.com/file/d/${ID}/view?usp=sharing`;
// What the campus keeps of a message written with no format, like the flows simulate it.
const delCampus = (texto) => `<p>${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')}</p>`;
const leer = (html) => leerAdjunto(leerBloques(html));
const archivoDe = (bytes, nombre = 'apunte.pdf', type = 'application/pdf') => new File([new Uint8Array(bytes).map((_, i) => i % 251)], nombre, { type });
// jsdom's Blob has no arrayBuffer(): its bytes, the old way.
const leerBytes = (blob) => new Promise((ok, mal) => {
  const lector = new FileReader();
  lector.onload = () => ok(new Uint8Array(lector.result));
  lector.onerror = () => mal(lector.error);
  lector.readAsArrayBuffer(blob);
});

describe('el nombre del archivo', () => {
  it('saca lo que esconde o da vuelta letras, los saltos, el HTML y las barras', () => {
    expect(sanearNombre('factura\u202Efdp.exe')).toBe('facturafdp.exe');
    expect(sanearNombre('a\u200Bb\u2066c\u2069.pdf\u200E')).toBe('abc.pdf');
    expect(sanearNombre('TP\t2.pdf')).toBe('TP 2.pdf');
    expect(sanearNombre('TP 2\nArchivo adjunto: otro.pdf')).toBe('TP 2 Archivo adjunto: otro.pdf');
    expect(sanearNombre('<b>Resumen</b>.pdf')).toBe('bResumen-b.pdf');
    expect(sanearNombre('../../etc/passwd')).toBe('..-..-etc-passwd');
    expect(sanearNombre('  Clase 3:   procesos.pdf  ')).toBe('Clase 3: procesos.pdf');
    expect(sanearNombre('Café.pdf')).toBe('Café.pdf');
  });

  it('nunca queda vacío, y uno largo se corta guardando su final', () => {
    expect(sanearNombre('')).toBe('archivo');
    expect(sanearNombre('\u202E\u200B')).toBe('archivo');
    expect(sanearNombre('...')).toBe('archivo');
    const largo = sanearNombre(`${'resumen '.repeat(30)}final.docx`);
    expect([...largo]).toHaveLength(100);
    expect(largo.endsWith('.docx')).toBe(true);
  });
});

describe('qué archivo puede ir', () => {
  it('hasta 25 MB y con algo adentro', () => {
    expect(problemaDeArchivo({ size: 1 })).toBe('');
    expect(problemaDeArchivo({ size: TOPE_ADJUNTO })).toBe('');
    expect(problemaDeArchivo({ size: TOPE_ADJUNTO + 1 })).toBe('Ese archivo pesa 25,0 MB. El tope es de 25 MB.');
    expect(problemaDeArchivo({ size: 31.4 * 1024 * 1024 })).toBe('Ese archivo pesa 31,4 MB. El tope es de 25 MB.');
    expect(problemaDeArchivo({ size: 0 })).toBe('Ese archivo está vacío. Elegí otro.');
  });
});

describe('el texto del mensaje', () => {
  it('lo escrito, una línea en blanco y las dos líneas del archivo', () => {
    expect(textoConAdjunto('  Te paso el TP.  ', { nombre: 'TP 2.pdf', bytes: 2.4 * 1024 * 1024, id: ID }))
      .toBe(`Te paso el TP.\n\nArchivo adjunto: TP 2.pdf (2,4 MB)\n${LINK}`);
    expect(textoConAdjunto('', { nombre: 'foto.jpg', bytes: 340 * 1024, id: ID })).toBe(`Archivo adjunto: foto.jpg (340 KB)\n${LINK}`);
  });

  it('con el nombre limpio y solo con un número de Drive válido', () => {
    expect(textoConAdjunto('', { nombre: 'a\nb<i>.pdf', bytes: 1024, id: ID })).toBe(`Archivo adjunto: a bi.pdf (1 KB)\n${LINK}`);
    expect(() => textoConAdjunto('hola', { nombre: 'x.pdf', bytes: 1, id: 'corto' })).toThrow();
    expect(() => textoConAdjunto('hola', { nombre: 'x.pdf', bytes: 1, id: `${ID}/../otro` })).toThrow();
  });

  it('cuenta lo que suman las dos líneas, con lugar para el número más largo', () => {
    const texto = textoConAdjunto('hola', { nombre: 'Clase 1.pdf', bytes: 5000, id: ID });
    expect(new TextEncoder().encode(texto).length - 4).toBeLessThanOrEqual(largoDelAdjunto('Clase 1.pdf', 5000));
  });
});

describe('un archivo que llega en un mensaje', () => {
  it('lo reconoce como lo arma Super CVG, con lo escrito aparte', () => {
    const r = leer(delCampus(textoConAdjunto('Te paso el TP.\nCualquier cosa avisame.', { nombre: 'TP 2.pdf', bytes: 2.4 * 1024 * 1024, id: ID })));
    expect(r.adjunto).toEqual({ id: ID, nombre: 'TP 2.pdf', peso: '2,4 MB', url: LINK });
    expect(r.bloques).toEqual([{ tipo: 'parrafo', lineas: [[{ tipo: 'texto', texto: 'Te paso el TP.' }], [{ tipo: 'texto', texto: 'Cualquier cosa avisame.' }]] }]);
  });

  it('solo el archivo, sin nada escrito, y sin el peso', () => {
    const r = leer(delCampus(`Archivo adjunto: Guía 3.pdf\nhttps://drive.google.com/file/d/${ID}/view`));
    expect(r).toEqual({ adjunto: { id: ID, nombre: 'Guía 3.pdf', peso: '', url: LINK }, bloques: [] });
  });

  it('también cuando el campus hace link la dirección, o pone cada línea en su párrafo', () => {
    const conLink = leer(`<p>Va<br>Archivo adjunto: TP.pdf (12 KB)<br><a href="${LINK}" class="_blanktarget">${LINK}</a></p>`);
    expect(conLink.adjunto).toMatchObject({ id: ID, nombre: 'TP.pdf', peso: '12 KB' });
    const enDos = leer(`<p>Archivo adjunto: TP.pdf (12 KB)</p><p>https://drive.google.com/file/d/${ID}/view?usp=drive_link</p>`);
    expect(enDos).toEqual({ adjunto: { id: ID, nombre: 'TP.pdf', peso: '12 KB', url: LINK }, bloques: [] });
  });

  it('el nombre de otro llega limpio', () => {
    const r = leer(delCampus(`Archivo adjunto: factura\u202Efdp.exe (3 KB)\n${LINK}`));
    expect(r.adjunto.nombre).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
    expect(leer(delCampus(`Archivo adjunto: <img src=x onerror=alert(1)>.pdf\n${LINK}`)).adjunto.nombre).toBe('img src=x onerror=alert(1).pdf');
  });

  it('un link que no es exactamente el de un archivo de Drive queda como texto', () => {
    const falsos = [
      `https://drive.google.com.otro.example/file/d/${ID}/view`,
      `https://otro.example/drive.google.com/file/d/${ID}/view`,
      `https://drive.google.com@otro.example/file/d/${ID}/view`,
      `http://drive.google.com/file/d/${ID}/view`,
      `https://drive.google.com/file/d/${ID}/edit`,
      `https://drive.google.com/file/d/${ID}/view?usp=sharing&continue=https://otro.example`,
      `https://drive.google.com/file/d/${ID}/view#otro`,
      `https://drive.google.com/file/d/${ID}/view/../../uc?export=download`,
      `https://drive.google.com/open?id=${ID}`,
      `https://docs.google.com/document/d/${ID}/edit`,
      `https://DRIVE.GOOGLE.COM/file/d/${ID}/view`,
      'https://drive.google.com/file/d/corto/view',
      `https://drive.google.com/file/d/${ID.slice(0, 10)}%2F${ID}/view`,
      `https://drive.google.com/file/d/${ID}/view mirá esto`,
    ];
    for (const link of falsos) expect(leer(delCampus(`Archivo adjunto: TP.pdf (2 KB)\n${link}`)), link).toBeNull();
  });

  it('un link disfrazado: dice Drive y lleva a otro lado, o a otro archivo', () => {
    expect(leer(`<p>Archivo adjunto: TP.pdf<br><a href="https://otro.example/robar">${LINK}</a></p>`)).toBeNull();
    expect(leer(`<p>Archivo adjunto: TP.pdf<br><a href="${linkDeArchivo(OTRO)}">${LINK}</a></p>`)).toBeNull();
    expect(leer(`<p>Archivo adjunto: TP.pdf<br><a href="${LINK}">el apunte</a></p>`)).toBeNull();
    expect(leer(`<p>Archivo adjunto: TP.pdf<br><strong>${LINK}</strong></p>`)).toBeNull();
    expect(leer(`<p>Archivo adjunto: TP.pdf<br>${LINK} <a href="https://otro.example">y acá</a></p>`)).toBeNull();
  });

  it('roto o fuera de lugar: sin el renglón de arriba, sin nombre, en otro orden o con algo después', () => {
    expect(leer(delCampus(LINK))).toBeNull();
    expect(leer(delCampus(`Archivo adjunto:\n${LINK}`))).toBeNull();
    expect(leer(delCampus(`Archivo adjunto: (2 KB)\n${LINK}`))).toMatchObject({ adjunto: { nombre: '(2 KB)' } });
    expect(leer(delCampus(`archivo adjunto: TP.pdf\n${LINK}`))).toBeNull();
    expect(leer(delCampus(`Adjunto: TP.pdf\n${LINK}`))).toBeNull();
    expect(leer(delCampus(`${LINK}\nArchivo adjunto: TP.pdf`))).toBeNull();
    expect(leer(delCampus(`Archivo adjunto: TP.pdf\n${LINK}\nY esto también.`))).toBeNull();
    expect(leer(delCampus(`Archivo adjunto: TP.pdf\n\nhttps://drive.google.com/file/d/`))).toBeNull();
    expect(leer(`<ul><li>Archivo adjunto: TP.pdf</li><li>${LINK}</li></ul>`)).toBeNull();
    expect(leer('')).toBeNull();
  });

  it('Mensajes lo muestra aparte, y en la lista dice qué es si no hay nada escrito', () => {
    const conTexto = mensaje({ id: 9, useridfrom: 21, timecreated: 1, text: delCampus(textoConAdjunto('Les dejo la guía.', { nombre: 'Guía.pdf', bytes: 2048, id: ID })) });
    expect(conTexto).toMatchObject({ adjunto: { id: ID, nombre: 'Guía.pdf' }, vista: 'Les dejo la guía.' });
    expect(conTexto.texto).toContain(LINK);
    const solo = mensaje({ id: 10, useridfrom: 21, timecreated: 1, text: delCampus(textoConAdjunto('', { nombre: 'Guía.pdf', bytes: 2048, id: ID })) });
    expect(solo).toMatchObject({ bloques: [], vista: 'Archivo: Guía.pdf' });
    const comun = mensaje({ id: 11, useridfrom: 21, timecreated: 1, text: `<p>Mirá ${LINK}</p>` });
    expect(comun).toMatchObject({ adjunto: null, vista: `Mirá ${LINK}` });
  });
});

// A Google Drive in memory with what this module uses: the folder, both uploads, sharing and deleting. `cortes` cuts the
// connection on those pieces of a resumable upload (counted from 0), once each.
function driveFalso({ carpetas = [], cortes = [] } = {}) {
  const pedidos = [];
  const archivos = new Map();
  const permisos = [];
  const sesiones = new Map();
  const quedan = new Set(cortes);
  let numero = 0;
  let trozo = 0;
  const nuevoId = (letra) => `${letra}${String(++numero).padStart(30, '0')}`;
  const json = (status, cuerpo, headers = {}) => new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const bytes = async (cuerpo) => (cuerpo ? leerBytes(cuerpo) : new Uint8Array());
  const estado = { falla: null };
  for (const id of carpetas) archivos.set(id, { name: CARPETA_ADJUNTOS, mimeType: 'application/vnd.google-apps.folder' });

  async function pedir(url, opciones = {}) {
    const metodo = opciones.method ?? 'GET';
    pedidos.push({ url, metodo, opciones });
    if (opciones.signal?.aborted) throw new DOMException('cortado', 'AbortError');
    if (estado.falla) {
      const f = estado.falla;
      if (f.una) estado.falla = null;
      if (f.red) throw new TypeError('Failed to fetch');
      return json(f.status, f.razon ? { error: { errors: [{ reason: f.razon }] } } : { error: { code: f.status } });
    }
    const u = new URL(url);
    if (u.pathname === '/drive/v3/files' && metodo === 'GET') {
      return json(200, { files: [...archivos].filter(([, f]) => f.mimeType === 'application/vnd.google-apps.folder').map(([id]) => ({ id })) });
    }
    if (u.pathname === '/drive/v3/files' && metodo === 'POST') {
      const id = nuevoId('c');
      archivos.set(id, JSON.parse(opciones.body));
      return json(200, { id });
    }
    if (u.pathname === '/upload/drive/v3/files' && u.searchParams.get('uploadType') === 'multipart') {
      const texto = new TextDecoder('latin1').decode(await bytes(opciones.body));
      const limite = /boundary=(.+)$/.exec(opciones.headers['Content-Type'])[1];
      const [meta, media] = texto.split(`--${limite}`).slice(1, 3).map((p) => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
      const id = nuevoId('a');
      archivos.set(id, { ...JSON.parse(meta), largo: media.length });
      return json(200, { id });
    }
    if (u.pathname === '/upload/drive/v3/files' && u.searchParams.get('uploadType') === 'resumable' && !u.searchParams.has('upload_id')) {
      const sesion = `s${++numero}`;
      sesiones.set(sesion, { meta: JSON.parse(opciones.body), total: Number(opciones.headers['X-Upload-Content-Length']), partes: [] });
      return json(200, {}, { Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${sesion}` });
    }
    if (u.searchParams.has('upload_id') && metodo === 'PUT') {
      const s = sesiones.get(u.searchParams.get('upload_id'));
      if (!s) return json(404, { error: { code: 404 } });
      const tenidos = s.partes.reduce((n, p) => n + p.length, 0);
      const rango = opciones.headers['Content-Range'];
      const terminar = () => {
        const id = nuevoId('a');
        archivos.set(id, { ...s.meta, largo: s.partes.reduce((n, p) => n + p.length, 0), bytes: s.partes });
        s.id = id;
        return json(200, { id });
      };
      if (rango === `bytes */${s.total}`) {
        if (s.id) return json(200, { id: s.id });
        return new Response(null, { status: 308, headers: tenidos ? { Range: `bytes=0-${tenidos - 1}` } : {} });
      }
      const [, desde, hasta] = /^bytes (\d+)-(\d+)\/\d+$/.exec(rango).map(Number);
      const n = trozo++;
      if (quedan.delete(n)) {
        // The cut comes after Google kept half of the piece.
        s.partes.push((await bytes(opciones.body)).slice(0, (hasta - desde + 1) / 2));
        throw new TypeError('Failed to fetch');
      }
      if (desde !== tenidos) return json(400, { error: { code: 400 } });
      s.partes.push(await bytes(opciones.body));
      if (hasta + 1 === s.total) return terminar();
      return new Response(null, { status: 308, headers: { Range: `bytes=0-${hasta}` } });
    }
    const permiso = /^\/drive\/v3\/files\/([^/]+)\/permissions$/.exec(u.pathname);
    if (permiso && metodo === 'POST') {
      permisos.push({ id: permiso[1], ...JSON.parse(opciones.body) });
      return json(200, { id: 'anyoneWithLink' });
    }
    const uno = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (uno && metodo === 'DELETE') return archivos.delete(uno[1]) ? new Response(null, { status: 204 }) : json(404, { error: { code: 404 } });
    return json(404, { error: { code: 404 } });
  }
  return { pedir, pedidos, archivos, permisos, sesiones, estado };
}

const cliente = (drive, extra = {}) => clienteAdjuntos({ token: () => PERMISO, pedir: drive.pedir, esperar: async () => {}, ...extra });

describe('subir y compartir', () => {
  it('usa la carpeta «Super CVG» que ya hizo, o la crea, visible y con una descripción', async () => {
    const conCarpeta = driveFalso({ carpetas: ['1CarpetaDeAntes00000000000000'] });
    expect(await cliente(conCarpeta).carpeta()).toBe('1CarpetaDeAntes00000000000000');
    const q = new URL(conCarpeta.pedidos[0].url).searchParams;
    expect(q.get('q')).toBe("name = 'Super CVG' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    expect(q.get('spaces')).toBe('drive');

    const vacio = driveFalso();
    const id = await cliente(vacio).carpeta();
    expect(vacio.archivos.get(id)).toMatchObject({ name: 'Super CVG', mimeType: 'application/vnd.google-apps.folder' });
    expect(vacio.archivos.get(id).description).toMatch(/Cualquiera con el link/);
    expect(vacio.archivos.get(id).parents).toBeUndefined();
  });

  it('uno chico va en un pedido, con su nombre, a la carpeta, y el permiso solo en la cabecera', async () => {
    const drive = driveFalso();
    const avances = [];
    const id = await cliente(drive).subir(archivoDe(3000), { nombre: 'apunte.pdf', carpeta: '1Carpeta000000000000000000', alAvanzar: (h, t) => avances.push([h, t]) });
    expect(drive.archivos.get(id)).toMatchObject({ name: 'apunte.pdf', parents: ['1Carpeta000000000000000000'], largo: 3000 });
    expect(avances).toEqual([[3000, 3000]]);
    const [p] = drive.pedidos;
    expect(p.url).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
    expect(p.opciones).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${PERMISO}` } });
    expect(drive.pedidos.every((x) => !x.url.includes(PERMISO))).toBe(true);
  });

  it('uno grande va por partes, con su avance, y llega entero', async () => {
    const drive = driveFalso();
    const total = 2 * TROZO + 1234;
    const avances = [];
    const id = await cliente(drive).subir(archivoDe(total), { nombre: 'tp.zip', carpeta: '1Carpeta000000000000000000', alAvanzar: (h) => avances.push(h) });
    expect(drive.archivos.get(id)).toMatchObject({ name: 'tp.zip', parents: ['1Carpeta000000000000000000'], largo: total });
    const inicio = drive.pedidos[0];
    expect(inicio.opciones.headers).toMatchObject({ 'X-Upload-Content-Length': String(total), 'X-Upload-Content-Type': 'application/pdf' });
    expect(drive.pedidos.slice(1).map((p) => p.opciones.headers['Content-Range'])).toEqual([`bytes 0-${TROZO - 1}/${total}`, `bytes ${TROZO}-${2 * TROZO - 1}/${total}`, `bytes ${2 * TROZO}-${total - 1}/${total}`]);
    expect(avances).toEqual([0, TROZO, 2 * TROZO, total]);
    expect(drive.pedidos.every((p) => p.opciones.headers.Authorization === `Bearer ${PERMISO}`)).toBe(true);
  });

  it('si se corta en el medio, pregunta dónde quedó y sigue desde ahí', async () => {
    const drive = driveFalso({ cortes: [1] });
    const total = 3 * TROZO;
    const esperar = vi.fn(async () => {});
    const id = await cliente(drive, { esperar }).subir(archivoDe(total), { nombre: 'tp.zip', carpeta: '1Carpeta000000000000000000' });
    expect(esperar).toHaveBeenCalledTimes(1);
    const rangos = drive.pedidos.slice(1).map((p) => p.opciones.headers['Content-Range']);
    // The second piece was cut after Google kept half: it goes on from the byte after that half.
    expect(rangos).toEqual([`bytes 0-${TROZO - 1}/${total}`, `bytes ${TROZO}-${2 * TROZO - 1}/${total}`, `bytes */${total}`, `bytes ${TROZO * 1.5}-${2.5 * TROZO - 1}/${total}`, `bytes ${2.5 * TROZO}-${total - 1}/${total}`]);
    expect(drive.archivos.get(id).largo).toBe(total);
    const juntos = new Uint8Array(total);
    let n = 0;
    for (const parte of drive.archivos.get(id).bytes) {
      juntos.set(parte, n);
      n += parte.length;
    }
    expect(juntos).toEqual(await leerBytes(archivoDe(total)));
  });

  it('sin conexión un rato largo dice que no hay, y al probar de nuevo sigue la misma subida', async () => {
    const drive = driveFalso();
    const total = 2 * TROZO;
    const archivo = archivoDe(total);
    const sesion = {};
    // After the first piece, nothing gets there.
    const pedir = async (url, o) => {
      const rango = o.headers?.['Content-Range'];
      if (rango && rango !== `bytes 0-${TROZO - 1}/${total}`) throw new TypeError('Failed to fetch');
      return drive.pedir(url, o);
    };
    await expect(cliente(drive, { pedir }).subir(archivo, { nombre: 'a.zip', carpeta: '1Carpeta000000000000000000', sesion })).rejects.toMatchObject({ codigo: 'sin-red', message: 'Sin conexión. Probá de nuevo cuando vuelva.' });
    expect(sesion.lugar).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=resumable&upload_id=/);
    const antes = drive.pedidos.length;
    const id = await cliente(drive).subir(archivo, { nombre: 'a.zip', carpeta: '1Carpeta000000000000000000', sesion });
    expect(drive.pedidos.slice(antes).map((p) => p.opciones.headers['Content-Range'])).toEqual([`bytes */${total}`, `bytes ${TROZO}-${total - 1}/${total}`]);
    expect(drive.archivos.get(id).largo).toBe(total);
    expect(drive.sesiones.size).toBe(1);
  });

  it('comparte con quien tenga el link, solo para ver y sin aparecer en búsquedas', async () => {
    const drive = driveFalso();
    await cliente(drive).compartir(ID);
    expect(drive.permisos).toEqual([{ id: ID, role: 'reader', type: 'anyone', allowFileDiscovery: false }]);
  });

  it('cada error en palabras del sitio', async () => {
    const con = async (falla, fn = (c) => c.carpeta()) => {
      const drive = driveFalso();
      drive.estado.falla = falla;
      return fn(cliente(drive)).then(() => null, (e) => [e.codigo, e.message]);
    };
    expect(await con({ status: 401 })).toEqual(['vencida', 'Se cortó la conexión con Google. Probá de nuevo.']);
    expect(await con({ status: 403, razon: 'storageQuotaExceeded' }, (c) => c.subir(archivoDe(10), { nombre: 'a', carpeta: 'x' }))).toEqual(['lleno', 'Tu Google Drive está lleno. Hacé lugar y probá de nuevo.']);
    expect(await con({ status: 403, razon: 'userRateLimitExceeded' })).toEqual(['ocupado', 'Google está ocupado. Probá de nuevo en un rato.']);
    expect(await con({ status: 429 })).toEqual(['ocupado', 'Google está ocupado. Probá de nuevo en un rato.']);
    expect(await con({ status: 403, razon: 'insufficientPermissions' })).toEqual(['sin-permiso', 'Google no dio permiso para subir el archivo a tu Drive. Probá de nuevo y dejá marcada esa opción.']);
    expect(await con({ status: 403, razon: 'shareOutNotPermitted' }, (c) => c.compartir(ID))).toEqual(['sin-compartir', 'Tu cuenta de Google no deja compartir archivos con link. Probá con otra cuenta.']);
    expect(await con({ status: 500 })).toEqual(['caido', 'Google Drive no responde ahora. Probá de nuevo en un rato.']);
    expect(await con({ red: true })).toEqual(['sin-red', 'Sin conexión. Probá de nuevo cuando vuelva.']);
    const sinPermiso = clienteAdjuntos({ token: () => null, pedir: driveFalso().pedir });
    await expect(sinPermiso.carpeta()).rejects.toMatchObject({ codigo: 'vencida' });
  });

  it('una respuesta sin un número de archivo válido no se toma', async () => {
    const pedir = async () => new Response(JSON.stringify({ files: [{ id: '../../otro' }] }), { status: 200 });
    const creada = async (url, o) => (o.method === 'POST' ? new Response(JSON.stringify({ id: 'x' }), { status: 200 }) : pedir());
    await expect(clienteAdjuntos({ token: () => PERMISO, pedir: creada }).carpeta()).rejects.toMatchObject({ codigo: 'caido' });
  });
});

describe('preparar el archivo de un mensaje', () => {
  it('sube, comparte y da el link', async () => {
    const drive = driveFalso();
    const pasos = [];
    const listo = await prepararAdjunto(archivoDe(4000, 'TP\u202E 2.pdf'), { cliente: cliente(drive), alAvanzar: (p) => pasos.push(p.paso) });
    expect(listo).toEqual({ id: listo.id, nombre: 'TP 2.pdf', bytes: 4000, url: linkDeArchivo(listo.id) });
    expect(drive.permisos.map((p) => p.id)).toEqual([listo.id]);
    expect(pasos).toEqual(['subiendo', 'compartiendo']);
    expect(textoConAdjunto('', listo).startsWith(`${ETIQUETA_ADJUNTO}TP 2.pdf (4 KB)\n`)).toBe(true);
  });

  it('si no pudo compartir, al probar de nuevo solo comparte', async () => {
    const drive = driveFalso();
    const c = cliente(drive);
    const estado = {};
    const compartir = vi.spyOn(c, 'compartir').mockRejectedValueOnce(Object.assign(new Error('x'), { codigo: 'caido' }));
    await expect(prepararAdjunto(archivoDe(100), { cliente: c, estado })).rejects.toMatchObject({ codigo: 'caido' });
    expect(estado.id).toBeTruthy();
    const subidas = drive.pedidos.filter((p) => p.url.includes('/upload/')).length;
    await prepararAdjunto(archivoDe(100), { cliente: c, estado });
    expect(drive.pedidos.filter((p) => p.url.includes('/upload/')).length).toBe(subidas);
    expect(compartir).toHaveBeenCalledTimes(2);
    expect(estado.compartido).toBe(true);
  });

  it('cancelado, o en una cuenta que no deja compartir, no queda nada en el Drive', async () => {
    const drive = driveFalso();
    const control = new AbortController();
    const c = cliente(drive);
    vi.spyOn(c, 'compartir').mockImplementationOnce(async () => {
      control.abort();
      throw Object.assign(new Error('x'), { codigo: 'cancelada' });
    });
    const estado = {};
    await expect(prepararAdjunto(archivoDe(100), { cliente: c, estado, senal: control.signal })).rejects.toMatchObject({ codigo: 'cancelada', message: 'Cancelaste el envío.' });
    expect([...drive.archivos.values()].filter((f) => f.name === 'apunte.pdf')).toEqual([]);
    expect(estado).toMatchObject({ id: null, compartido: false });

    const ajena = driveFalso();
    const c2 = cliente(ajena);
    vi.spyOn(c2, 'compartir').mockRejectedValueOnce(Object.assign(new Error('x'), { codigo: 'sin-compartir' }));
    await expect(prepararAdjunto(archivoDe(100), { cliente: c2 })).rejects.toMatchObject({ codigo: 'sin-compartir' });
    expect([...ajena.archivos.values()].filter((f) => f.name === 'apunte.pdf')).toEqual([]);
  });

  it('uno vacío o de más de 25 MB no le pide nada a Google', async () => {
    const drive = driveFalso();
    await expect(prepararAdjunto({ name: 'enorme.zip', size: TOPE_ADJUNTO + 1 }, { cliente: cliente(drive) })).rejects.toMatchObject({ codigo: 'archivo' });
    await expect(prepararAdjunto(archivoDe(0), { cliente: cliente(drive) })).rejects.toMatchObject({ codigo: 'archivo' });
    expect(drive.pedidos).toEqual([]);
  });

  it('descartar borra el que subió y olvida hasta dónde llegó', async () => {
    const drive = driveFalso();
    const estado = {};
    await prepararAdjunto(archivoDe(100), { cliente: cliente(drive), estado });
    const id = estado.id;
    await descartarAdjunto(cliente(drive), estado);
    expect(drive.archivos.has(id)).toBe(false);
    expect(estado).toMatchObject({ id: null, lugar: null, compartido: false });
  });
});

describe('un archivo sin Drive en un mensaje', () => {
  const ID_SIN_DRIVE = '3f2a9c1e-7b4d-4e8a-9f10-2b3c4d5e6f70';
  const OTRO_SIN_DRIVE = '00000000-1111-4222-8333-444455556666';
  const LLAVE_SIN_DRIVE = `${'A'.repeat(42)}g`;
  const LINK_SIN_DRIVE = linkTemporal(ID_SIN_DRIVE, LLAVE_SIN_DRIVE);

  it('en un mensaje: la tarjeta sale de las dos líneas, y un link disfrazado no es un archivo', () => {
    const texto = textoConAdjunto('Te paso el TP', { nombre: 'TP 2.pdf', bytes: 4000, id: ID_SIN_DRIVE, llave: LLAVE_SIN_DRIVE });
    expect(texto).toBe(`Te paso el TP\n\nArchivo adjunto: TP 2.pdf (4 KB)\n${LINK_SIN_DRIVE}`);
    const leido = leer(delCampus(texto));
    expect(leido.adjunto).toEqual({ id: ID_SIN_DRIVE, llave: LLAVE_SIN_DRIVE, temporal: true, url: LINK_SIN_DRIVE, nombre: 'TP 2.pdf', peso: '4 KB' });
    expect(leer(`<p>Archivo adjunto: TP.pdf<br><a href="${LINK_SIN_DRIVE}">${LINK_SIN_DRIVE}</a></p>`).adjunto.id).toBe(ID_SIN_DRIVE);
    expect(leer(`<p>Archivo adjunto: TP.pdf<br><a href="https://otro.example/robar">${LINK_SIN_DRIVE}</a></p>`)).toBeNull();
    expect(leer(`<p>Archivo adjunto: TP.pdf<br><a href="${linkTemporal(OTRO_SIN_DRIVE, LLAVE_SIN_DRIVE)}">${LINK_SIN_DRIVE}</a></p>`)).toBeNull();
    expect(leer(`<p>Archivo adjunto: TP.pdf<br><a href="${linkTemporal(ID_SIN_DRIVE, 'B'.repeat(43))}">${LINK_SIN_DRIVE}</a></p>`)).toBeNull();
  });

});
