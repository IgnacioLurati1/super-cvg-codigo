---
name: aportar
description: Revisar un cambio de Super CVG y dejarlo listo para un pull request (pruebas, reglas, capturas y descripción). Usar cuando el usuario termina un cambio y quiere mandarlo, o pide revisarlo antes de subirlo.
---

# Aportar un cambio

## 1. Qué cambió

`git status` y `git diff` contra la rama principal del repo original. Un pull request, una cosa: si hay dos cambios
sueltos, proponé separarlos.

Frená y avisale al usuario si ves:

- claves, tokens, archivos `.env` o rutas de tu computadora;
- datos reales de alguien (notas, nombres, mails, legajos), también en las pruebas: se inventan;
- archivos generados (`dist/`, `graphify-out/`) o dependencias nuevas sin motivo.

## 2. Las reglas

`npx vitest run scripts/reglas.test.mjs`. Si falla, **no sumes el archivo a la lista para que pase**. Explicale al
usuario qué regla toca su cambio (están en `AGENTS.md`) y buscá juntos una forma que no la toque. Solo si no la hay,
el archivo va a la lista y el pull request explica por qué.

## 3. Las pruebas

Con la salida recortada a lo que falló:

```
npm test
npm run lint
npm run check
```

Si el cambio toca una pantalla o un recorrido, también `npm run test:flujos` (tarda unos minutos). Un error
arreglado deja su prueba.

## 4. Capturas

Si se ve distinto, capturas de `http://localhost:5330/<pantalla>?demo=1` en 390 px y en 1280 px, con el tema claro y
el oscuro. Mirá cada una: que nada se corte, se tape o quede fuera de la pantalla.

## 5. La descripción

Seguí la plantilla del repo (`.github/pull_request_template.md`):

- qué cambia para el alumno, en una o dos oraciones;
- cómo se probó;
- si lo nota un alumno, la línea propuesta para las notas del parche. No toques `src/data/novedades.js`: la fecha la
  pone quien publica;
- si tocó una lista de `scripts/reglas.test.mjs`, por qué.

Abrí el pull request (`gh pr create`) solo si el usuario lo pide.
