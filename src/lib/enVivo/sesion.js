import * as Y from 'yjs';
import * as aw from 'y-protocols/awareness';
import * as enc from 'lib0/encoding';
import * as dec from 'lib0/decoding';

// One live session on this browser: the shared Y.Doc, who is here (awareness) and the files passed around. It speaks
// through a `red` (red.js: Realtime and direct connections, everything encrypted; redesLocales below, for tests):
//
//   red.yo                       this browser's id in the session
//   red.mandar(bytes, para?)     to everyone, or only to `para`
//   red.alRecibir(fn(bytes, de)) every message that arrives (already decrypted, whole)
//   red.alCambiarPares(fn(ids))  who is connected now, without this browser
//   red.cerrar()
//
// Nothing here is kept anywhere: when the last one leaves, the session is gone.
//
// Each person has an id of their own (`yo.id`, what the tools write as `de`), apart from the network's: a reload opens
// a new network but keeps the person (conexion.js), so it is not leaving.

const SYNC1 = 0;
const SYNC2 = 1;
const CAMBIO = 2;
const CONCIENCIA = 3;
const PEDIR = 4;
const PARTE = 5;
const CHAU = 6;

// Who drops without saying goodbye (a reload, a cut) still counts as here for this long: they may be back.
export const GRACIA = 30000;
// What is on the table comes from the others: until it does, it is not empty, just not here yet. Alone after the first
// wait, or past the top, it is what there is.
export const ESPERA_MESA = 5000;
export const TOPE_MESA = 15000;
const ID = /^[0-9a-f]{16}$/;
// The person of an awareness state: their own id, or the network's for a browser that doesn't send one.
const personaDe = (s) => (typeof s?.persona === 'string' && ID.test(s.persona) ? s.persona : s?.red);

// How often the changes and the passing marks go out, merged: few messages, whatever the typing speed.
export const CADA_CAMBIOS = 150;
export const CADA_CONCIENCIA = 300;
// Whoever ends the session for everyone waits for the others to leave on hearing it, at most this long.
export const ESPERA_FIN = 3000;
// A file goes in parts of this size, and no file above the top.
export const PARTE_ARCHIVO = 48 * 1024;
export const MAX_ARCHIVO = 25 * 1024 * 1024;
// Who does not answer for a file in this time, someone else is asked.
const ESPERA_ARCHIVO = 8000;
// A file nobody here has: said once the others had this long to say they have it.
export const ESPERA_NADIE = 3000;
// How many files each one says they have (`t` in the awareness), the newest.
const MAX_TENGO = 40;

// Each person's color, from a fixed set readable on light and dark pages: a color from someone else is one of these, or
// the first.
export const COLORES = ['#c2410c', '#1d6fb8', '#047857', '#7c3aed', '#be185d', '#0e7490', '#a16207', '#4d7c0f', '#b4235a', '#5b5bd6'];
const objeto = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const color = (c) => (COLORES.includes(c) ? c : COLORES[0]);

const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

