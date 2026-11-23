// The flows of flujos.mjs in parallel: each batch (a test, plus the ones that follow it with pruebaQueSigue) runs in a
// process of its own, with its own browser and simulated campus, so it starts clean and a failure doesn't drag the next
// ones. Each worker serves dist (one build for all). «durante todo el recorrido» goes last, over what every batch sent.
// FLUJOS_HILOS=<n> caps the workers; FLUJOS_SOLO works as in flujos.mjs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servirDist } from './navegador.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');
const FLUJOS = path.join(RAIZ, 'scripts', 'flujos.mjs');
const FINAL = 'durante todo el recorrido';
// How long each batch took last time, to start the longest ones first.
const TIEMPOS = path.join(RAIZ, 'node_modules', '.cache', 'flujos-tiempos.json');
// A batch that takes longer than this is stuck.
const TOPE_MS = 15 * 60_000;

// The batches, from the calls in flujos.mjs: pruebaQueSigue joins the batch of the test before, and pruebaTras the one of
// the test whose name starts with its first argument. Each batch runs its tests in the file's order.
const texto = (t) => t.replace(/\\(.)/g, '$1');
const tandas = [];
const tandaDe = new Map();
for (const [, tipo, previa, nombre] of fs.readFileSync(FLUJOS, 'utf8').matchAll(/^ {2}await (prueba|pruebaQueSigue|pruebaTras)\((?:'((?:[^'\\]|\\.)*)', )?'((?:[^'\\]|\\.)*)'/gm)) {
  const n = texto(nombre);
  let tanda;
  if (tipo === 'pruebaQueSigue') tanda = tandaDe.get([...tandaDe.keys()].at(-1));
  if (tipo === 'pruebaTras') tanda = tandaDe.get([...tandaDe.keys()].find((k) => k.startsWith(texto(previa))));
  if (tipo !== 'prueba' && !tanda) throw new Error(`«${n}» sigue a una prueba que no está antes`);
  if (!tanda) tandas.push((tanda = []));
  tanda.push(n);
  tandaDe.set(n, tanda);
}
const SOLO = process.env.FLUJOS_SOLO?.split('|');
const elegidas = tandas.map((t) => t.filter((n) => !SOLO || SOLO.some((parte) => n.includes(parte)))).filter((t) => t.length);
const conFinal = elegidas.some((t) => t.includes(FINAL));
const cola = elegidas.map((t) => t.filter((n) => n !== FINAL)).filter((t) => t.length);

let tiempos = {};
try {
  tiempos = JSON.parse(fs.readFileSync(TIEMPOS, 'utf8'));
} catch {
  // First run: in the file's order.
}
const duracion = (t) => t.reduce((s, n) => s + (tiempos[n] ?? 0), 0);
cola.sort((a, b) => duracion(b) - duracion(a));

// Six by default: the longest batch («Estudiar en vivo», about 130 s) sets the time anyway, and more browsers at once
// only load the machine and make the tests that depend on timing fail.
const hilos = Math.max(1, Math.min(Number(process.env.FLUJOS_HILOS) || Math.min(os.availableParallelism(), 6), cola.length || 1));
const registros = fs.mkdtempSync(path.join(os.tmpdir(), 'flujos-'));
const resultados = [];
let numero = 0;

function correr(tanda, base, extra = {}) {
  const registro = path.join(registros, `${++numero}.json`);
  return new Promise((listo) => {
    const env = { ...process.env, FLUJOS_LISTA: JSON.stringify(tanda), FLUJOS_BASE: base, FLUJOS_REGISTRO: registro, ...extra };
    delete env.FLUJOS_SOLO;
    const hijo = spawn(process.execPath, [FLUJOS], { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    let errores = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { errores += d; });
    const reloj = setTimeout(() => hijo.kill(), TOPE_MS);
    hijo.on('close', (codigo) => {
      clearTimeout(reloj);
      let hechas = [];
      try {
        hechas = JSON.parse(fs.readFileSync(registro, 'utf8')).resultados;
      } catch {
        // It ended before writing: every test it didn't run fails below.
      }
      // Each batch's lines whole, once it ends: the workers' output never mixes.
      let texto = salida.trim() ? `${salida.trimEnd()}\n` : '';
      for (const nombre of tanda.filter((n) => !hechas.some((h) => h.nombre === n))) {
        hechas.push({ nombre, ok: false });
        const motivo = errores.trim().split('\n').slice(-6).join('\n      ');
        texto += `FALLA ${nombre}\n      el proceso terminó sin correrla (código ${codigo})${motivo ? `\n      ${motivo}` : ''}\n`;
      }
      process.stdout.write(texto);
      resultados.push(...hechas);
      listo();
    });
  });
}

const desde = Date.now();
const servidores = await Promise.all(Array.from({ length: hilos }, () => servirDist(RAIZ)));
try {
  await Promise.all(servidores.map(async ({ base }) => {
    for (let tanda = cola.shift(); tanda; tanda = cola.shift()) await correr(tanda, base);
  }));
  // Over what every batch sent, read from a folder of its own: its record doesn't go in with the others.
  if (conFinal) {
    const todos = fs.mkdtempSync(path.join(os.tmpdir(), 'flujos-todos-'));
    for (const f of fs.readdirSync(registros)) fs.renameSync(path.join(registros, f), path.join(todos, f));
    await correr([FINAL], servidores[0].base, { FLUJOS_REGISTROS: todos });
    fs.rmSync(todos, { recursive: true, force: true });
  }
} finally {
  for (const s of servidores) s.cerrar();
  fs.rmSync(registros, { recursive: true, force: true });
}

if (!SOLO) {
  fs.mkdirSync(path.dirname(TIEMPOS), { recursive: true });
  fs.writeFileSync(TIEMPOS, JSON.stringify(Object.fromEntries(resultados.filter((r) => r.ms).map((r) => [r.nombre, r.ms]))));
}
const fallas = resultados.filter((r) => !r.ok);
if (fallas.length) console.log(`\nFallaron:\n${fallas.map((r) => `  ${r.nombre}`).join('\n')}`);
console.log(`\n${hilos} a la vez, ${Math.round((Date.now() - desde) / 1000)} s`);
console.log(`${resultados.length - fallas.length} de ${resultados.length} pasaron`);
process.exitCode = fallas.length ? 1 : 0;
