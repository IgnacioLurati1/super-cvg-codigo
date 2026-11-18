import { conDrive } from '../sincro';
import { aBase64, deBase64, leerCodigo } from './codigo';
import { copiaSinCampus, juntarCopias, leerCopia, mismaCopia, pestanasDeCopia } from './copiaDeSesion';
import { huellaDeCopia, idDeSesion, MAX_COPIA, ponerGuardada, quitarGuardada, todasLasGuardadas, TOPE_GUARDADAS } from './guardadas';

// The kept live sessions (guardadas.js) in the student's Drive, with «Guardar en tu Google Drive» on (sincro.js): one
// file per session in the hidden folder, `super-cvg-<student>-envivo-<id>.json`, so another computer of theirs can come
// back to it. In it: the code (to enter), when, and the copy of the table without the campus. Not who the student was
// in it nor where their files came from: that stays in each browser.
// A forgotten session leaves { borrada } in its file, so every device forgets it too; the newest of the two wins.
// What comes from Drive is read as strictly as what comes from the others: shape, sizes, the code matching the file's
// id, and the copy checked and blanked again (copiaDeSesion.js).

export const TIPO = 'super-cvg-en-vivo';
export const VERSION = 1;
// A forgotten session's file goes from Drive after this.
export const VIDA_BORRADA_MS = 120 * 86_400_000;
export const nombreEnDrive = (alumno, id) => `super-cvg-${alumno}-envivo-${id}.json`;

/** A session's file as it comes from Drive: { borrada }, { codigo, cuando, y, pestanas }, { nueva: true } (from a newer
 * Super CVG: left alone) or null (broken: written over). */
export async function leerDeDrive(texto, alumno, id) {
  let j;
  try {
    j = JSON.parse(texto);
  } catch {
    return null;
  }
  if (j?.tipo !== TIPO || j.alumno !== alumno || j.id !== id || !Number.isSafeInteger(j.version) || j.version < 1) return null;
  if (j.version > VERSION) return { nueva: true };
  if (Number.isSafeInteger(j.borrada) && j.borrada > 0) return { borrada: j.borrada };
  const codigo = leerCodigo(j.codigo);
  if (!codigo || (await idDeSesion(codigo)) !== id || !Number.isSafeInteger(j.cuando) || j.cuando <= 0) return null;
  if (typeof j.y !== 'string' || j.y.length > Math.ceil(MAX_COPIA / 3) * 4) return null;
  let bytes;
  try {
    bytes = deBase64(j.y);
  } catch {
    return null;
  }
  const doc = leerCopia(bytes);
  if (!doc) return null;
  const r = { codigo, cuando: j.cuando, y: copiaSinCampus(doc), pestanas: pestanasDeCopia(doc) };
  doc.destroy();
  return r;
}

const titulosDe = (y) => {
  const doc = leerCopia(y);
  const t = doc ? pestanasDeCopia(doc) : [];
  doc?.destroy();
  return t;
};

/** One pass over the sessions of `alumno` in Drive (`drive`: a client of drive.js). Resolves with the ids that changed
 * in this browser. */
