import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { calculadorasDe } from '../../lib/calculadoras/deLaMateria';
import { CALCULADORAS, MATERIAS_DE_CALCULADORAS } from '../../lib/calculadoras/lista';
import DeLaMateria from './DeLaMateria';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raiz;
let caja;
afterEach(() => {
  act(() => raiz?.unmount());
  caja?.remove();
});

function mostrar(nombre) {
  caja = document.createElement('div');
  document.body.append(caja);
  raiz = createRoot(caja);
  act(() => raiz.render(<MemoryRouter><DeLaMateria nombre={nombre} /></MemoryRouter>));
  return [...caja.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
}

describe('las calculadoras de una materia', () => {
  it('cada materia de la lista es un nombre oficial, con alguna calculadora', () => {
    for (const m of MATERIAS_DE_CALCULADORAS) expect(CALCULADORAS.some((c) => c.materias[0] === m)).toBe(true);
    for (const c of CALCULADORAS) expect(MATERIAS_DE_CALCULADORAS).toContain(c.materias[0]);
    expect(MATERIAS_DE_CALCULADORAS).not.toContain('Inteligencia Artificial');
  });

  it('un curso del campus con el nombre de la materia trae las suyas', () => {
    expect(calculadorasDe('Sistemas Operativos - K2052 2026').map((c) => c.slug)).toEqual(['planificacion', 'reemplazo-paginas', 'banquero']);
    expect(calculadorasDe('LÓGICA Y ESTRUCTURAS DISCRETAS').map((c) => c.slug)).toEqual(['tabla-verdad', 'relacion', 'recorrido']);
    expect(calculadorasDe('Redes de Datos (4K1)').map((c) => c.slug)).toEqual(['subred', 'ventana-tcp']);
    expect(calculadorasDe('Investigacion Operativa 2026').map((c) => c.slug)).toEqual(['calculadora-vacia']);
    expect(calculadorasDe('Inteligencia Artificial').map((c) => c.slug)).toEqual(['tabla-verdad']);
  });

  it('otra materia, o una que se le parece, no trae ninguna', () => {
    for (const nombre of ['Física', 'Arquitectura de Computadoras', 'Análisis Matemático', 'Redes', '', undefined]) expect(calculadorasDe(nombre)).toEqual([]);
    // Análisis Matemático I has its own, and none of Análisis Matemático II's.
    expect(calculadorasDe('Análisis Matemático I').map((c) => c.slug)).toEqual(['graficadora']);
    expect(calculadorasDe('Análisis Matemático II').map((c) => c.slug)).not.toContain('graficadora');
    expect(calculadorasDe('Análisis Matemático II').map((c) => c.slug)).toContain('graficadora-3d');
  });

  it('muestra un enlace a cada una, y nada si no tiene', () => {
    expect(mostrar('Redes de Datos')).toEqual([['Subredes', '/calculadoras/subred'], ['Ventana de congestión', '/calculadoras/ventana-tcp']]);
    expect(caja.querySelector('nav').getAttribute('aria-label')).toBe('Calculadoras de esta materia');
    act(() => raiz.unmount());
    raiz = null;
    expect(mostrar('Arquitectura de Computadoras')).toEqual([]);
    expect(caja.querySelector('nav')).toBe(null);
  });
});
