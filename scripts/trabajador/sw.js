// The service worker of Super CVG: it keeps the site's own files so it opens without internet. Never anything of the
// campus, of Google or of anyone else in its caches: a request to another origin goes on as if this weren't here. What
// the student brought from the campus is kept apart, by the page (src/lib/sinInternet.js), and Salir deletes it.
// scripts/trabajador.mjs fills in VERSION, NUCLEO, RESTO and MOTORES when building and writes it as dist/sw.js.
//   - The pages: from the network, and without it the shell kept (the one of «/» or 404.html, like GitHub Pages).
//   - assets/: the files have their content in their name, so what was kept is used as is. NUCLEO is kept when
//     installing; every other file, the first time it is used. RESTO is downloaded in the background only when the page
//     says the connection allows it (puedeBajarTodo in src/lib/trabajador.js): mobile data is scarce.
//   - motores/ and pdfjs/: kept only when they are used (they weigh a lot), in a cache named by their content.
//   - The rest of the site (icons, ajustes.js, the drawings of the calculators): from the network, kept for later.
//   - What another app shares (the manifest's share_target, a POST to /compartir): checked, kept apart only until the
//     page places it (src/lib/compartido.js), and the page opens to ask where it goes.
//   - «Descargas inteligentes»: with the site closed, `periodicsync` brings the material of the day's courses
//     (src/lib/descargasFondo.js), only on wifi, with the reads of src/lib/moodle.js, and keeps it where the page keeps
//     what it brought (src/lib/sinInternetDisco.js). The only requests to the campus made here.
// Written in by scripts/trabajador.mjs, from src/lib/compartidoSaneo.js, and Moodle, Disco and Fondo further down.
/* global COMPARTIDO, TIPOS_COMPARTIDOS, revisarCompartido, Moodle, Disco, Fondo */
const VERSION = '__VERSION__';
const NUCLEO = /* nucleo */ [];
const RESTO = /* resto */ [];
const MOTORES = '__MOTORES__';

const SITIO = `cvg-sitio-${VERSION}`;
const CACHE_MOTORES = `cvg-motores-${MOTORES}`;
const NUESTRAS = /^cvg-(sitio|motores)-/;
const BASE = new URL('./', self.location).href;
// How long a page waits for the network before opening the kept one, when there is one: a phone on the bus with one bar.
const ESPERA_PAGINA = 4000;

const direccion = (ruta) => new URL(ruta, BASE).href;

/* compartido */

// Each in a scope of its own, with only what it gives: the reads of the campus (LECTURA, llamar, pedirArchivo), the
// database of what is kept without internet and the night downloads.
/* moodle */
/* disco */
/* fondo */

// A file of assets/ that an earlier version already kept is the same file: it is not downloaded again. Of RESTO, only
// that: what the student opened before, or what came on a free connection, stays without internet after an update.
async function precargar() {
  const cache = await caches.open(SITIO);
  for (const ruta of RESTO) {
    const previo = await caches.match(direccion(ruta));
    if (previo) await cache.put(direccion(ruta), previo);
  }
  const pendientes = [...NUCLEO];
  const trabajar = async () => {
    while (pendientes.length) {
      const ruta = pendientes.shift();
      const url = direccion(ruta);
      const previo = ruta.startsWith('assets/') ? await caches.match(url) : undefined;
      if (previo) {
        await cache.put(url, previo);
        continue;
      }
      // The pages, checked with the server; the files of assets/ may come from the browser's own cache (the ones the
      // student already downloaded opening the site): on a phone, those megabytes are not paid twice.
      const respuesta = await fetch(url, { cache: ruta.startsWith('assets/') ? 'default' : 'no-cache', credentials: 'omit' });
      // A file missing means a publication half done: this version doesn't install, the previous one stays.
      if (!respuesta.ok) throw new Error(`${ruta}: ${respuesta.status}`);
      await cache.put(url, respuesta);
    }
  };
  await Promise.all([trabajar(), trabajar(), trabajar(), trabajar()]);
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(precargar().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (NUESTRAS.test(nombre) && nombre !== SITIO && nombre !== CACHE_MOTORES) await caches.delete(nombre);
      }
      await self.clients.claim();
    })(),
  );
});

const guardable = (respuesta) => respuesta.ok && respuesta.type === 'basic';

// RESTO in the background, one file at a time so it doesn't compete with what the student is opening. The page asks
// for it and stops it when the connection changes (`seguir`); without network it stops, and the next visit goes on.
let seguir = false;
let bajando = null;
async function bajarResto() {
  const cache = await caches.open(SITIO);
  for (const ruta of RESTO) {
    if (!seguir) return;
    const url = direccion(ruta);
    if (await cache.match(url)) continue;
    let respuesta;
    try {
      respuesta = await fetch(url, { credentials: 'omit' });
    } catch {
      return;
    }
    if (guardable(respuesta)) await cache.put(url, respuesta);
  }
}

