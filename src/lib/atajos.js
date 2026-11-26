import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { EN_EL_MENU, useAjustes } from './ajustes';

// The keyboard shortcuts of the site, listed once: Configuración shows this same list.
//   Alt and a number go to each screen, in the order of the menu, and always work (they need Alt, so they never fire
//   by accident). The ones of one key («/», «?», those of a page) can be turned off in Configuración (WCAG 2.1.4: a
//   screen reader user types letters to move around the page). None fires inside an open window.
//   `teclas`: one key alone. `con`: pressed together (Alt and K).

// The screens, by their key in the menu (ajustes.js, EN_EL_MENU), with the name the shortcut says.
const PANTALLAS = [
  { clave: 'hoy', a: '/', nombre: 'Hoy' },
  { clave: 'materias', a: '/materias', nombre: 'Materias' },
  { clave: 'calendario', a: '/calendario', nombre: 'Calendario' },
  { clave: 'buscar', a: '/buscar', nombre: 'Buscar' },
  { clave: 'resumenes', a: '/resumenes', nombre: 'Resúmenes' },
  { clave: 'horario', a: '/horario', nombre: 'Tu horario' },
  { clave: 'sysacad', a: '/sysacad', nombre: 'Sysacad' },
  { clave: 'carrera', a: '/carrera', nombre: 'Tu carrera' },
  { clave: 'mensajes', a: '/mensajes', nombre: 'Mensajes' },
  { clave: 'configuracion', a: '/configuracion', nombre: 'Configuración' },
  { clave: 'laboratorio', a: '/laboratorio', nombre: 'Laboratorio' },
  { clave: 'calculadoras', a: '/calculadoras', nombre: 'Calculadoras' },
  { clave: 'repaso', a: '/repaso', nombre: 'Repaso' },
  { clave: 'consultron', a: '/consultron', nombre: 'Consultron' },
  { clave: 'envivo', a: '/en-vivo', nombre: 'En vivo' },
  { clave: 'disenos', a: '/disenos', nombre: 'Diseños' },
  { clave: 'pizarron', a: '/escaner', nombre: 'Escáner' },
];

/**
 * The screens in the order of the menu, each with its number for Alt (1 to 9, then 0) or null: past the tenth there are
 * no numbers left. Hidden ones keep theirs. `orden`: the order the student chose (ajustes.js, `menu.orden`).
 * While the menu keeps the order it came with, Sysacad goes without a number: it came after the ten were taken, and the
 * ones after it keep the numbers they always had. Once the student orders the menu, the numbers follow it.
 */
export function pantallasConAtajo(orden = EN_EL_MENU) {
  const comoVino = orden.length === EN_EL_MENU.length && orden.every((c, i) => c === EN_EL_MENU[i]);
  let usados = 0;
  return orden.map((c) => PANTALLAS.find((p) => p.clave === c)).filter(Boolean).map((p) => {
    const conNumero = !(comoVino && p.clave === 'sysacad') && usados < 10;
    if (conNumero) usados += 1;
    return { ...p, numero: conNumero ? String(usados % 10) : null };
  });
}

export const PANTALLAS_CON_ATAJO = pantallasConAtajo();

/** The shortcuts of the site, with Alt and a number as the menu goes now. */
export const atajosDelSitio = (orden = EN_EL_MENU) => [
  {
    grupo: 'En todo el sitio',
    lista: [
      { con: ['Alt', 'K'], texto: 'Abrir el menú rápido', siempre: true },
      ...pantallasConAtajo(orden).filter((p) => p.numero).map((p) => ({ con: ['Alt', p.numero], texto: `Ir a ${p.nombre}`, siempre: true })),
      { teclas: ['/'], texto: 'Buscar en todas tus materias' },
      { teclas: ['?'], texto: 'Ver estos atajos' },
      { teclas: ['Esc'], texto: 'Cerrar lo que está abierto', siempre: true },
    ],
  },
  ...ATAJOS.slice(1),
];

