# Super CVG

Panel no oficial del campus virtual de UTN FRRO. El sitio oficial es uno solo:
**https://supercvg.lutastudios.com**. Si otra dirección te pide la clave del campus con este nombre, no es Super CVG.

No tiene servidor de datos. Tu navegador habla directo con el campus y la clave queda en tu navegador. Este es el código
del sitio, para que cualquiera lo revise.

## Probarlo

```
npm ci
npm run dev
```

Abre en http://localhost:5330. Con `/?demo=1` ves datos de ejemplo sin cuenta.

```
npm test
npm run lint
npm run check
```

- **Drive de la carrera:** el índice (`public/drive/carrera.json`) no viene en el repo. Lo arma
  `DRIVE_CLAVE=<tu clave de Drive> npm run drive`.
- **Google (Classroom, Drive, Calendar):** `sitio.config.js` trae el cliente del sitio oficial, que Google acepta solo
  desde su dirección y `localhost:5330`. Para publicar tu versión, usá uno tuyo.

## Aportar

Abrí un issue o un pull request. Lo que se suma al sitio oficial se pasa a mano.

Antes de tocar código, leé [AGENTS.md](AGENTS.md): cómo está armado, cómo se prueba y las reglas que cuidan la sesión
de cada alumno. `npm test` las controla. Cada pull request corre las pruebas en GitHub.

Los asistentes de código (Claude Code, Codex, Cursor) leen `AGENTS.md` solos. En `.claude/skills/` hay guías para
`aportar` (revisar el cambio y armar el pull request), `calculadora-nueva` y `horarios-facultad`. Trabajá con
`/?demo=1`. Nunca le pases tu usuario ni tu clave del campus a un asistente.

## Licencia

[GNU AGPL v3.0](LICENSE). Si publicás una versión modificada como sitio, compartís su código con la misma licencia.
Lo que viene de terceros mantiene su licencia: [THIRD-PARTY.md](THIRD-PARTY.md).

El nombre «Super CVG» y su logo no entran en la licencia. Una versión tuya lleva otro nombre.
