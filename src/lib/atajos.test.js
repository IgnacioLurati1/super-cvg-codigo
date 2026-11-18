// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ATAJOS, PANTALLAS_CON_ATAJO, atajosDelSitio, pantallaDelAtajo, pantallasConAtajo, teclaLibre } from './atajos';
import { EN_EL_MENU } from './ajustes';
import { PANTALLAS_DEL_MENU } from '../layouts/Menu';

const tecla = (target, extra = {}) => ({ key: 'g', target, defaultPrevented: false, repeat: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, ...extra });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('teclaLibre', () => {
  it('en la página, con los atajos prendidos, sí', () => {
    expect(teclaLibre(tecla(document.body), true)).toBe(true);
  });

  it('con los atajos apagados, nunca', () => {
    expect(teclaLibre(tecla(document.body), false)).toBe(false);
  });

  it('con Ctrl, Alt o Cmd, una tecla repetida o ya usada, no', () => {
    for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }, { defaultPrevented: true }, { isComposing: true }]) {
      expect(teclaLibre(tecla(document.body, extra), true)).toBe(false);
    }
  });

  it('mientras escribís o movés algo con las flechas, no', () => {
    document.body.innerHTML = '<input id="a"><textarea id="b"></textarea><select id="c"></select><div contenteditable="true"><p id="d">x</p></div><div role="tablist"><button id="e">x</button></div><div role="grid"><span id="f">x</span></div>';
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) expect(teclaLibre(tecla(document.getElementById(id)), true)).toBe(false);
  });

  it('con una ventana abierta encima, no', () => {
    document.body.innerHTML = '<dialog open><button id="a">x</button></dialog><button id="b">x</button>';
    expect(teclaLibre(tecla(document.getElementById('b')), true)).toBe(false);
  });

  it('con el panel de la campana abierto, tampoco', () => {
    document.body.innerHTML = '<div role="dialog"><a id="a" href="/">x</a></div><button id="b">x</button>';
    expect(teclaLibre(tecla(document.getElementById('b')), true)).toBe(false);
  });

  it('en un botón o un enlace de la página, sí', () => {
    document.body.innerHTML = '<button id="a">x</button><a id="b" href="/">x</a>';
    expect(teclaLibre(tecla(document.getElementById('a')), true)).toBe(true);
    expect(teclaLibre(tecla(document.getElementById('b')), true)).toBe(true);
  });
});

describe('Alt y un número', () => {
  const alt = (code, extra = {}) => ({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, defaultPrevented: false, ...extra });

  it('lleva a la pantalla de ese número, en cualquier teclado', () => {
    expect(pantallaDelAtajo(alt('Digit1')).a).toBe('/');
    expect(pantallaDelAtajo(alt('Digit6')).a).toBe('/horario');
    expect(pantallaDelAtajo(alt('Digit9')).a).toBe('/configuracion');
    expect(pantallaDelAtajo(alt('Digit0')).a).toBe('/laboratorio');
  });

  it('sin Alt, con AltGr (Ctrl y Alt), con Shift, repetido o con otra tecla, nada', () => {
    for (const e of [alt('Digit1', { altKey: false }), alt('Digit2', { ctrlKey: true }), alt('Digit3', { shiftKey: true }), alt('Digit1', { repeat: true }), alt('Digit0', { ctrlKey: true }), alt('KeyK'), alt('Numpad1')]) {
      expect(pantallaDelAtajo(e)).toBe(null);
    }
  });
});

describe('la lista de atajos', () => {
  it('cada pantalla con su número, del 1 al 9 y el 0, en el orden del menú: la que llegó después no corre a ninguna', () => {
    expect(PANTALLAS_CON_ATAJO.map((p) => p.numero)).toEqual(['1', '2', '3', '4', '5', '6', null, '7', '8', '9', '0', null, null, null, null]);
    expect(PANTALLAS_CON_ATAJO.map((p) => p.a)).toEqual(['/', '/materias', '/calendario', '/buscar', '/resumenes', '/horario', '/sysacad', '/carrera', '/mensajes', '/configuracion', '/laboratorio', '/calculadoras', '/repaso', '/consultron', '/en-vivo']);
  });

  it('con el menú ordenado, los números siguen ese orden: las diez primeras, también Sysacad', () => {
    const orden = ['repaso', 'sysacad', ...EN_EL_MENU.filter((c) => c !== 'repaso' && c !== 'sysacad')];
    const lista = pantallasConAtajo(orden);
    expect(lista.map((p) => p.a)).toEqual(['/repaso', '/sysacad', '/', '/materias', '/calendario', '/buscar', '/resumenes', '/horario', '/carrera', '/mensajes', '/configuracion', '/laboratorio', '/calculadoras', '/consultron', '/en-vivo']);
    expect(lista.map((p) => p.numero)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', null, null, null, null, null]);
  });

  it('Alt y un número llevan a la pantalla que ocupa ese lugar en el menú', () => {
    const alt = (code) => ({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, defaultPrevented: false });
    const orden = ['consultron', ...EN_EL_MENU.filter((c) => c !== 'consultron')];
    expect(pantallaDelAtajo(alt('Digit1'), orden).a).toBe('/consultron');
    expect(pantallaDelAtajo(alt('Digit2'), orden).a).toBe('/');
    // Sysacad, among the ten once the menu is ordered: it takes its number.
    expect(pantallaDelAtajo(alt('Digit8'), orden).a).toBe('/sysacad');
    expect(pantallaDelAtajo(alt('Digit0'), orden).a).toBe('/mensajes');
    // As it came, the same numbers as always.
    expect(pantallaDelAtajo(alt('Digit7'), EN_EL_MENU).a).toBe('/carrera');
  });

  it('Configuración muestra los números como quedan', () => {
    const orden = ['repaso', ...EN_EL_MENU.filter((c) => c !== 'repaso')];
    const deAlt = (grupos) => grupos[0].lista.filter((a) => a.con?.[0] === 'Alt' && a.con[1] !== 'K').map((a) => `${a.con[1]} ${a.texto}`);
    expect(deAlt(atajosDelSitio(orden)).slice(0, 2)).toEqual(['1 Ir a Repaso', '2 Ir a Hoy']);
    expect(deAlt(atajosDelSitio())).toEqual(deAlt(ATAJOS));
    expect(atajosDelSitio(orden).slice(1)).toEqual(ATAJOS.slice(1));
  });

  it('el menú tiene las mismas pantallas, en el mismo orden, que los atajos y Configuración', () => {
    expect(PANTALLAS_DEL_MENU.map((m) => m.a)).toEqual(PANTALLAS_CON_ATAJO.map((p) => p.a));
    expect(PANTALLAS_DEL_MENU.map((m) => m.clave)).toEqual(EN_EL_MENU);
  });

  it('dentro de cada grupo, ninguna combinación repetida', () => {
    for (const { lista } of ATAJOS) {
      const claves = lista.map((a) => (a.teclas ?? a.con).join('+'));
      expect(new Set(claves).size).toBe(claves.length);
    }
  });

  it('solo Escape y lo que va con Alt o Ctrl funcionan con los atajos apagados', () => {
    const siempre = ATAJOS.flatMap((g) => g.lista).filter((a) => a.siempre);
    for (const a of siempre) expect(a.con?.includes('Alt') || a.con?.includes('Ctrl') || a.teclas?.[0] === 'Esc').toBe(true);
  });
});
