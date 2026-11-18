import { lazy } from 'react';

// Each calculator in its own piece (propias/<slug>.jsx; the files starting with _ are pieces they share), the same at
// its own address (pages/Calculadora.jsx) and on a live session's table (enVivo/herramientas/Calculadora.jsx).
const PIEZAS = import.meta.glob(['./propias/*.jsx', '!**/_*.jsx', '!**/*.test.jsx']);
export const PROPIAS = Object.fromEntries(Object.entries(PIEZAS).map(([ruta, cargar]) => [ruta.match(/([^/]+)\.jsx$/)[1], lazy(cargar)]));

/** The shape of what's coming, while its piece arrives: the exercise and the sheet. */
export function Esqueleto() {
  return (
    <div className="calc__esqueleto" aria-busy="true">
      <span className="solo-lectores" role="status">Abriendo la calculadora</span>
      <div className="calc__esqueleto-ejercicio" />
      <div className="calc__esqueleto-hoja" />
    </div>
  );
}