/** `nueva`: a session this browser just made, with nothing to wait for. */
export function crearSesion({ red, yo, nueva = false }) {
  const doc = new Y.Doc();
  const conciencia = new aw.Awareness(doc);
  const oyentes = new Set();
  const persona = typeof yo.id === 'string' && ID.test(yo.id) ? yo.id : red.yo;
  const inicio = Date.now();
  let version = 0;
  let cerrada = false;
  let llegoLaMesa = Boolean(nueva);
  const relojes = new Set();
  const despues = (fn, ms) => {
    const r = setTimeout(() => {
      relojes.delete(r);
      fn();
    }, ms);
    relojes.add(r);
  };
  // Everyone seen here, by person: { nombre, desde, ido } (`ido`, when they stopped being seen), and who said goodbye.
  // And each network's person, for a goodbye that arrives after the network already dropped.
  const vistos = new Map();
  const deRed = new Map();
  const despedidos = new Set();
  let pares = new Set();
  // The networks that said goodbye (CHAU), and whether this browser is ending the session for everyone.
  const conChau = new Set();
  let terminando = false;
  // The files, further down: id -> { blob?, nombre, tipo, partes?, n, recibidas, esperas, quiere?, dueno, a?, desde }.
  const archivos = new Map();
  const presentes = () => {
    const m = new Map();
    conciencia.getStates().forEach((s, cliente) => {
      const id = personaDe(s);
      if (cliente !== doc.clientID && id && id !== persona && pares.has(s.red)) m.set(id, s);
    });
    return m;
  };
  const repasar = () => {
    const ahora = presentes();
    ahora.forEach((s, id) => {
      vistos.set(id, { nombre: typeof s.nombre === 'string' ? s.nombre.slice(0, 60) : '', desde: Number.isFinite(s.desde) ? s.desde : 0, ido: null });
      deRed.set(s.red, id);
      despedidos.delete(id);
    });
    vistos.forEach((v, id) => {
      if (ahora.has(id) || v.ido) return;
      v.ido = Date.now();
      despues(avisar, GRACIA + 50);
    });
  };
  function avisar() {
    if (cerrada) return;
    repasar();
    repedir();
    version += 1;
    oyentes.forEach((f) => f());
  }
  // What each tab gives the session's Consultron to read: its plain text.
  const textos = new Map();
  // What each tab gives to «Guardar en lo mío»: a function that returns { nombre, texto } or { nombre, archivo }.
  const guardables = new Map();

  const marco = (tipo, escribir) => {
    const e = enc.createEncoder();
    enc.writeUint8(e, tipo);
    escribir?.(e);
    return enc.toUint8Array(e);
  };
  // Resolves once it went out (red.js sends in order).
  const mandar = (bytes, para) => (cerrada ? undefined : red.mandar(bytes, para));

  // --- The document: everyone's changes, merged and sent every so often.
  let pendientes = [];
  let reloj = null;
  const vaciar = () => {
    reloj = null;
    if (!pendientes.length) return;
    const junto = pendientes.length === 1 ? pendientes[0] : Y.mergeUpdates(pendientes);
    pendientes = [];
    return mandar(marco(CAMBIO, (e) => enc.writeVarUint8Array(e, junto)));
  };
  doc.on('update', (cambio, origen) => {
    revisarMesa();
    if (origen === red) return;
    pendientes.push(cambio);
    if (!reloj) reloj = setTimeout(vaciar, CADA_CAMBIOS);
  });

  // --- Who is here, and where. The own state goes out merged too; the others' come in as they are.
  let conCambios = new Set();
  let relojConciencia = null;
  const mandarConciencia = () => {
    relojConciencia = null;
    if (!conCambios.size) return;
    const ids = [...conCambios];
    conCambios = new Set();
    mandar(marco(CONCIENCIA, (e) => enc.writeVarUint8Array(e, aw.encodeAwarenessUpdate(conciencia, ids))));
  };
  conciencia.on('update', ({ added, updated, removed }, origen) => {
    if (origen !== red) {
      [...added, ...updated, ...removed].forEach((id) => id === doc.clientID && conCambios.add(id));
      if (!relojConciencia) relojConciencia = setTimeout(mandarConciencia, CADA_CONCIENCIA);
    }
    avisar();
  });
  conciencia.setLocalState({ red: red.yo, persona, desde: inicio, nombre: yo.nombre, color: yo.color, anfitrion: Boolean(yo.anfitrion), p: null, v: {}, h: {} });
  // Whoever this browser hasn't heard of yet, just in, may be on their way: said once the grace is over. The same for
  // the table.
  despues(avisar, GRACIA + 50);
  if (!llegoLaMesa) [ESPERA_MESA, TOPE_MESA].forEach((ms) => despues(avisar, ms + 50));
  // And whether a file nobody here has is lost.
  despues(avisar, ESPERA_NADIE + 50);

  // --- Files: each browser keeps in memory a copy of every file on the table and says which ones it has (`t` in the
  // awareness). Whoever lacks one asks one of those who have it: as soon as it is on the table by a direct connection,
  // or when its tab opens if there is none (Realtime has a top). It is lost only when nobody here has it anymore.
  const cargada = () => {
    if (llegoLaMesa) return true;
    const pasado = Date.now() - inicio;
    return pasado >= TOPE_MESA || (pasado >= ESPERA_MESA && pares.size === 0);
  };
  // The networks of the others here now that say they have it.
  const quienesTienen = (id) => [...presentes().values()].filter((s) => Array.isArray(s.t) && s.t.includes(id)).map((s) => s.red);
  const estadoArchivo = (id) => {
    const a = archivos.get(id);
    const hay = a?.blob ? 0 : quienesTienen(id).length;
    const desde = Math.max(inicio, a?.desde ?? 0);
    const nadie = !a?.blob && !hay && cargada() && Date.now() - desde >= ESPERA_NADIE;
    return { tiene: Boolean(a?.blob), parte: a?.recibidas ?? 0, de: a?.n ?? 0, hay, nadie };
  };
  const anunciar = () => conciencia.setLocalStateField('t', [...archivos].filter(([, a]) => a.blob).map(([id]) => id).slice(-MAX_TENGO));
  async function mandarArchivo(id, para) {
    const a = archivos.get(id);
    if (!a?.blob) return;
    const bytes = new Uint8Array(await a.blob.arrayBuffer());
    const n = Math.max(1, Math.ceil(bytes.length / PARTE_ARCHIVO));
    for (let i = 0; i < n; i += 1) {
      mandar(marco(PARTE, (e) => {
        enc.writeVarString(e, id);
        enc.writeVarUint(e, i);
        enc.writeVarUint(e, n);
        enc.writeVarString(e, a.nombre);
        enc.writeVarString(e, a.tipo);
        enc.writeVarUint8Array(e, bytes.subarray(i * PARTE_ARCHIVO, (i + 1) * PARTE_ARCHIVO));
      }), para);
    }
  }
  const pedirA = (id, dueno, quien) => mandar(marco(PEDIR, (e) => {
    enc.writeVarString(e, id);
    enc.writeVarString(e, dueno ?? '');
  }), quien);
  const directa = (r) => Boolean(red.directaCon?.(r));
  // One of those who have it, at random so that several share the load (`otro`: not the last one asked). Only by a
  // direct connection while nobody here is looking at it.
  function pedirle(id, otro = false) {
    const a = archivos.get(id);
    if (!a || a.blob || cerrada || !(a.esperas.length || a.quiere)) return;
    let quienes = quienesTienen(id);
    if (!a.esperas.length) quienes = quienes.filter(directa);
    if (!quienes.length) {
      a.a = null;
      return;
    }
    const otros = otro ? quienes.filter((r) => r !== a.a) : quienes;
    const lista = otros.length ? otros : quienes;
    a.a = lista[Math.floor(Math.random() * lista.length)];
    a.ultimoVisto = a.recibidas ?? 0;
    pedirA(id, a.dueno, a.a);
  }
  // Nobody asked yet, or whoever was asked no longer has it here: asked again when who has it changes.
  function repedir() {
    archivos.forEach((a, id) => {
      if (a.blob || !(a.esperas.length || a.quiere) || (a.a && quienesTienen(id).includes(a.a))) return;
      pedirle(id);
    });
  }
  function esperarArchivo(id, de, espera) {
    const a = archivos.get(id) ?? { esperas: [], partes: null, desde: Date.now() };
    archivos.set(id, a);
    a.dueno = de;
    const yaPedido = a.reloj && (a.quiere || a.esperas.length);
    if (espera) a.esperas.push(espera);
    else a.quiere = true;
    // Already on its way; or brought in the background with nobody to ask, and looked at now: by any way.
    if (yaPedido && (!espera || a.a)) return;
    pedirle(id);
    // Nothing came in a while: someone else.
    const vigilar = () => {
      const b = archivos.get(id);
      if (!b || b.blob || cerrada) return;
      if ((b.recibidas ?? 0) === (b.ultimoVisto ?? 0)) pedirle(id, true);
      b.ultimoVisto = b.recibidas ?? 0;
      b.reloj = setTimeout(vigilar, ESPERA_ARCHIVO);
    };
    clearTimeout(a.reloj);
    a.reloj = setTimeout(vigilar, ESPERA_ARCHIVO);
    despues(avisar, ESPERA_NADIE + 50);
  }
  // Each file on the table, as soon as it shows up (`traer`).
  let porRevisar = false;
  const revisarMesa = () => {
    if (porRevisar || cerrada) return;
    porRevisar = true;
    despues(() => {
      porRevisar = false;
      doc.getMap('pestanas').forEach((p, pestana) => {
        if (p?.tipo !== 'apunte') return;
        const datos = doc.getMap(`h:${pestana}`);
        archivosApi.traer(datos.get('archivo'), datos.get('de'));
      });
    }, 0);
  };
  const archivosApi = {
    /** `id`: the one it had, to put it back in the same tab (after a reload, when nobody else had it). */
    compartir(blob, nombre, id = nuevoId()) {
      if (!(blob instanceof Blob)) throw new Error('No es un archivo');
      if (blob.size > MAX_ARCHIVO) throw Object.assign(new Error('El archivo pasa de 25 MB'), { conocido: true });
      if (!ID.test(id)) throw new Error('No es un archivo de la mesa');
      const a = archivos.get(id) ?? { esperas: [] };
      clearTimeout(a.reloj);
      Object.assign(a, { blob, nombre: String(nombre).slice(0, 200), tipo: blob.type || 'application/octet-stream', partes: null, quiere: false });
      archivos.set(id, a);
      a.esperas.forEach((x) => x.resolver(blob));
      a.esperas = [];
      anunciar();
      avisar();
      return id;
    },
    pedir(id, de) {
      const a = archivos.get(id);
      if (a?.blob) return Promise.resolve(a.blob);
      return new Promise((resolver, rechazar) => esperarArchivo(id, de, { resolver, rechazar }));
    },
    /** Brings it into this browser's memory, only by a direct connection: nothing to wait for. */
    traer(id, de) {
      if (typeof id !== 'string' || !ID.test(id) || archivos.has(id)) return;
      esperarArchivo(id, typeof de === 'string' ? de : '', null);
    },
    estado: estadoArchivo,
  };

  // --- What arrives.
  const sincronizados = new Set();
  const pedirSincro = (para) => mandar(marco(SYNC1, (e) => enc.writeVarUint8Array(e, Y.encodeStateVector(doc))), para);
  red.alRecibir((bytes, de) => {
    if (cerrada) return;
    try {
      const d = dec.createDecoder(bytes);
      const tipo = dec.readUint8(d);
      if (tipo === SYNC1) {
        const sv = dec.readVarUint8Array(d);
        mandar(marco(SYNC2, (e) => enc.writeVarUint8Array(e, Y.encodeStateAsUpdate(doc, sv))), de);
        // Whoever asks may have what this browser lacks (back from a cut): ask them once too.
        if (!sincronizados.has(de)) {
          sincronizados.add(de);
          pedirSincro(de);
        }
        // And they learn who is here now.
        mandar(marco(CONCIENCIA, (e) => enc.writeVarUint8Array(e, aw.encodeAwarenessUpdate(conciencia, [...conciencia.getStates().keys()]))), de);
      } else if (tipo === SYNC2 || tipo === CAMBIO) {
        Y.applyUpdate(doc, dec.readVarUint8Array(d), red);
        if (tipo === SYNC2 && !llegoLaMesa) {
          llegoLaMesa = true;
          avisar();
        }
      } else if (tipo === CONCIENCIA) {
        aw.applyAwarenessUpdate(conciencia, dec.readVarUint8Array(d), red);
      } else if (tipo === PEDIR) {
        const id = dec.readVarString(d);
        if (archivos.get(id)?.blob) mandarArchivo(id, de);
      } else if (tipo === PARTE) {
        const id = dec.readVarString(d);
        const i = dec.readVarUint(d);
        const n = dec.readVarUint(d);
        const nombre = dec.readVarString(d);
        const tipoArchivo = dec.readVarString(d);
        const parte = dec.readVarUint8Array(d);
        const a = archivos.get(id);
        // Only what this browser asked for: the rest of the parts pass by.
        if (!a || a.blob || !(a.esperas.length || a.quiere) || n >Math.ceil(MAX_ARCHIVO / PARTE_ARCHIVO) || i >= n) return;
        if (!a.partes || a.n !== n) {
          a.partes = new Array(n);
          a.n = n;
          a.recibidas = 0;
        }
        if (a.partes[i]) return;
        a.partes[i] = parte.slice();
        a.recibidas += 1;
        a.nombre = nombre.slice(0, 200);
        a.tipo = tipoArchivo.slice(0, 100);
        if (a.recibidas === n) {
          a.blob = new Blob(a.partes, { type: a.tipo });
          a.partes = null;
          clearTimeout(a.reloj);
          a.esperas.forEach((x) => x.resolver(a.blob));
          a.esperas = [];
          a.quiere = false;
          anunciar();
        }
        avisar();
      } else if (tipo === CHAU) {
        const [cliente, s] = [...conciencia.getStates()].find(([, x]) => x?.red === de) ?? [];
        // Salir: gone now, without waiting for a return.
        const quien = personaDe(s) ?? deRed.get(de);
        if (quien) despedidos.add(quien);
        conChau.add(de);
        if (cliente != null) aw.removeAwarenessStates(conciencia, [cliente], red);
        sincronizados.delete(de);
        avisar();
      }
    } catch {
      // A message that does not read is dropped: whoever sent it is not trusted anyway.
    }
  });

  // Whoever arrives, or comes back, asks everyone for what it lacks.
  red.alCambiarPares((ids) => {
    const nuevos = [...ids].filter((id) => !pares.has(id));
    const idos = [...pares].filter((id) => !ids.has(id));
    pares = new Set(ids);
    nuevos.forEach((id) => {
      if (!sincronizados.has(id)) {
        sincronizados.add(id);
        pedirSincro(id);
      }
    });
    idos.forEach((id) => {
      sincronizados.delete(id);
      const cliente = [...conciencia.getStates()].find(([, s]) => s?.red === id)?.[0];
      if (cliente != null) aw.removeAwarenessStates(conciencia, [cliente], red);
    });
    avisar();
  });
  pedirSincro();

  return {
    doc,
    conciencia,
    archivos: archivosApi,
    yo: { ...yo, id: persona, desde: inicio, cliente: doc.clientID },
    suscribir(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    avisar,
    version: () => version,
    /** Register the plain text of a tab for the session's Consultron; returns how to unregister it. */
    paraConsultron(id, fn) {
      textos.set(id, fn);
      return () => textos.get(id) === fn && textos.delete(id);
    },
    /** Register what «Guardar en lo mío» saves of a tab; returns how to unregister it. */
    paraGuardar(id, fn) {
      guardables.set(id, fn);
      avisar();
      return () => guardables.get(id) === fn && guardables.delete(id) && avisar();
    },
    /** The function that gives what to save of a tab, or null if it has none. */
    guardable: (id) => guardables.get(id) ?? null,
    /** Each tab's text: [{ id, texto }]. A tab whose text fails is left out. */
    textos() {
      return [...textos].flatMap(([id, fn]) => {
        try {
          return [{ id, texto: String(fn() ?? '') }];
        } catch {
          return [];
        }
      });
    },
    /** The others now here: { cliente, id, nombre, color, anfitrion, p, v, h }. Only who is connected: someone who
     * reloaded leaves their old self behind in what others relay, and it would show twice. */
    otros() {
      // One per person: a reload that the network hasn't noticed yet leaves them twice for a moment, the newest last.
      const uno = new Map();
      conciencia.getStates().forEach((s, cliente) => {
        if (cliente !== doc.clientID && s?.red && pares.has(s.red) && personaDe(s) !== persona) uno.set(personaDe(s), [cliente, s]);
      });
      return [...uno.values()]
        .map(([cliente, s]) => ({ cliente, presenta: Number.isFinite(s.presenta) ? s.presenta : 0, id: personaDe(s), nombre: typeof s.nombre === 'string' ? s.nombre.slice(0, 60) : '', color: color(s.color), anfitrion: Boolean(s.anfitrion), p: typeof s.p === 'string' && s.p.length <= 24 ? s.p : null, v: objeto(s.v), h: objeto(s.h) }));
    },
    /** Whether what is on the table already came (or there is nobody to bring it): before that, an empty table is not
     * empty yet. */
    cargada,
    /** Whoever has `id` (this browser too): { nombre, desde } while here, { nombre, volviendo: true } while a reload or
     * a cut may bring them back (`nombre` empty if this browser just came in and hasn't heard of them), or null once
     * they left: Salir, or gone past the grace. */
    presente(id) {
      if (id === persona) return { nombre: yo.nombre, desde: inicio };
      if (despedidos.has(id)) return null;
      const s = presentes().get(id);
      if (s) return { nombre: typeof s.nombre === 'string' ? s.nombre.slice(0, 60) : '', desde: Number.isFinite(s.desde) ? s.desde : 0 };
      const v = vistos.get(id);
      const desde = v ? v.ido ?? Date.now() : inicio;
      return Date.now() - desde < GRACIA ? { nombre: v?.nombre ?? '', volviendo: true } : null;
    },
    /** Ends the session for everyone. `fin`: { por, cuando }. It goes out now, not with the next batch, and resolves
     * once the others left on hearing it (or after ESPERA_FIN): only then may this browser leave (cerrar), or its
     * closing would cut it off. */
    async terminar(fin) {
      if (cerrada) return;
      terminando = true;
      doc.getMap('meta').set('terminada', fin);
      clearTimeout(reloj);
      await vaciar();
      const hasta = Date.now() + ESPERA_FIN;
      while (!cerrada && Date.now() < hasta && [...pares].some((id) => !conChau.has(id))) await new Promise((r) => setTimeout(r, 50));
    },
    /** `fn({ por, cuando })` once someone else ended the session, also if it already was when this browser came in.
     * Called outside Yjs' transaction: `fn` closes the session. Returns how to stop listening. */
    alTerminar(fn) {
      const meta = doc.getMap('meta');
      let avisado = false;
      let quitado = false;
      const mirar = (evento) => {
        const f = meta.get('terminada');
        if (avisado || terminando || cerrada || !f || typeof f !== 'object' || (evento && !evento.keysChanged.has('terminada'))) return;
        avisado = true;
        const por = typeof f.por === 'string' ? f.por.slice(0, 60) : '';
        setTimeout(() => !cerrada && !quitado && fn({ por, cuando: Number.isFinite(f.cuando) ? f.cuando : 0 }), 0);
      };
      meta.observe(mirar);
      mirar(null);
      return () => {
        quitado = true;
        meta.unobserve(mirar);
      };
    },
    marcarLocal(campo, valor) {
      conciencia.setLocalStateField(campo, valor);
    },
    cerrar() {
      if (cerrada) return;
      vaciar();
      mandarConciencia();
      mandar(marco(CHAU));
      cerrada = true;
      relojes.forEach(clearTimeout);
      clearTimeout(reloj);
      clearTimeout(relojConciencia);
      archivos.forEach((a) => {
        clearTimeout(a.reloj);
        a.esperas?.forEach((x) => x.rechazar(Object.assign(new Error('La sesión terminó'), { conocido: true })));
      });
      aw.removeAwarenessStates(conciencia, [doc.clientID], 'cerrar');
      conciencia.destroy();
      red.cerrar();
      doc.destroy();
      oyentes.clear();
    },
  };
}

/** n networks joined in memory, for tests and to try the tools without Realtime. */
export function redesLocales(n) {
  const redes = [];
  for (let k = 0; k < n; k += 1) {
    const yo = `r${k}`;
    const red = {
      yo,
      recibir: null,
      pares: null,
      abierta: true,
      // As if joined by direct connections (`false`: as if only through Realtime).
      directa: true,
      directaCon: (id) => red.directa && redes.some((o) => o.yo === id && o.abierta && o.directa),
      mandar(bytes, para) {
        const copia = bytes.slice();
        redes.forEach((otra) => {
          if (otra === red || !otra.abierta || (para && otra.yo !== para)) return;
          queueMicrotask(() => otra.abierta && otra.recibir?.(copia, yo));
        });
      },
      alRecibir(fn) {
        red.recibir = fn;
      },
      alCambiarPares(fn) {
        red.pares = fn;
        queueMicrotask(() => fn(new Set(redes.filter((o) => o !== red && o.abierta).map((o) => o.yo))));
      },
      cerrar() {
        red.abierta = false;
        redes.forEach((o) => o.abierta && o.pares?.(new Set(redes.filter((x) => x !== o && x.abierta).map((x) => x.yo))));
      },
    };
    redes.push(red);
  }
  return redes;
}
