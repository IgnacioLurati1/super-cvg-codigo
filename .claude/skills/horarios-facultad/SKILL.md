---
name: horarios-facultad
description: Actualizar o corregir los horarios de cursado y el calendario académico de UTN FRRO en Super CVG (Tu horario, Hoy, Calendario). Usar cuando cambian los horarios de una carrera, una materia o comisión falta o está mal, o sale el calendario académico nuevo.
---

# Horarios y calendario de la facultad

Viajan con el sitio en `src/data/facultad/`. El sitio no le pide nada a la facultad. Cambian cada año.

## Horarios

- `npm run facultad` los trae de las páginas públicas de cada departamento y reescribe `horarios.json` y
  `fuentes.json`. Con `node scripts/facultad/actualizar.mjs --revisar` solo dice qué cambió, sin escribir.
- Cómo se lee cada carrera:
  - Sistemas publica planillas, una por año (`scripts/facultad/planillas.mjs`).
  - Civil, Química y Mecánica publican PDF hechos con la misma plantilla (`pdfs.mjs`). Un PDF escaneado no tiene
    texto y no se puede leer.
  - Materias Básicas publica una planilla por carrera (`basicas.mjs`) y completa las comisiones que no dio el
    departamento.
- Lo que no se pudo leer queda en `faltan` de su carrera y el sitio lo dice. No se inventa una comisión ni un horario.
- Los nombres oficiales de las materias de cada carrera están en `scripts/facultad/planes.json`, con sus alias.
- Si una carrera cambió el formato de su archivo, el arreglo va en su lector, con una prueba en su `*.test.mjs` hecha
  con un recorte del archivo nuevo.

## Calendario académico

`src/data/facultad/calendario.js` se pasa a mano del PDF oficial, que viene escaneado: fechas, feriados, mesas y
cuatrimestres, tal cual dice el PDF. `npm run facultad` solo compara su huella para notar uno nuevo.

## Revisar

- `npx vitest run scripts/facultad src/lib/facultad src/lib/horario`.
- Mirá Tu horario, Hoy y Calendario en `http://localhost:5330/?demo=1`.
- En el pull request, el link de la fuente oficial de lo que cambió. Después, la skill `aportar`.
