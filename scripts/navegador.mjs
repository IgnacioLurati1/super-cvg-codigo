// Lo que comparten check y prerender: encontrar Chromium y servir dist.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export function buscarChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (!fs.existsSync(base)) return null;
  const d = fs.readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  const exe = d && path.join(base, d, 'chrome-win64', 'chrome.exe');
  return exe && fs.existsSync(exe) ? exe : null;
}

// En GitHub Actions, Chrome no puede usar su caja de arena.
export const opcionesNavegador = (exe) => ({ executablePath: exe, headless: true, args: process.env.CI ? ['--no-sandbox'] : [] });

const puertoLibre = () =>
  new Promise((ok, mal) => {
    const s = net.createServer();
    s.once('error', mal);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

/** Sirve dist con la misma base que la build. Devuelve la dirección con barra final y cómo cerrarlo. */
export async function servirDist(raiz) {
  const puerto = await puertoLibre();
  const vite = path.join(raiz, 'node_modules', 'vite', 'bin', 'vite.js');
  const servidor = spawn(process.execPath, [vite, 'preview', '--port', String(puerto), '--strictPort', '--host', '127.0.0.1'], { cwd: raiz, stdio: 'ignore' });
  const base = `http://127.0.0.1:${puerto}${process.env.BASE_PATH || '/'}`;
  for (let i = 0; i < 50; i++) {
    if (await fetch(base).then(() => true, () => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { base, cerrar: () => servidor.kill() };
}