// What the page loaded before this worker was there (the first visit): kept from the browser's own cache, so it isn't
// downloaded again. Only files of assets/.
const ARCHIVO = /^assets\/[\w.-]+$/;
async function guardarCargadas(rutas) {
  const cache = await caches.open(SITIO);
  for (const ruta of rutas.slice(0, 500)) {
    if (typeof ruta !== 'string' || !ARCHIVO.test(ruta)) continue;
    const url = direccion(ruta);
    if (await cache.match(url)) continue;
    const respuesta = await fetch(url, { cache: 'force-cache', credentials: 'omit' }).catch(() => null);
    if (respuesta && guardable(respuesta)) await cache.put(url, respuesta);
  }
}

self.addEventListener('message', (evento) => {
  if (evento.origin !== self.location.origin) return;
  const { tipo, rutas } = evento.data ?? {};
  if (tipo === 'bajar-todo') {
    seguir = true;
    bajando ??= bajarResto().finally(() => {
      bajando = null;
    });
    evento.waitUntil(bajando);
  } else if (tipo === 'frenar') seguir = false;
  else if (tipo === 'guardar' && Array.isArray(rutas)) evento.waitUntil(guardarCargadas(rutas));
});

async function primeroGuardado(pedido, nombre) {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(pedido);
  if (guardada) return guardada;
  const respuesta = await fetch(pedido);
  if (guardable(respuesta)) await cache.put(pedido, respuesta.clone());
  return respuesta;
}

async function primeroRed(pedido, nombre) {
  try {
    const respuesta = await fetch(pedido);
    if (guardable(respuesta)) {
      const copia = respuesta.clone();
      caches.open(nombre).then((c) => c.put(pedido, copia)).catch(() => {});
    }
    return respuesta;
  } catch (error) {
    const guardada = await caches.match(pedido, { ignoreSearch: true });
    if (guardada) return guardada;
    throw error;
  }
}

// The shell for a page: «/» has its own (with the content of the home page), every other address opens 404.html, which
// is the same app, empty, as GitHub Pages does.
const cascaronDe = (url) => caches.open(SITIO).then((c) => c.match(url.href === BASE ? BASE : direccion('404.html')));

async function pagina(pedido) {
  const url = new URL(pedido.url);
  const cascaron = cascaronDe(url);
  const red = fetch(pedido);
  // When the kept page wins, the network may still fail later: that is not an error of anyone.
  red.catch(() => {});
  const respaldo = new Promise((ok) => {
    setTimeout(() => cascaron.then((c) => c && ok(c)), ESPERA_PAGINA);
  });
  try {
    return await Promise.race([red, respaldo]);
  } catch (error) {
    const guardado = await cascaron;
    if (guardado) return guardado;
    throw error;
  }
}

// What came waits in its own cache, the last share only: a new one takes the place of the one before. If it can't be
// kept (no room), nothing stays and the page says so.
const COMPARTIR = direccion('compartir');
async function recibirCompartido(pedido) {
  let destino = COMPARTIR;
  try {
    const { archivos, ...resto } = await revisarCompartido(await pedido.formData());
    await caches.delete(COMPARTIDO.cache);
    const cache = await caches.open(COMPARTIDO.cache);
    const lugar = (i) => direccion(`${COMPARTIDO.ruta}${i}`);
    for (const [i, a] of archivos.entries()) {
      await cache.put(lugar(i), new Response(a.archivo, { headers: { 'content-type': TIPOS_COMPARTIDOS[a.tipo] } }));
    }
    const datos = { ...resto, cuando: Date.now(), archivos: archivos.map((a) => ({ nombre: a.nombre, tipo: a.tipo, peso: a.archivo.size })) };
    await cache.put(lugar('datos'), new Response(JSON.stringify(datos), { headers: { 'content-type': 'application/json' } }));
  } catch {
    await caches.delete(COMPARTIDO.cache).catch(() => {});
    destino = `${COMPARTIR}?no-entro`;
  }
  return Response.redirect(destino, 303);
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method === 'POST' && pedido.url.split(/[?#]/)[0] === COMPARTIR) {
    evento.respondWith(recibirCompartido(pedido));
    return;
  }
  if (pedido.method !== 'GET' || pedido.headers.has('range')) return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE)) return;
  const ruta = url.href.slice(BASE.length);
  if (pedido.mode === 'navigate') evento.respondWith(pagina(pedido));
  else if (ruta.startsWith('assets/')) evento.respondWith(primeroGuardado(pedido, SITIO));
  else if (ruta.startsWith('motores/') || ruta.startsWith('pdfjs/')) evento.respondWith(primeroGuardado(pedido, CACHE_MOTORES));
  else evento.respondWith(primeroRed(pedido, SITIO));
});

// «Descargas inteligentes»: Chrome wakes the worker about once a day, with the site closed. Everything is decided in
// Fondo.correr: whether it is on (its key), wifi, the day's courses and the 200 MB.
self.addEventListener('periodicsync', (evento) => {
  if (evento.tag !== Fondo.TAG) return;
  evento.waitUntil(
    Fondo.correr({ conexion: () => self.navigator.connection, llamar: Moodle.llamar, pedirArchivo: Moodle.pedirArchivo, disco: Disco }).catch(() => {}),
  );
});
