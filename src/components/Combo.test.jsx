import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Campo from './Campo';
import Combo from './Combo';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MATERIAS = ['Análisis Matemático I', 'Física I', 'Física II', 'Bases de Datos', 'Sistemas Operativos'].map((nombre, i) => ({ valor: `m${i}`, nombre }));
const MUCHAS = Array.from({ length: 120 }, (_, i) => ({ valor: `c${i}`, nombre: `Carrera ${i}` }));

function Prueba({ opciones = MATERIAS, inicial = '' }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <Campo etiqueta="Materia">
        <Combo opciones={opciones} valor={valor} onCambiar={setValor} todas="Todas las materias" nombreLista="Materias" vacio="No hay materias con ese nombre." limpiar="Quitar la materia" />
      </Campo>
      <output>{valor}</output>
    </>
  );
}

describe('elegir una materia escribiendo', () => {
  let lugar;
  let raiz;
  const campo = () => lugar.querySelector('[role="combobox"]');
  const opciones = () => [...lugar.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  const activa = () => document.getElementById(campo().getAttribute('aria-activedescendant'))?.textContent ?? null;
  const elegido = () => lugar.querySelector('output').textContent;
  const tecla = (key, extra = {}) => act(() => { campo().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })); });
  const escribir = (texto) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo(), texto);
    campo().dispatchEvent(new Event('input', { bubbles: true }));
  });
  const montar = (props) => act(() => raiz.render(<Prueba {...props} />));

  beforeEach(() => {
    lugar = document.createElement('div');
    document.body.append(lugar);
    raiz = createRoot(lugar);
  });
  afterEach(() => {
    act(() => raiz.unmount());
    lugar.remove();
  });

  it('con su etiqueta, y al hacer foco abre la lista entera con «Todas las materias» primero', () => {
    montar();
    expect(lugar.querySelector('label').htmlFor).toBe(campo().id);
    expect(campo().getAttribute('aria-expanded')).toBe('false');
    expect(campo().value).toBe('Todas las materias');
    act(() => campo().focus());
    expect(campo().getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(campo().getAttribute('aria-controls')).getAttribute('role')).toBe('listbox');
    expect(opciones()).toEqual(['Todas las materias', ...MATERIAS.map((m) => m.nombre)]);
    expect(activa()).toBe('Todas las materias');
  });

  it('filtra por palabras sueltas sin acentos, marca lo que coincide y Enter elige la primera', () => {
    montar();
    act(() => campo().focus());
    escribir('FISICA ii');
    expect(opciones()).toEqual(['Todas las materias', 'Física II']);
    expect([...lugar.querySelectorAll('[role="option"] mark')].map((m) => m.textContent)).toEqual(['Física', 'II']);
    expect(activa()).toBe('Física II');
    expect(lugar.querySelector('[role="status"]').textContent).toBe('Una coincidencia');
    tecla('Enter');
    expect(elegido()).toBe('m2');
    expect(campo().value).toBe('Física II');
    expect(campo().getAttribute('aria-expanded')).toBe('false');
  });

  it('flechas, Inicio y Fin se mueven por la lista; Escape cierra y vuelve a lo elegido', () => {
    montar({ inicial: 'm1' });
    act(() => campo().focus());
    expect(activa()).toBe('Física I');
    tecla('ArrowDown');
    expect(activa()).toBe('Física II');
    tecla('End');
    expect(activa()).toBe('Sistemas Operativos');
    tecla('ArrowDown');
    expect(activa()).toBe('Todas las materias');
    tecla('ArrowUp');
    tecla('Home');
    expect(activa()).toBe('Todas las materias');
    escribir('bases');
    tecla('Escape');
    expect(campo().value).toBe('Física I');
    expect(campo().getAttribute('aria-expanded')).toBe('false');
    expect(elegido()).toBe('m1');
    tecla('ArrowDown');
    expect(campo().getAttribute('aria-expanded')).toBe('true');
  });

  it('«Todas las materias» borra lo elegido, igual que el botón chico', () => {
    montar({ inicial: 'm3' });
    act(() => campo().focus());
    tecla('Home');
    tecla('Enter');
    expect(elegido()).toBe('');
    expect(lugar.querySelector('.combo__limpiar')).toBeNull();
    // Another one, with the choice made.
    act(() => raiz.render(<Prueba key="otra" inicial="m3" />));
    const quitar = lugar.querySelector('.combo__limpiar');
    expect(quitar.textContent).toBe('Quitar la materia');
    act(() => quitar.click());
    expect(elegido()).toBe('');
    expect(document.activeElement).toBe(campo());
    expect(campo().getAttribute('aria-expanded')).toBe('false');
  });

  it('un clic en una opción la elige; sin coincidencias lo dice', () => {
    montar();
    act(() => campo().focus());
    escribir('quimica');
    expect(opciones()).toEqual(['Todas las materias']);
    expect(lugar.querySelector('.combo__nota').textContent).toBe('No hay materias con ese nombre.');
    expect(lugar.querySelector('[role="status"]').textContent).toBe('No hay materias con ese nombre.');
    escribir('datos');
    act(() => lugar.querySelectorAll('[role="option"]')[1].click());
    expect(elegido()).toBe('m3');
  });

  it('con muchas, muestra las primeras 50 y pide escribir para ver más', () => {
    montar({ opciones: MUCHAS });
    act(() => campo().focus());
    expect(opciones()).toHaveLength(51);
    expect(lugar.querySelector('.combo__nota').textContent).toBe('Escribí para ver más');
    escribir('carrera 11');
    expect(opciones()).toEqual(['Todas las materias', 'Carrera 11', 'Carrera 110', 'Carrera 111', 'Carrera 112', 'Carrera 113', 'Carrera 114', 'Carrera 115', 'Carrera 116', 'Carrera 117', 'Carrera 118', 'Carrera 119']);
    expect(lugar.querySelector('.combo__nota')).toBeNull();
  });
});
