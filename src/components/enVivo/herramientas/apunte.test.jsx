import { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Apunte from './Apunte';

// The reader and its waiting sheet are not what is tried here (and pdf.js does not load in jsdom).
vi.mock('./apunte/LectorCompartido', () => ({ default: () => null }));
vi.mock('./apunte/ImagenCompartida', () => ({ default: () => null }));
vi.mock('../../lector/Espera', () => ({ default: () => null }));
// What became of a file of this browser after a reload (recuperar.js), as each test says.
let volver = null;
vi.mock('../../../lib/enVivo/recuperar', () => ({ recuperacion: () => volver }));

// While a shared file is on its way: from whoever has it, and what to do when nobody does. A reload is not leaving.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ARCHIVO = '0123456789abcdef';
let caja = null;
let raiz = null;
afterEach(() => {
  act(() => raiz.unmount());
  caja.remove();
  volver = null;
});

// `quien`: what the session says of whoever shared it (sesion.js `presente`); `estado`: what it says of the file.
function esperando({ de = 'ana', quien, estado = {}, mesa: cambios = {} }) {
  const doc = new Y.Doc();
  const datos = doc.getMap('datos');
  datos.set('archivo', ARCHIVO);
  datos.set('nombre', 'Introducción a los AG');
  datos.set('de', de);
  const mesa = {
    doc,
    datos,
    yo: { id: 'yo', nombre: 'Vos' },
    presente: (id) => (id === 'yo' ? { nombre: 'Vos', desde: 0 } : quien),
    archivos: { pedir: () => new Promise(() => {}), estado: () => ({ tiene: false, parte: 0, de: 0, hay: 0, nadie: false, ...estado }), compartir: vi.fn(() => ARCHIVO) },
    paraGuardar: () => undefined,
    ...cambios,
  };
  caja = document.body.appendChild(document.createElement('div'));
  raiz = createRoot(caja);
  act(() => raiz.render(<Apunte mesa={mesa} />));
  return { texto: caja.querySelector('.apunte-vivo__llegando p')?.textContent, mesa };
}
const otraVez = () => {
  act(() => raiz.unmount());
  caja.remove();
};

describe('Apunte de la mesa, mientras llega', () => {
  it('dice de quién viene, también mientras puede estar recargando', () => {
    expect(esperando({ quien: { nombre: 'Ana', desde: 1 }, estado: { hay: 1 } }).texto).toBe('Trayendo «Introducción a los AG» de Ana');
    otraVez();
    expect(esperando({ quien: { nombre: 'Ana', volviendo: true } }).texto).toBe('Trayendo «Introducción a los AG» de Ana');
  });

  it('una sesión de antes de `presente` (el sitio se actualizó debajo) no traba la pestaña', () => {
    const { texto } = esperando({ quien: null, mesa: { presente: undefined } });
    expect(texto).toBe('Trayendo «Introducción a los AG»');
    expect(caja.textContent).not.toMatch(/se trabó/);
  });

  it('si nadie lo tiene, espera a quien lo compartió; si se fue, lo dice', () => {
    expect(esperando({ quien: { nombre: 'Ana', desde: 1 }, estado: { nadie: true } }).texto).toBe('Nadie de la sesión tiene «Introducción a los AG». Esperando que Ana lo vuelva a subir.');
    otraVez();
    expect(esperando({ quien: null, estado: { nadie: true } }).texto).toBe('Quien compartió «Introducción a los AG» se fue de la sesión y nadie más lo tiene.');
    otraVez();
    // Gone, but someone else still has it.
    expect(esperando({ quien: null, estado: { hay: 1 } }).texto).toBe('Trayendo «Introducción a los AG»');
  });

  it('quien recargó lo recupera de los demás o de donde vino, sin tocar nada', () => {
    expect(esperando({ de: 'yo', estado: { hay: 2 } }).texto).toBe('Recargaste la página. Trayendo «Introducción a los AG» de los demás.');
    otraVez();
    volver = 'trayendo';
    expect(esperando({ de: 'yo', estado: { nadie: true } }).texto).toBe('Recargaste la página. Trayendo «Introducción a los AG» de nuevo.');
    expect(caja.querySelector('button')).toBeNull();
  });

  it('subido de su compu y nadie más lo tenía: lo elige de nuevo y vuelve a la misma pestaña', () => {
    volver = 'elegir';
    const { texto, mesa } = esperando({ de: 'yo', estado: { nadie: true } });
    expect(texto).toBe('Recargaste la página y nadie más tenía «Introducción a los AG». Elegilo de nuevo y le llega a todos.');
    const boton = [...caja.querySelectorAll('button')].find((b) => b.textContent === 'Elegir el archivo de nuevo');
    expect(boton).toBeTruthy();
    const campo = caja.querySelector('input[type="file"]');
    const archivo = new File(['%PDF-1.4'], 'otro nombre.pdf', { type: 'application/pdf' });
    Object.defineProperty(campo, 'files', { value: [archivo], configurable: true });
    act(() => campo.dispatchEvent(new Event('change', { bubbles: true })));
    expect(mesa.archivos.compartir).toHaveBeenCalledWith(archivo, 'Introducción a los AG', ARCHIVO);
    otraVez();
    volver = 'falla';
    expect(esperando({ de: 'yo', estado: { nadie: true } }).texto).toBe('No se pudo traer «Introducción a los AG» de nuevo. Elegilo de tu compu y le llega a todos.');
    expect(caja.textContent).toMatch('Elegir el archivo de nuevo');
  });
});
