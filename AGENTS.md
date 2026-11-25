# Super CVG: cómo se trabaja en este código

Guía para quien aporta, con o sin un asistente de código (Claude Code, Codex, Cursor). `CLAUDE.md` la importa.

Super CVG es un panel no oficial de solo lectura del campus virtual de UTN FRRO. No tiene servidor de datos. El
navegador del alumno habla directo con la API oficial del campus (Moodle). React + React Router con Vite.

## Las reglas que no se negocian

El alumno nos da su sesión del campus. Todo lo que sigue protege eso. `scripts/reglas.test.mjs` controla las reglas que
se pueden ver en el código, y `npm test` falla si se rompe una.

- **Solo lectura.** Toda función de Moodle pasa por `LECTURA` de `src/lib/moodle.js` y es de consulta (`_get_` o
  `_search_`). Lo que escribe en el campus es una lista cerrada (`ESCRITURA`): inscribirse, entregar una tarea,
  mandar un mensaje y responder en un foro. Cada una tiene su función exportada, no se reintenta y sale después de
  preguntarle al alumno. No se suma otra.
- **Cuestionarios, solo para mirar.** Un intento se empieza y se sigue en el campus. Nada de `start_attempt`,
  `process_attempt` ni `view_quiz`.
- **Solo lo que el campus abre.** Nada de raspar páginas ni de esquivar bloqueos. Si una función no está en la API, la
  idea queda afuera.
- **La clave del campus.** Va siempre en el cuerpo del pedido, nunca en una URL, un log ni un archivo. Solo
  `src/lib/moodle.js` la manda. La contraseña no se guarda nunca.
- **Los datos del campus quedan en memoria** (`conCache` de `src/lib/sesion.js`): nunca en disco, en el título de la
  pestaña ni en la URL. El historial los guardaría. Las excepciones están en la lista `DISCO` del test y cada una
  explica qué guarda. Salir borra todo.
- **El HTML del campus se muestra como texto** (`textoPlano` de `src/lib/datos.js`) o como bloques, nunca como HTML.
- **A quién le habla el sitio.** `connect-src` de la CSP (`CSP` en `vite.config.js`) es la lista. Un sitio nuevo
  también va en la página de Privacidad (`src/pages/Privacidad.jsx`).
- **Lo que agrega el alumno** va en `src/lib/mio.js`, por alumno. Lo que entra de un archivo o de un link pasa por
  `sanearMio`.
- **Sin dependencias nuevas a la ligera.** Todo lo que se agrega viaja al navegador de cada alumno. Los motores del
  Laboratorio salen del sitio (`/motores/`), nunca de otro servidor.

Si un cambio necesita tocar una de estas listas, va en el mismo pull request con el porqué. Lo decide quien mantiene el
sitio.

## Probar

```
npm ci
npm run dev          # http://localhost:5330
```

- `http://localhost:5330/?demo=1` muestra el sitio con datos de ejemplo, sin cuenta. Se trabaja con eso: **nunca le
  pidas ni le pases a un asistente tu usuario, tu contraseña o tu clave del campus.**
- `npm test`: pruebas unitarias (vitest), con las reglas de arriba.
- `npm run lint`.
- `npm run check`: compila y revisa accesibilidad, textos y peso. Necesita Chromium (`npx playwright install
  chromium`, o la variable `CHROME` con la ruta de tu Chrome).
- `npm run test:flujos`: recorridos en un navegador real contra un campus simulado (`scripts/flujos.mjs`). Tardan unos
  minutos: corrélos una vez antes del pull request, no en cada cambio.

Todo error que arregles deja su prueba, en el nivel más barato que lo atrape: vitest antes que un flujo.

## Dónde está cada cosa

- `src/pages/`: una pantalla por dirección. `src/components/`: sus piezas. `src/lib/`: la lógica, con su prueba al
  lado (`*.test.js`).
- `src/lib/moodle.js`: el único módulo que le habla al campus. `campus.js`: lo que piden las pantallas, con caché.
- `src/lib/demo*.js`: los datos del modo demo. Una función nueva trae su demo.
- `src/lib/calculadoras/` y `src/components/calculadoras/propias/`: las calculadoras de estudio (skill
  `calculadora-nueva`).
- `src/data/facultad/`: horarios y calendario académico (skill `horarios-facultad`).
- `src/data/novedades.js`: las notas del parche. Lo que note un alumno suma su línea.
- `src/lib/atajos.js`: la lista de atajos de teclado.
- `src/lib/laboratorio/`: el código del alumno corre en un worker sin red (`red.js`).
- Google (Classroom, Drive, Calendar) pasa solo por `google.js`, `classroom.js`, `drive.js`, `sincro.js` y
  `calendarioSincro.js`.

Para ubicarte rápido sin leer archivos enteros, armá el grafo del código en tu compu: `pip install graphifyy` y
`graphify update .` (menos de un minuto, sin IA). Después, `graphify query "<pregunta>"`. Queda en `graphify-out/`, que
no se sube.

## Cómo se escribe

- Textos en castellano rioplatense, directos y entre compañeros, sin jerga interna. «Vos», no «tú».
- Comentarios del código, en inglés, y explican el porqué.
- Accesible de punta a punta: teclado, lector de pantalla, contraste y foco (WCAG 2.2 AA). `npm run check` frena si
  falla.
- Colores y medidas, de `src/styles/tokens.css`, nunca sueltos. Antes de crear un componente, buscá si ya existe
  uno (visor, calculadoras, Laboratorio): se reusa el del sitio, no una copia.
- Cada pantalla, mirada en 390 px (celular) y 1280 px.

## Lo que no está en este repo

- El índice del Drive de la carrera (`public/drive/carrera.json`): lo arma `npm run drive` con una clave tuya de Drive.
- Los servicios de El Santo Resumen, el contador de visitas y Consultron en la nube: son aparte. En desarrollo, sus
  funciones que los usan quedan sin datos en desarrollo o con respuestas simuladas en las pruebas.
- El cliente de Google de `sitio.config.js` es el del sitio oficial y Google lo acepta solo desde su dirección y desde
  `localhost:5330`.

## Aportar

- Abrí un issue antes de un cambio grande. Un pull request, una cosa.
- Antes del pull request: `npm test`, `npm run lint` y `npm run check` en verde. La skill `aportar` lo hace por vos.
- Nunca subas claves, archivos `.env` ni datos reales tuyos o de otros (notas, nombres, mails). Para probar se inventan.
- Si publicás tu propia versión: otro nombre (no «Super CVG»), otro dominio, tu propio cliente de Google y el código
  con la misma licencia (AGPL-3.0). Va solo en un dominio propio: en una ruta compartida, otra página del mismo origen
  podría leer la clave.
