---
name: calculadora-nueva
description: Sumar una calculadora de estudio a Super CVG, o cambiar el método de una que ya está. Usar cuando se pida una calculadora, un simulador o un resolvedor paso a paso de una materia de la UTN FRRO.
---

# Calculadora nueva

Una calculadora de Super CVG resuelve como lo enseña la cátedra, paso a paso, con la notación del apunte. Una que
resuelve bien con otro método le enseña mal al alumno.

## Antes de escribir código

1. **La fuente.** Pedile al usuario el apunte, la clase o el ejercicio resuelto de la cátedra que define el método
   (archivo, página). Sin una fuente no se arranca. El método no sale de lo que sabés en general. Si el apunte y tu
   conocimiento no coinciden, manda el apunte.
2. **Mirá una parecida.** Leé `src/lib/calculadoras/catalogo.js` y abrí la pantalla de una calculadora de la misma
   materia o del mismo estilo en `src/components/calculadoras/propias/`. Las piezas comunes (`Hoja`, `Pasos`, `Paso`,
   `Resultado`, `Ejemplos`, `Opciones`, `Desborde`) están en `src/components/calculadoras/Hoja.jsx`. Las piezas de
   cada familia, en los archivos `_*.jsx` de `propias/`. Se reusan, no se copian.

## Las partes

1. **La cuenta**, en `src/lib/calculadoras/<nombre>.js`: funciones puras, sin React. Lee lo que escribe el alumno con
   `cifras.js` (`leerNumero`, `leerLista`) y devuelve los pasos con sus números.
2. **Su prueba**, en `src/lib/calculadoras/<nombre>.test.js`: los ejemplos del apunte con los resultados del apunte,
   más una entrada mal escrita y un caso borde. Si un resultado no coincide con el apunte, la que está mal es la
   calculadora.
3. **La pantalla**, en `src/components/calculadoras/propias/<slug>.jsx`:
   - `export default` del componente y `export const EJEMPLOS`: los del apunte, con nombres que dicen qué muestran.
   - Arriba, un comentario que cita la fuente (materia, apunte, páginas).
   - Lo que escribe el alumno se recuerda con `useRecordado` de `src/lib/calculadoras/memoria.js`.
   - Su CSS al lado (`<slug>.css`), con clases que empiecen con el slug. El CSS de cada pantalla queda cargado en
     todas: una clase genérica pisaría la de otra calculadora.
   - Colores y medidas, de `src/styles/tokens.css`. Que se use con teclado y con lector de pantalla.
4. **El catálogo**: al final de `CATALOGO` en `src/lib/calculadoras/catalogo.js`, con `slug` (minúsculas y guiones),
   `nombre` (32 caracteres como mucho), `materias` (los nombres oficiales, como en `scripts/facultad/planes.json` o en
   las otras calculadoras, la propia primero) y `descripcion` (90 como mucho, qué muestra paso a paso).
5. **Las fotos de la tarjeta**: con `npm run dev` andando,
   `node scripts/calculadoras/fotos.mjs http://localhost:5330 <slug>`. Escribe
   `public/calculadoras/<slug>-claro.webp` y `-oscuro.webp`.
6. **Consultron (opcional)**: para que el asistente del sitio la abra con los datos de una pregunta, su forma va en
   `FORMAS` de `src/lib/consultron/calculos.js`.

## Revisar

- `npx vitest run src/lib/calculadoras src/lib/consultron/calculosPantallas.test.jsx`.
- Abrila en `http://localhost:5330/calculadoras/<slug>?demo=1`, en 390 px y en 1280 px, con cada ejemplo y con el dato
  más largo que tenga sentido.
- Antes del pull request, la skill `aportar`.