// The first group is the one of the menu as it came: atajosDelSitio gives it as the student ordered it.
export const ATAJOS = [
  {
    grupo: 'En todo el sitio',
    lista: [
      { con: ['Alt', 'K'], texto: 'Abrir el menú rápido', siempre: true },
      ...PANTALLAS_CON_ATAJO.filter((p) => p.numero).map((p) => ({ con: ['Alt', p.numero], texto: `Ir a ${p.nombre}`, siempre: true })),
      { teclas: ['/'], texto: 'Buscar en todas tus materias' },
      { teclas: ['?'], texto: 'Ver estos atajos' },
      { teclas: ['Esc'], texto: 'Cerrar lo que está abierto', siempre: true },
    ],
  },
  {
    grupo: 'En el calendario',
    lista: [
      { teclas: ['←'], texto: 'Mes o semana anterior' },
      { teclas: ['→'], texto: 'Mes o semana siguiente' },
      { teclas: ['T'], texto: 'Volver a hoy' },
    ],
  },
  {
    grupo: 'En el laboratorio',
    lista: [
      { con: ['Ctrl', 'Enter'], texto: 'Correr el código', siempre: true },
      { con: ['Ctrl', '.'], texto: 'Parar lo que corre', siempre: true },
      { con: ['Ctrl', 'B'], texto: 'Mostrar u ocultar tus archivos', siempre: true },
      { con: ['Ctrl', 'J'], texto: 'Mostrar u ocultar el panel de abajo', siempre: true },
      { con: ['Alt', 'AvPág'], texto: 'Pasar a la pestaña siguiente', siempre: true },
      { con: ['Alt', 'RePág'], texto: 'Volver a la pestaña anterior', siempre: true },
      { teclas: ['Esc', 'Tab'], texto: 'Salir del editor', siempre: true },
      { teclas: ['←'], texto: 'Paso anterior, en el paso a paso' },
      { teclas: ['→'], texto: 'Paso siguiente, en el paso a paso' },
    ],
  },
  {
    grupo: 'En Consultron',
    lista: [{ teclas: ['Esc'], texto: 'Frenar la respuesta', siempre: true }],
  },
  {
    grupo: 'En tu horario',
    lista: [
      { teclas: ['1'], texto: 'Primer cuatrimestre' },
      { teclas: ['2'], texto: 'Segundo cuatrimestre' },
    ],
  },
  {
    grupo: 'En el Escáner',
    lista: [{ con: ['Ctrl', 'Z'], texto: 'Deshacer el último trazo con el dedo', siempre: true }],
  },
];

// Where a key belongs to what has the focus: fields, lists and anything that moves with the arrows.
const PROPIO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="slider"], [role="grid"], [role="menu"], [role="tablist"]';
// A <dialog> open, or a panel that is one only while it's shown (the bell's).
const ventanaAbierta = () => Boolean(document.querySelector('dialog[open], [role="dialog"]'));

/** Whether a key press is free for a one-key shortcut: shortcuts on, no Ctrl, Alt or Cmd, nothing being typed, and no
 * window open over the page. */
export function teclaLibre(e, prendidos) {
  if (!prendidos || e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return false;
  if (e.target instanceof Element && e.target.closest(PROPIO)) return false;
  return !ventanaAbierta();
}

/** The screen of Alt and a number, or null. By the key's position (Digit1 to Digit0), so it is the same on any keyboard
 * and on a Mac with Option. AltGr is Ctrl and Alt on Windows: it writes characters and is left alone. `orden`: the order
 * of the menu. */
export function pantallaDelAtajo(e, orden = EN_EL_MENU) {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.defaultPrevented) return null;
  const numero = /^Digit([0-9])$/.exec(e.code ?? '')?.[1];
  return (numero && pantallasConAtajo(orden).find((p) => p.numero === numero)) || null;
}

/** Alt and a number to go to each screen, «/» to search and «?» for the list. In Layout, only with a session. */
export function useAtajosGlobales(activo) {
  const navegar = useNavigate();
  const { atajos, menu } = useAjustes();
  const { orden } = menu;
  useEffect(() => {
    if (!activo) return undefined;
    const enfocar = (selector) => {
      // The page may still be arriving, or the element still hidden (a closed section of Configuración): a few tries
      // until it takes the focus, then nothing.
      let intentos = 20;
      const probar = () => {
        const el = document.querySelector(selector);
        el?.focus();
        if (el && document.activeElement === el) return;
        if (--intentos > 0) setTimeout(probar, 50);
      };
      probar();
    };
    const alTeclear = (e) => {
      const destino = pantallaDelAtajo(e, orden);
      if (destino) {
        if (ventanaAbierta()) return;
        e.preventDefault();
        // Layout moves the focus to the new page, as with any link.
        navegar(destino.a);
        return;
      }
      // A screen that is the whole page (a live session, `data-sin-atajos`) keeps its keys: «/» there is text.
      if (!teclaLibre(e, atajos) || document.querySelector('[data-sin-atajos]')) return;
      if (e.key === '/') {
        e.preventDefault();
        navegar('/buscar');
        enfocar('.buscar input[type="search"]');
      } else if (e.key === '?') {
        e.preventDefault();
        navegar('/configuracion#atajos');
        enfocar('#atajos');
      }
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [activo, atajos, navegar, orden]);
}


/** A page's own one-key shortcuts: `mapa` goes from the key (as `e.key`) to what it does. */
export function useAtajosDePagina(mapa) {
  const { atajos } = useAjustes();
  // The latest one: what each key does changes with the page's state, the listener stays.
  const actual = useRef(mapa);
  useEffect(() => {
    actual.current = mapa;
  });
  useEffect(() => {
    if (!atajos) return undefined;
    const alTeclear = (e) => {
      if (!teclaLibre(e, true)) return;
      const hacer = actual.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!hacer) return;
      e.preventDefault();
      hacer();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [atajos]);
}
