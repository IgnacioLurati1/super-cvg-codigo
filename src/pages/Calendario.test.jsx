import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cambiarAjustes, elegirVista, volverAjustesOriginales } from '../lib/ajustes';
import { cargarMes, cargarNombres } from '../lib/campus';
import Calendario from './Calendario';

vi.mock('../lib/campus', () => ({ cargarMes: vi.fn(), cargarNombres: vi.fn() }));
vi.mock('../lib/calendarioSincro', () => ({ useCalendarioGoogle: () => ({ prendido: false }) }));
vi.mock('../components/CalendarioGoogle', () => ({ BotonCalendarioGoogle: () => null, EstadoCalendarioGoogle: () => null }));
vi.mock('../components/ui', () => ({ useUI: () => ({ avisar: () => {} }) }));
vi.mock('../lib/seo', () => ({ tituloDe: (t) => t, useSeo: () => {} }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The campus' answers, held until the test lets each one go.
function campusLento() {
  const pendientes = [];
  cargarMes.mockImplementation(() => new Promise((resolve, reject) => pendientes.push({ resolve, reject })));
  cargarNombres.mockResolvedValue({});
  return {
    responder: () => act(async () => pendientes.shift().resolve([])),
    fallar: () => act(async () => pendientes.shift().reject(new Error('sin red'))),
  };
}

describe('calendario: el esqueleto nunca junto a la grilla', () => {
  let raiz;
  let lugar;
  const hay = (selector) => Boolean(lugar.querySelector(selector));
  const abrir = () => act(() => raiz.render(<MemoryRouter initialEntries={['/calendario?dia=2026-11-12']}><Calendario /></MemoryRouter>));

  beforeEach(() => {
    localStorage.clear();
    lugar = document.createElement('div');
    document.body.append(lugar);
    raiz = createRoot(lugar);
  });
  afterEach(() => {
    act(() => raiz.unmount());
    lugar.remove();
    volverAjustesOriginales();
    vi.clearAllMocks();
  });

  it('en el mes: hasta la primera respuesta solo el esqueleto, después solo la grilla', async () => {
    const campus = campusLento();
    abrir();
    expect(hay('.cargando')).toBe(true);
    expect(hay('table.cal')).toBe(false);
    expect(hay('.cal__detalle')).toBe(false);
    await campus.responder();
    expect(hay('.cargando')).toBe(false);
    expect(hay('table.cal')).toBe(true);
  });

  it('pasar a otro mes deja la grilla a la vista, sin esqueleto, mientras llega', async () => {
    const campus = campusLento();
    abrir();
    await campus.responder();
    act(() => lugar.querySelector('button[aria-label="Mes siguiente"]').click());
    expect(cargarMes).toHaveBeenLastCalledWith(2026, 12);
    expect(hay('.cargando')).toBe(false);
    expect(hay('table.cal')).toBe(true);
    await campus.responder();
    expect(hay('table.cal')).toBe(true);
  });

  it('en la semana: lo mismo con sus columnas', async () => {
    elegirVista('calendario', 'semana');
    const campus = campusLento();
    abrir();
    expect(hay('.cargando')).toBe(true);
    expect(hay('ol.cal-semana')).toBe(false);
    await campus.responder();
    expect(hay('.cargando')).toBe(false);
    expect(hay('ol.cal-semana')).toBe(true);
  });

  it('si el campus falla, la grilla queda con el aviso, y probar de nuevo no trae el esqueleto', async () => {
    const campus = campusLento();
    abrir();
    await campus.fallar();
    expect(hay('[role="alert"]')).toBe(true);
    expect(hay('table.cal')).toBe(true);
    act(() => lugar.querySelector('[role="alert"] button').click());
    expect(hay('.cargando')).toBe(false);
    expect(hay('table.cal')).toBe(true);
  });
});

describe('calendario: lo de la facultad pinta la casilla entera', () => {
  let raiz;
  let lugar;

  beforeEach(() => {
    localStorage.clear();
    lugar = document.createElement('div');
    document.body.append(lugar);
    raiz = createRoot(lugar);
    cargarMes.mockResolvedValue([]);
    cargarNombres.mockResolvedValue({});
  });
  afterEach(() => {
    act(() => raiz.unmount());
    lugar.remove();
    volverAjustesOriginales();
    vi.clearAllMocks();
  });

  // November 2026: the fifth exam call from the 16th to the 19th, a holiday on the 23rd, no classes on the 26th and the
  // end of the second cuatrimestre on the 13th (src/data/facultad/calendario.js).
  it('mesas, feriados, días sin clases y fin de cuatrimestre, y las mesas fuera de «Todo el mes»', async () => {
    await act(async () => raiz.render(<MemoryRouter initialEntries={['/calendario?dia=2026-11-12']}><Calendario /></MemoryRouter>));
    const casilla = (n) => [...lugar.querySelectorAll('.cal__dia:not([data-fuera])')].find((b) => b.querySelector('.cal__numero').textContent === String(n));

    for (const n of [16, 17, 18, 19]) {
      expect(casilla(n).dataset.facultad).toBe('examen');
      expect(casilla(n).querySelector('.cal__marca').textContent).toBe('Mesa de examen');
      expect(casilla(n).getAttribute('aria-label')).toContain('Mesa de examen');
      expect(casilla(n).querySelector('.cal__chips')).toBe(null);
    }
    expect(casilla(23).dataset.facultad).toBe('libre');
    expect(casilla(23).querySelector('.cal__marca').textContent).toMatch(/, feriado$/);
    expect(casilla(26).dataset.facultad).toBe('libre');
    expect(casilla(26).querySelector('.cal__marca').textContent).toMatch(/, sin clases$/);
    expect(casilla(13).dataset.facultad).toBe('cuatrimestre');
    expect(casilla(13).querySelector('.cal__marca').textContent).toBe('Termina el segundo cuatrimestre');
    expect(casilla(12).dataset.facultad).toBe(undefined);

    const todoElMes = [...lugar.querySelectorAll('h2')].find((h) => h.textContent === 'Todo el mes').parentElement;
    expect(todoElMes.textContent).not.toContain('Mesa de examen');
    expect(todoElMes.textContent).toContain('Consultas para las mesas de examen');
  });

  it('en «Todo el mes» lo de la facultad va abajo: las entregas primero, aunque sean después', async () => {
    const tp = { id: 501, titulo: 'TP de prueba', cuando: Math.floor(new Date(2026, 10, 20, 12).getTime() / 1000), materia: 'Materia A', materiaId: 1, tipo: 'entrega', vencimiento: true, url: null };
    cargarMes.mockImplementation((anio, mes) => Promise.resolve(mes === 11 ? [tp] : []));
    await act(async () => raiz.render(<MemoryRouter initialEntries={['/calendario?dia=2026-11-12']}><Calendario /></MemoryRouter>));
    const todoElMes = [...lugar.querySelectorAll('h2')].find((h) => h.textContent === 'Todo el mes').parentElement;
    const titulos = [...todoElMes.querySelectorAll('.eventos > li')].map((li) => li.textContent);
    expect(titulos[0]).toContain('TP de prueba');
    expect(titulos.findIndex((t) => t.includes('Consultas para las mesas'))).toBeGreaterThan(0);
  });
});

describe('calendario en el celular: puntos, leyenda y acciones detrás de «…»', () => {
  let raiz;
  let lugar;
  const cuando = (dia, hora) => Math.floor(new Date(2026, 10, dia, hora).getTime() / 1000);
  const ev = (id, dia, tipo, extra = {}) => ({ id, titulo: `Cosa ${id}`, cuando: cuando(dia, 8 + id % 10), materia: 'Materia A', materiaId: 1, tipo, url: null, ...extra });

  beforeEach(() => {
    localStorage.clear();
    lugar = document.createElement('div');
    document.body.append(lugar);
    raiz = createRoot(lugar);
    cargarNombres.mockResolvedValue({});
  });
  afterEach(() => {
    act(() => raiz.unmount());
    lugar.remove();
    volverAjustesOriginales();
    vi.clearAllMocks();
  });
  const abrir = () => act(async () => raiz.render(<MemoryRouter initialEntries={['/calendario?dia=2026-11-12']}><Calendario /></MemoryRouter>));
  const casilla = (n) => [...lugar.querySelectorAll('.cal__dia:not([data-fuera])')].find((b) => b.querySelector('.cal__numero').textContent === String(n));

  it('cada cosa del día es un punto con el color de su tipo; con más de cuatro, tres y «+N»; el botón dice todo', async () => {
    cargarMes.mockImplementation((anio, mes) => Promise.resolve(mes === 11
      ? [ev(1, 10, 'parcial'), ev(2, 10, 'entrega'), ev(3, 10, 'otro'), ev(4, 10, 'final'), ev(5, 10, 'otro'), ev(6, 11, 'entrega'), ev(7, 11, 'otro')]
      : []));
    await abrir();
    const diez = casilla(10);
    const puntos = [...diez.querySelectorAll('.cal__punto')];
    expect(puntos.map((p) => p.dataset.tipo)).toEqual(['parcial', 'final', 'entrega']);
    expect(diez.querySelector('.cal__puntos-mas').textContent).toBe('+2');
    expect(diez.querySelector('.cal__puntos').getAttribute('aria-hidden')).toBe('true');
    expect(diez.getAttribute('aria-label')).toBe('martes, 10 de noviembre, 5 actividades, con parcial, final y entrega');

    const once = casilla(11);
    const deOnce = [...once.querySelectorAll('.cal__punto')];
    expect(deOnce).toHaveLength(2);
    expect(deOnce[1].dataset.tipo).toBe(undefined);
    expect(deOnce[1].dataset.materia).toBeDefined();
    expect(once.querySelector('.cal__puntos-mas')).toBe(null);

    // The legend says only what this month has: these kinds and the academic calendar's days.
    const leyenda = lugar.querySelector('.cal-leyenda');
    expect(leyenda.getAttribute('aria-hidden')).toBe('true');
    expect([...leyenda.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Parcial', 'Final', 'Entrega', 'Sin clases', 'Mesas de examen', 'Fin del cuatrimestre']);
  });

  it('sin el calendario académico ni fechas, no hay leyenda', async () => {
    cargarMes.mockResolvedValue([]);
    act(() => cambiarAjustes({ facultad: false }));
    await abrir();
    expect(lugar.querySelector('.cal-leyenda')).toBe(null);
    expect(lugar.querySelector('.cal__puntos')).toBe(null);
  });

  it('«…» abre y cierra con lo demás: Esc devuelve el foco, tocar afuera lo cierra', async () => {
    cargarMes.mockResolvedValue([ev(1, 10, 'parcial')]);
    await abrir();
    const mas = lugar.querySelector('button[aria-label="Más acciones"]');
    const resto = mas.parentElement;
    expect(mas.getAttribute('aria-expanded')).toBe('false');
    expect(lugar.querySelector(`#${mas.getAttribute('aria-controls')}`).textContent).toContain('Bajar para tu calendario');

    act(() => mas.click());
    expect(mas.getAttribute('aria-expanded')).toBe('true');
    expect(resto.hasAttribute('data-abierto')).toBe(true);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(mas.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(mas);

    act(() => mas.click());
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(mas.getAttribute('aria-expanded')).toBe('false');
  });
});