export async function unaVueltaSesiones(alumno, drive, { ahora = () => Date.now() } = {}) {
  const deSesion = new RegExp(`^super-cvg-${alumno}-envivo-([0-9a-f]{32})\\.json$`);
  const remotos = new Map();
  for (const f of await drive.listar()) {
    const r = deSesion.exec(f.name);
    if (r && !remotos.has(r[1])) remotos.set(r[1], f);
  }
  const locales = new Map((await todasLasGuardadas(alumno)).map((r) => [r.id, r]));
  const cambiadas = [];

  const subir = async (id, cuerpo, f) => {
    const subido = await drive.subir({ id: f?.id ?? null, nombre: nombreEnDrive(alumno, id), blob: new Blob([JSON.stringify({ tipo: TIPO, version: VERSION, alumno, id, ...cuerpo })], { type: 'application/json' }) });
    const visto = await drive.mirar(subido);
    return { id: subido, version: String(visto?.version ?? '') };
  };
  const guardar = async (id, r) => {
    if (await ponerGuardada(alumno, r)) cambiadas.push(id);
  };

  // The newest ones only: past the top, one in Drive that is older than all of these is not brought.
  const copias = [...locales.values()].filter((r) => !r.borrada);
  const masVieja = copias.length >= TOPE_GUARDADAS ? Math.min(...copias.map((r) => r.cuando)) : 0;

  for (const id of new Set([...locales.keys(), ...remotos.keys()])) {
    const aca = locales.get(id);
    const f = remotos.get(id);
    if (!aca && masVieja && Date.parse(f.modifiedTime ?? '') < masVieja) continue;
    const huella = aca?.y ? await huellaDeCopia(aca.y) : '';
    const igual = f && aca?.drive?.id === f.id && aca.drive.version === String(f.version ?? '');
    let alla = null;
    if (f && !igual) {
      const r = await drive.bajar(f.id);
      alla = await leerDeDrive(await r.text(), alumno, id);
      if (alla?.nueva) continue;
    }

    if (aca?.borrada) {
      // Forgotten here. Unless it was used again elsewhere after that, it goes everywhere.
      if (alla?.y && alla.cuando > aca.borrada) await guardar(id, { id, ...alla, drive: { id: f.id, version: String(f.version ?? ''), huella: await huellaDeCopia(alla.y) } });
      else {
        if (!alla?.borrada) await subir(id, { borrada: aca.borrada }, f);
        await quitarGuardada(alumno, id);
        cambiadas.push(id);
      }
      continue;
    }
    if (!aca) {
      if (alla?.y) await guardar(id, { id, ...alla, drive: { id: f.id, version: String(f.version ?? ''), huella: await huellaDeCopia(alla.y) } });
      else if (alla?.borrada && ahora() - alla.borrada > VIDA_BORRADA_MS) await drive.borrar(f.id).catch(() => {});
      continue;
    }
    if (igual) {
      // Drive has what this browser last saw: up only if it changed here.
      if (aca.drive.huella !== huella) await guardar(id, { ...aca, drive: await subir(id, { codigo: aca.codigo, cuando: aca.cuando, y: aBase64(aca.y) }, f) });
      continue;
    }
    if (alla?.borrada) {
      // Forgotten on another device: here too, unless it was used here after that.
      if (alla.borrada >= aca.cuando) {
        await quitarGuardada(alumno, id);
        cambiadas.push(id);
      } else await guardar(id, { ...aca, drive: await subir(id, { codigo: aca.codigo, cuando: aca.cuando, y: aBase64(aca.y) }, f) });
      continue;
    }
    // Both have it (or Drive's doesn't read): joined, and up if Drive lacks something.
    const y = alla?.y ? juntarCopias(aca.y, alla.y) : aca.y;
    if (!y) continue;
    const cuando = Math.max(aca.cuando, alla?.cuando ?? 0);
    const drive2 = alla?.y && mismaCopia(y, alla.y) ? { id: f.id, version: String(f.version ?? '') } : await subir(id, { codigo: aca.codigo, cuando, y: aBase64(y) }, f);
    await guardar(id, { ...aca, cuando, y, pestanas: titulosDe(y), drive: { ...drive2, huella: await huellaDeCopia(y) } });
  }
  return cambiadas;
}

let enCamino = null;
let reloj = null;
/** Brings and takes the kept sessions now, if «Guardar en tu Google Drive» is on. Resolves with the ids that changed
 * here ([] if it is off or it failed: it tries again next time). */
export function sincronizarSesiones() {
  clearTimeout(reloj);
  enCamino ??= (async () => {
    try {
      return (await conDrive((drive, alumno) => unaVueltaSesiones(alumno, drive))) ?? [];
    } catch {
      return [];
    } finally {
      enCamino = null;
    }
  })();
  return enCamino;
}

/** In a while: changes made one after the other go together. */
export function programarDrive(ms = 30_000) {
  clearTimeout(reloj);
  reloj = setTimeout(sincronizarSesiones, ms);
}
