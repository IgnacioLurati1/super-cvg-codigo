import { createContext } from 'react';

// The camera of a 3D graph in a live session's table (enVivo/herramientas/Calculadora.jsx): { vista, alGirar }.
// `vista`: where the person being followed looks ({ giro, alza, dist }), or null. `alGirar(camara)`: this student
// moved it by hand. Without a session there is none, and the graph is as always. The 2D graph needs none: its window
// is part of what's typed, and is shared with the rest.
export const VistaDeGrafica = createContext(null);

const numero = (v) => typeof v === 'number' && Number.isFinite(v);

/** A camera that came from someone: only its three numbers, or null. */
export const camaraValida = (c) => (c && typeof c === 'object' && numero(c.giro) && numero(c.alza) && numero(c.dist) ? { giro: c.giro, alza: c.alza, dist: c.dist } : null);
