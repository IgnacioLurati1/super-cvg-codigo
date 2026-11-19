import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALINEACIONES_DEL_MENU, ANCHOS_DEL_MENU, EN_EL_MENU, POSICIONES_DEL_MENU, movimientoDe, ordenarMenu, ordenValido, ponerPosicionDelMenu } from './ajustes';
import { APARIENCIA_CONSULTRON, LAB_TAMANO, LETRAS_DE_CODIGO, SIEMPRE_OSCUROS, cambioDeBordes, cambioDeEstilo, ALTO_CONSULTRON, BRILLO_PDF, CLAVE_AJUSTES, OPCIONES, ORIGINALES, PANEL_CONSULTRON, PANEL_PDF, PDF_CLAROS, RINCON_CONSULTRON, VISTAS, ajustesActuales, alternarPdfOscuro, cambiarAjustes, contraste, cuestaLeerSobre, elegirVista, normalizar, pdfOscuro, textoSobre, useVista, volverAjustesOriginales } from './ajustes';
import { ESTILOS_DE_TARJETA } from './tarjetas';

const leerArchivo = (ruta) => readFileSync(resolve(import.meta.dirname, ruta), 'utf8');
const CSS = leerArchivo('../styles/tokens.css');
const SCRIPT = leerArchivo('../../public/ajustes.js');

// Each `:root…` block with the attributes it requires, so the cascade can be computed without a browser.
const BLOQUES = [...CSS.matchAll(/(:root[^{]*)\{([^}]*)\}/g)].map(([, selector, cuerpo]) => ({
  condiciones: [...selector.matchAll(/\[data-([a-z]+)='([^']+)'\]/g)].map(([, a, v]) => [a, v]),
  variables: Object.fromEntries([...cuerpo.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, n, v]) => [n, v.trim()])),
}));

function tokens(atributos) {
  const aplican = BLOQUES.filter((b) => b.condiciones.every(([a, v]) => atributos[a] === v));
  // Same selector shape, so more attributes wins and then the later one. The sort is stable.
  aplican.sort((a, b) => a.condiciones.length - b.condiciones.length);
  return Object.assign({}, ...aplican.map((b) => b.variables));
}

const canales = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const aHex = (c) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
// What `color-mix(in srgb, color N%, surface)` gives, and how much of its color a tinted card of Materias takes.
const mezcla = (color, superficie, parte) => {
  const s = canales(superficie);
  return aHex(canales(color).map((v, i) => v * parte + s[i] * (1 - parte)));
};
const TINTE_DE_TARJETA = Number(/--tinte-tarjeta:\s*([\d.]+)%/.exec(leerArchivo('../pages/materias.css'))[1]) / 100;
// And a row of a course, tinted with its kind's color (propio.css, ajustes.contenido «Teñido»).
const TINTE_DE_FILA = Number(/--tinte-fila:\s*([\d.]+)%/.exec(leerArchivo('../pages/propio.css'))[1]) / 100;
// «Notas» takes more of it.
const TINTE_DE_NOTA = Number(/--tinte-nota:\s*([\d.]+)%/.exec(leerArchivo('../pages/propio.css'))[1]) / 100;
// What `color-mix(in srgb, color 13%, surface)` gives.
const fondoDeSimbolo = (color, superficie) => {
  const s = canales(superficie);
  return aHex(canales(color).map((v, i) => v * 0.13 + s[i] * 0.87));
};

// Simulated color vision: Machado, Oliveira and Fernandes 2009, severity 1, over linear RGB. Then distance in Oklab.
const MATRICES = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const lineal = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const simulado = (color, vision) => {
  const l = canales(color).map(lineal);
  return MATRICES[vision].map((f) => Math.min(1, Math.max(0, f[0] * l[0] + f[1] * l[1] + f[2] * l[2])));
};
// The color as that vision sees it, back in sRGB, to measure contrast with it.
const vistoCon = (color, vision) => aHex(simulado(color, vision).map((c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
function comoSeVe(color, vision) {
  const [r, g, b] = simulado(color, vision);
  const [x, y, z] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  return [
    0.2104542553 * x + 0.793617785 * y - 0.0040720468 * z,
    1.9779984951 * x - 2.428592205 * y + 0.4505937099 * z,
    0.0259040371 * x + 0.7827717662 * y - 0.808675766 * z,
  ].map((v) => v * 100);
}
const distancia = (a, b, vision) => Math.hypot(...comoSeVe(a, vision).map((v, i) => v - comoSeVe(b, vision)[i]));

// «Rosa oscuro» is the dark theme plus `data-paleta='rosa'`.
const PALETAS = { rosa: 'oscuro', bosque: 'oscuro', cafe: 'oscuro', lavanda: 'claro', infierno: 'oscuro', glaciar: 'oscuro' };
const TEMAS = ['claro', 'oscuro', ...Object.keys(PALETAS)];
// What <html> says for a theme with a style: a palette goes with every style, and an always-dark one is dark with any.
const marcas = (tema, estilo) => {
  const base = SIEMPRE_OSCUROS.includes(estilo) ? 'oscuro' : PALETAS[tema] ?? tema;
  return PALETAS[tema] ? { tema: base, paleta: tema } : { tema: base };
};
// With a color-blind palette, six that vision tells apart; then they repeat (tokens.css). Without one, ten.
const COLORES_MATERIA = [0, 1, 2, 3, 4, 5].map((n) => `--materia-${n}`);
const TODAS_LAS_MATERIAS = Array.from({ length: 10 }, (_, n) => `--materia-${n}`);
const COLORES_ESTADO = ['--error', '--ok', '--aviso'];

// Each style with the themes it can have: some are always dark (public/ajustes.js).
// Every style with its themes and palettes. The always-dark ones don't have Claro, and take Lavanda in its dark version.
const ESTILOS_Y_TEMAS = OPCIONES.estilo.flatMap((estilo) => (SIEMPRE_OSCUROS.includes(estilo) ? TEMAS.filter((t) => t !== 'claro') : TEMAS).map((tema) => [estilo, tema]));

const combinaciones = [];
for (const [estilo, tema] of ESTILOS_Y_TEMAS) {
  for (const contraste_ of OPCIONES.contraste) {
    for (const daltonismo of OPCIONES.daltonismo) combinaciones.push({ estilo, ...marcas(tema, estilo), contraste: contraste_, daltonismo });
  }
}
// «Sensible a la luz» changes the light themes' surfaces: each one again with it.
for (const c of combinaciones.filter((x) => x.tema === 'claro')) combinaciones.push({ ...c, luz: 'si' });
// The visions each palette is made for, and the usual one.
const VISIONES = { ninguno: ['normal'], 'rojo-verde': ['protan', 'deutan', 'normal'], 'azul-amarillo': ['tritan', 'normal'] };
const FONDOS = ['--fondo', '--superficie', '--superficie-2'];
const nombre = (c) => `${c.estilo}, ${c.paleta ?? c.tema}, contraste ${c.contraste}, daltonismo ${c.daltonismo}${c.luz ? ', sensible a la luz' : ''}`;

describe('tokens', () => {
  // On the page, the cards and what sits sunk, each style with its own background, and as the palette's vision sees them.
  it.each(combinaciones.map((c) => [nombre(c), c]))('materias y estados se ven sobre su fondo: %s', (_, c) => {
    const t = tokens(c);
    for (const vision of VISIONES[c.daltonismo]) {
      for (const fondo of FONDOS) {
        const sobre = vistoCon(t[fondo], vision);
        for (const v of TODAS_LAS_MATERIAS) {
          expect(contraste(vistoCon(t[v], vision), sobre), `${v} sobre ${fondo}, visión ${vision}`).toBeGreaterThanOrEqual(3);
        }
        for (const v of COLORES_ESTADO) {
          expect(contraste(vistoCon(t[v], vision), sobre), `${v} sobre ${fondo}, visión ${vision}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    for (const v of [...TODAS_LAS_MATERIAS, ...COLORES_ESTADO]) {
      expect(contraste(t[v], t['--superficie']), `${v} sobre superficie`).toBeGreaterThanOrEqual(3);
      expect(contraste(t[v], fondoDeSimbolo(t[v], t['--superficie'])), `${v} sobre su símbolo`).toBeGreaterThanOrEqual(3);
    }
  });

  // Materias, the «Teñida» card and the stamp of «Sello» (materias.css): the color of the course mixed into the surface.
  // The name and what it has, in the usual text, read on it. «Portada» takes the tint of a symbol's box, checked above.
  it.each(combinaciones.map((c) => [nombre(c), c]))('las tarjetas teñidas se leen: %s', (_, c) => {
    const t = tokens(c);
    const minimoSuave = c.contraste === 'alto' ? 7 : 4.5;
    for (const v of TODAS_LAS_MATERIAS) {
      const fondo = mezcla(t[v], t['--superficie'], TINTE_DE_TARJETA);
      expect(contraste(t['--texto'], fondo), `texto sobre ${v}`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t['--texto-suave'], fondo), `texto suave sobre ${v}`).toBeGreaterThanOrEqual(minimoSuave);
    }
  });

  // Inside a course, «Teñido»: each row with the color of its kind (the courses' palette, panel.css). Its icon sits on the
  // surface, checked above.
  it.each(combinaciones.map((c) => [nombre(c), c]))('las filas teñidas de una materia se leen: %s', (_, c) => {
    const t = tokens(c);
    const minimoSuave = c.contraste === 'alto' ? 7 : 4.5;
    for (const v of TODAS_LAS_MATERIAS) {
      for (const tinte of [TINTE_DE_FILA, TINTE_DE_NOTA]) {
        const fondo = mezcla(t[v], t['--superficie'], tinte);
        expect(contraste(t['--texto'], fondo), `texto sobre ${v} al ${tinte}`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(t['--texto-suave'], fondo), `texto suave sobre ${v} al ${tinte}`).toBeGreaterThanOrEqual(minimoSuave);
      }
    }
  });

  it.each(combinaciones.map((c) => [nombre(c), c]))('el texto se lee: %s', (_, c) => {
    const t = tokens(c);
    // Error, ok and warning are also used as text, on these three.
    for (const fondo of ['--superficie', '--fondo', '--superficie-2']) {
      for (const v of ['--texto', '--texto-suave', ...COLORES_ESTADO]) {
        expect(contraste(t[v], t[fondo]), `${v} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5);
      }
      if (c.contraste === 'alto') expect(contraste(t['--texto-suave'], t[fondo]), `suave sobre ${fondo}`).toBeGreaterThanOrEqual(7);
    }
    expect(contraste(t['--accion'], t['--accion-texto'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t['--accion-hover'], t['--accion-texto'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t['--resaltador'], t['--resaltador-texto'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t['--error'], t['--error-texto'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t['--borde-control'], t['--superficie'])).toBeGreaterThanOrEqual(3);
    expect(contraste(t['--borde-control'], t['--fondo'])).toBeGreaterThanOrEqual(3);
    // The gradient of the professional buttons ends here, under the same text.
    if (t['--accion-fin']) expect(contraste(t['--accion-fin'], t['--accion-texto'])).toBeGreaterThanOrEqual(4.5);
  });

  // In every style: some bring a palette of their own for their background.
  const casos = ESTILOS_Y_TEMAS.flatMap(([estilo, tema]) => ['rojo-verde', 'azul-amarillo'].map((daltonismo) => [estilo, tema, daltonismo]));

  it.each(casos)('las paletas se distinguen con esa visión: %s, %s, %s', (estilo, tema, daltonismo) => {
    const t = tokens({ estilo, ...marcas(tema, estilo), daltonismo });
    for (const vision of VISIONES[daltonismo]) {
      for (const grupo of [COLORES_MATERIA, COLORES_ESTADO]) {
        grupo.forEach((a, i) => grupo.slice(i + 1).forEach((b) => {
          expect(distancia(t[a], t[b], vision), `${a} y ${b} con visión ${vision}`).toBeGreaterThanOrEqual(8.5);
        }));
      }
    }
  });

  it.each(TEMAS)('sin daltonismo, las diez materias se distinguen entre sí: %s', (tema) => {
    const t = tokens(marcas(tema));
    TODAS_LAS_MATERIAS.forEach((a, i) => TODAS_LAS_MATERIAS.slice(i + 1).forEach((b) => {
      expect(distancia(t[a], t[b], 'normal'), `${a} y ${b}`).toBeGreaterThanOrEqual(8.5);
    }));
  });

  it('los colores originales son los de los tokens', () => {
    for (const tema of TEMAS) {
      expect(tokens(marcas(tema))['--accion']).toBe(ORIGINALES[tema].accion);
      expect(tokens(marcas(tema))['--resaltador']).toBe(ORIGINALES[tema].resaltador);
    }
  });

  it('Lavanda con un estilo siempre oscuro: su violeta más claro, y es el original de esa combinación', () => {
    const t = tokens({ estilo: 'batman', tema: 'oscuro', paleta: 'lavanda' });
    expect(t['--accion']).toBe(ORIGINALES['lavanda-oscuro'].accion);
  });

  // Plano and Pizarrón follow the theme: paper and whiteboard in the light one, the blueprint and the chalkboard in the dark.
  it.each(['plano', 'pizarron'])('%s: claro y oscuro son dos versiones, y la paleta clara es la del papel o la pizarra', (estilo) => {
    const claro = tokens({ estilo, tema: 'claro' });
    const oscuro = tokens({ estilo, tema: 'oscuro' });
    expect(contraste(claro['--fondo'], claro['--texto'])).toBeGreaterThan(10);
    expect(oscuro['--fondo']).not.toBe(claro['--fondo']);
    // Lavanda is light: with these two it gives a lilac paper and a lilac whiteboard, not a dark version.
    const lavanda = tokens({ estilo, tema: 'claro', paleta: 'lavanda' });
    expect(lavanda['--fondo']).toBe('#f4f0fb');
    expect(lavanda['--accion']).toBe(ORIGINALES.lavanda.accion);
  });

  it('la pizarra blanca lleva fibrón: las calculadoras toman su pizarra y su tinta en claro', () => {
    const t = tokens({ estilo: 'pizarron', tema: 'claro' });
    expect(contraste(t['--pizarron'], t['--pizarron-tiza'])).toBeGreaterThanOrEqual(7);
    for (const tinta of ['--pizarron-tiza-suave', '--pizarron-amarillo', '--pizarron-rojo']) {
      expect(contraste(t['--pizarron'], t[tinta]), tinta).toBeGreaterThanOrEqual(4.5);
    }
    const alto = tokens({ estilo: 'pizarron', tema: 'claro', contraste: 'alto' });
    for (const tinta of ['--pizarron-tiza', '--pizarron-tiza-suave', '--pizarron-amarillo', '--pizarron-rojo']) {
      expect(contraste(alto['--pizarron'], alto[tinta]), tinta).toBeGreaterThanOrEqual(7);
    }
    // The chalkboard of the dark one stays as it was.
    expect(tokens({ estilo: 'pizarron', tema: 'oscuro' })['--pizarron-cab-1']).toBe('#8f6c47');
  });

  it('el tema oscuro define su esquema de color', () => {
    expect(CSS).toMatch(/\[data-tema='oscuro'\] \{\s*color-scheme: dark;/);
  });
});

describe('leer los ajustes', () => {
  it('sin nada, los valores de siempre', () => {
    expect(normalizar(null)).toEqual({
      estilo: 'original', tema: 'sistema', contraste: 'normal', daltonismo: 'ninguno', letra: 'normal', movimiento: 'sistema', pdf: 'claro', pdfClaro: 'claro', pdfBrillo: 0.92, accion: null, resaltador: null,
      vistas: { hoy: 'agenda', materia: 'tarjetas', materias: 'tarjetas', calendario: 'mes' },
      luz: false,
      lectura: false,
      bordes: false,
      bordesDelEstilo: false,
      vistos: null,
      documentoOscuro: null,
      avisoBajarConsultron: true,
      facultad: true,
      calSoloVencimientos: false,
      calMateria: '',
      atajos: true,
      velocidadVoz: 1,
      anchoPanelPdf: 280,
      anchoConsultron: 380,
      altoConsultron: 720,
      anchoRincon: 520,
      labArchivos: 296,
      labPanel: 260,
      labSinArchivos: false,
      labSinPanel: false,
      labAutocompletar: true,
      labLetra: 'sistema',
      labTamano: 15,
      labErrores: true,
      labRevisar: true,
      labBase: 'auto',
      labAjuste: false,
      labSangria: 4,
      labTabEnC: false,
      labNumeros: true,
      labCerrar: false,
      labLineaActual: true,
      labColores: {},
      menu: { estilo: 'texto', lugares: { horario: 'mas', sysacad: 'mas', carrera: 'mas', laboratorio: 'mas', calculadoras: 'mas', repaso: 'mas', consultron: 'mas', envivo: 'mas' }, orden: EN_EL_MENU, posicion: 'arriba', alineacion: 'derecha', ancho: 'pagina' },
      tarjeta: 'simbolo',
      contenido: 'icono',
      consultronLetra: 'normal',
      consultronForma: 'globos',
      consultronLado: 'derecha',
      consultronColor: null,
      consultronAparicion: 'modal',
    });
  });

  it('el menú: un estilo de la lista, y solo «Más» u «Oculta» para las pantallas que tiene; Configuración no se oculta', () => {
    expect(normalizar({ menu: { estilo: 'pastillas', lugares: { notas: 'oculta', sysacad: 'mas', horario: 'oculta', hoy: 'vista', configuracion: 'oculta', otra: 'mas', buscar: 'x' } } }).menu)
      .toEqual({ estilo: 'pastillas', lugares: { sysacad: 'mas', carrera: 'mas', horario: 'oculta', laboratorio: 'mas', calculadoras: 'mas', repaso: 'mas', consultron: 'mas', envivo: 'mas' }, orden: EN_EL_MENU, posicion: 'arriba', alineacion: 'derecha', ancho: 'pagina' });
    expect(normalizar({ menu: { estilo: '"><b>', lugares: { configuracion: 'mas' } } }).menu).toEqual({ estilo: 'texto', lugares: { horario: 'mas', sysacad: 'mas', carrera: 'mas', configuracion: 'mas', laboratorio: 'mas', calculadoras: 'mas', repaso: 'mas', consultron: 'mas', envivo: 'mas' }, orden: EN_EL_MENU, posicion: 'arriba', alineacion: 'derecha', ancho: 'pagina' });
    for (const raro of ['x', 1, null, []]) expect(normalizar({ menu: raro }).menu).toEqual({ estilo: 'texto', lugares: { horario: 'mas', sysacad: 'mas', carrera: 'mas', laboratorio: 'mas', calculadoras: 'mas', repaso: 'mas', consultron: 'mas', envivo: 'mas' }, orden: EN_EL_MENU, posicion: 'arriba', alineacion: 'derecha', ancho: 'pagina' });
  });

  it('el orden del menú: las conocidas una vez, en el orden elegido, y las que faltan al final como vinieron', () => {
    expect(ordenValido(['repaso', 'hoy', 'repaso', 'notas', 7, '"><b>'])).toEqual(['repaso', 'hoy', ...EN_EL_MENU.filter((c) => c !== 'repaso' && c !== 'hoy')]);
    for (const raro of [null, 'hoy', { 0: 'hoy' }, []]) expect(ordenValido(raro)).toEqual(EN_EL_MENU);
    expect(normalizar({ menu: { orden: ['consultron', 'materias'] } }).menu.orden.slice(0, 3)).toEqual(['consultron', 'materias', 'hoy']);
    expect(normalizar({ menu: { orden: ['consultron'] } }).menu.orden).toHaveLength(EN_EL_MENU.length);
  });

  it('la posición del menú: arriba salvo que se elija la izquierda', () => {
    expect(POSICIONES_DEL_MENU).toEqual(['arriba', 'izquierda']);
    expect(normalizar({ menu: { posicion: 'izquierda' } }).menu.posicion).toBe('izquierda');
    for (const raro of ['derecha', 1, null, '"><b>']) expect(normalizar({ menu: { posicion: raro } }).menu.posicion).toBe('arriba');
  });

  it('la barra de arriba: a la derecha y como la página, salvo que se elija otra cosa', () => {
    expect(ALINEACIONES_DEL_MENU).toEqual(['derecha', 'medio', 'izquierda']);
    expect(ANCHOS_DEL_MENU).toEqual(['pagina', 'pantalla']);
    expect(normalizar({ menu: { alineacion: 'medio', ancho: 'pantalla' } }).menu).toMatchObject({ alineacion: 'medio', ancho: 'pantalla' });
    for (const raro of ['arriba', 1, null, '"><b>']) expect(normalizar({ menu: { alineacion: raro, ancho: raro } }).menu).toMatchObject({ alineacion: 'derecha', ancho: 'pagina' });
  });

  it('el laboratorio arranca en «Más», y puede ir a la vista o quedar oculto', () => {
    expect(normalizar({ menu: { lugares: { laboratorio: 'vista' } } }).menu.lugares).toEqual({ horario: 'mas', sysacad: 'mas', carrera: 'mas', laboratorio: 'vista', calculadoras: 'mas', repaso: 'mas', consultron: 'mas', envivo: 'mas' });
    expect(normalizar({ menu: { lugares: { laboratorio: 'oculta' } } }).menu.lugares).toEqual({ horario: 'mas', sysacad: 'mas', carrera: 'mas', laboratorio: 'oculta', calculadoras: 'mas', repaso: 'mas', consultron: 'mas', envivo: 'mas' });
    expect(normalizar({ menu: { lugares: { laboratorio: 'x' } } }).menu.lugares).toEqual({ horario: 'mas', sysacad: 'mas', carrera: 'mas', calculadoras: 'mas', repaso: 'mas', consultron: 'mas', envivo: 'mas' });
    // Sysacad came later: it starts inside «Más», and can go in sight or hide.
    expect(normalizar({ menu: { lugares: { sysacad: 'vista' } } }).menu.lugares.sysacad).toBe('vista');
    expect(normalizar({ menu: { lugares: { sysacad: 'oculta' } } }).menu.lugares.sysacad).toBe('oculta');
  });

  it('Calculadoras arranca en «Más», y se puede poner a la vista u ocultar', () => {
    expect(normalizar({}).menu.lugares.calculadoras).toBe('mas');
    expect(normalizar({ menu: { lugares: { calculadoras: 'vista' } } }).menu.lugares.calculadoras).toBe('vista');
    expect(normalizar({ menu: { lugares: { calculadoras: 'oculta' } } }).menu.lugares.calculadoras).toBe('oculta');
    expect(normalizar({ menu: { lugares: { calculadoras: 'x' } } }).menu.lugares.calculadoras).toBe(undefined);
  });

  it('la velocidad de la lectura en voz alta: uno de sus pasos, y lo raro vuelve a 1', () => {
    expect(normalizar({ velocidadVoz: 1.5 }).velocidadVoz).toBe(1.5);
    expect(normalizar({ velocidadVoz: 7 }).velocidadVoz).toBe(2);
    for (const raro of ['1.5', null, NaN, {}]) expect(normalizar({ velocidadVoz: raro }).velocidadVoz).toBe(1);
  });

  it('el calendario académico y los atajos de una tecla: prendidos salvo que se apaguen', () => {
    expect(normalizar({ facultad: false, atajos: false })).toMatchObject({ facultad: false, atajos: false });
    for (const raro of ['false', 0, null, {}]) expect(normalizar({ facultad: raro, atajos: raro })).toMatchObject({ facultad: true, atajos: true });
  });

  it('los filtros del calendario: solo vencimientos si es true, la materia solo con su número', () => {
    expect(normalizar({ calSoloVencimientos: true, calMateria: '123' })).toMatchObject({ calSoloVencimientos: true, calMateria: '123' });
    for (const raro of ['abc', 123, '1 OR 1', null]) expect(normalizar({ calSoloVencimientos: 'true', calMateria: raro })).toMatchObject({ calSoloVencimientos: false, calMateria: '' });
  });

  it('marcar lo que ya viste: true o false si se eligió, si no null', () => {
    expect(normalizar({ vistos: true }).vistos).toBe(true);
    expect(normalizar({ vistos: false }).vistos).toBe(false);
    for (const raro of ['true', 1, {}, null, undefined]) expect(normalizar({ vistos: raro }).vistos).toBe(null);
  });

  it('las páginas claras de los PDF: las elegidas, y con oscuras o como el tema, las de antes', () => {
    expect(normalizar({ pdf: 'sepia', pdfClaro: 'claro' })).toMatchObject({ pdf: 'sepia', pdfClaro: 'sepia' });
    expect(normalizar({ pdf: 'claro', pdfClaro: 'sepia' })).toMatchObject({ pdf: 'claro', pdfClaro: 'claro' });
    expect(normalizar({ pdf: 'oscuro', pdfClaro: 'sepia' })).toMatchObject({ pdf: 'oscuro', pdfClaro: 'sepia' });
    expect(normalizar({ pdf: 'tema', pdfClaro: 'sepia' })).toMatchObject({ pdf: 'tema', pdfClaro: 'sepia' });
    for (const raro of ['oscuro', 'tema', 'Sepia', 1, null]) expect(normalizar({ pdf: 'oscuro', pdfClaro: raro }).pdfClaro).toBe('claro');
    // A pdf from the list that isn't light falls back to «Claras», and so does what to go back to.
    expect(normalizar({ pdf: 'rosa', pdfClaro: 'sepia' })).toMatchObject({ pdf: 'claro', pdfClaro: 'claro' });
  });

  it('el brillo de las oscuras: un número entre los extremos, en centésimos', () => {
    expect(normalizar({ pdfBrillo: 0.85 }).pdfBrillo).toBe(0.85);
    expect(normalizar({ pdfBrillo: 0.876 }).pdfBrillo).toBe(0.88);
    expect(normalizar({ pdfBrillo: 0.2 }).pdfBrillo).toBe(BRILLO_PDF.min);
    expect(normalizar({ pdfBrillo: 3 }).pdfBrillo).toBe(BRILLO_PDF.max);
    // The width of the reader's panel: whole pixels between its ends; anything else, the default.
    expect(normalizar({ anchoPanelPdf: 333.6 }).anchoPanelPdf).toBe(334);
    expect(normalizar({ anchoPanelPdf: 40 }).anchoPanelPdf).toBe(PANEL_PDF.min);
    expect(normalizar({ anchoPanelPdf: 9000 }).anchoPanelPdf).toBe(PANEL_PDF.max);
    for (const anchoPanelPdf of ['400', null, Number.NaN, Infinity]) expect(normalizar({ anchoPanelPdf }).anchoPanelPdf).toBe(PANEL_PDF.porDefecto);
    expect(normalizar({ anchoConsultron: 501.4 }).anchoConsultron).toBe(501);
    expect(normalizar({ anchoConsultron: 10 }).anchoConsultron).toBe(PANEL_CONSULTRON.min);
    expect(normalizar({ anchoConsultron: 9000 }).anchoConsultron).toBe(PANEL_CONSULTRON.max);
    for (const anchoConsultron of ['400', null, Number.NaN]) expect(normalizar({ anchoConsultron }).anchoConsultron).toBe(PANEL_CONSULTRON.porDefecto);
    expect(normalizar({ altoConsultron: 801.6 }).altoConsultron).toBe(802);
    expect(normalizar({ altoConsultron: 10 }).altoConsultron).toBe(ALTO_CONSULTRON.min);
    expect(normalizar({ altoConsultron: 9000 }).altoConsultron).toBe(ALTO_CONSULTRON.max);
    for (const altoConsultron of ['700', null, Number.NaN]) expect(normalizar({ altoConsultron }).altoConsultron).toBe(ALTO_CONSULTRON.porDefecto);
    expect(normalizar({ anchoRincon: 601.4 }).anchoRincon).toBe(601);
    expect(normalizar({ anchoRincon: 10 }).anchoRincon).toBe(RINCON_CONSULTRON.min);
    expect(normalizar({ anchoRincon: 9000 }).anchoRincon).toBe(RINCON_CONSULTRON.max);
    for (const anchoRincon of ['600', null, Number.NaN]) expect(normalizar({ anchoRincon }).anchoRincon).toBe(RINCON_CONSULTRON.porDefecto);
    for (const raro of ['0.85', NaN, Infinity, -Infinity, null, {}, true]) expect(normalizar({ pdfBrillo: raro }).pdfBrillo).toBe(0.92);
  });

  it('Sensible a la luz: solo true lo prende, y deja todo quieto aunque Movimiento diga otra cosa', () => {
    for (const raro of ['si', 1, null, {}]) expect(normalizar({ luz: raro }).luz).toBe(false);
    expect(normalizar({ luz: true }).luz).toBe(true);
    expect(movimientoDe(normalizar({ luz: true, movimiento: 'sistema' }))).toBe('ninguno');
    expect(movimientoDe(normalizar({ movimiento: 'reducido' }))).toBe('reducido');
  });

  it('el modo lectura: solo true lo prende', () => {
    expect(normalizar({ lectura: true }).lectura).toBe(true);
    for (const raro of ['true', 1, {}, null]) expect(normalizar({ lectura: raro }).lectura).toBe(false);
  });

  it('otro estilo vuelve el color principal al original; el mismo estilo lo deja', () => {
    const elegir = (antes, estilo) => normalizar({ ...antes, ...cambioDeEstilo(normalizar(antes), estilo) });
    const conColor = { estilo: 'original', accion: '#8a1f3d' };
    for (const estilo of OPCIONES.estilo.filter((e) => e !== 'original')) expect(elegir(conColor, estilo).accion).toBeNull();
    expect(elegir(conColor, 'original').accion).toBe('#8a1f3d');
  });

  it('Hoja y Plano prenden los bordes, y otro estilo los apaga solo si los prendió uno de ellos', () => {
    const elegir = (antes, estilo) => normalizar({ ...antes, ...cambioDeEstilo(normalizar(antes), estilo) });
    const conHoja = elegir({}, 'hoja');
    expect(conHoja.bordes).toBe(true);
    expect(elegir({}, 'plano').bordes).toBe(true);
    expect(elegir(elegir({}, 'plano'), 'pizarron').bordes).toBe(false);
    // From one to the other, still the style's: leaving both turns them off.
    expect(elegir(elegir(conHoja, 'plano'), 'original').bordes).toBe(false);
    expect(elegir(conHoja, 'profesional').bordes).toBe(false);
    // Already on before: Hoja didn't turn them on, so leaving it keeps them.
    expect(elegir(elegir({ bordes: true }, 'hoja'), 'batman').bordes).toBe(true);
    // Touched the switch while in Hoja: they're the student's now.
    const tocados = normalizar({ ...conHoja, ...cambioDeBordes(true) });
    expect(elegir(tocados, 'original').bordes).toBe(true);
    // Turned off in Hoja and on again elsewhere: nothing to undo.
    expect(elegir({ ...conHoja, ...cambioDeBordes(false) }, 'batman').bordes).toBe(false);
  });

  it('lo que no está en la lista se descarta', () => {
    const r = normalizar({
      tema: 'violeta', letra: '200%', movimiento: 1, accion: 'red;background:url(//x)', resaltador: '#12345',
      vistas: { hoy: 'otra', materia: 'tabla', extra: 'x' },
    });
    expect(r.tema).toBe('sistema');
    expect(r.letra).toBe('normal');
    expect(r.movimiento).toBe('sistema');
    expect(r.accion).toBeNull();
    expect(r.resaltador).toBeNull();
    expect(r.vistas).toEqual({ hoy: 'agenda', materia: 'tabla', materias: 'tarjetas', calendario: 'mes' });
  });

  it.each([[[]], ['texto'], [42], [{ vistas: 'x' }]])('aguanta basura: %j', (crudo) => {
    expect(normalizar(crudo).tema).toBe('sistema');
  });

  it('acepta colores válidos y los deja en minúsculas', () => {
    expect(normalizar({ accion: '#AABBCC' }).accion).toBe('#aabbcc');
  });
});

describe('colores propios', () => {
  it('elige el texto que más se lee', () => {
    expect(textoSobre('#17324d')).toBe('#ffffff');
    expect(textoSobre('#ffe14d')).toBe('#0f1c28');
  });

  it('avisa en los grises del medio, donde ni blanco ni oscuro alcanzan', () => {
    expect(cuestaLeerSobre('#7c7c7c')).toBe(true);
    expect(cuestaLeerSobre('#17324d')).toBe(false);
    expect(cuestaLeerSobre('#ffe14d')).toBe(false);
  });
});

describe('public/ajustes.js', () => {
  const raiz = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    raiz.removeAttribute('style');
    window.matchMedia = (consulta) => ({ matches: consulta.includes('dark') && window.sistemaOscuro === true, addEventListener() {} });
    window.sistemaOscuro = false;
    new Function(SCRIPT)();
  });

  afterEach(() => {
    delete window.aplicarAjustes;
    delete window.matchMedia;
    delete window.sistemaOscuro;
  });

  const aplicar = (datos) => {
    localStorage.setItem(CLAVE_AJUSTES, typeof datos === 'string' ? datos : JSON.stringify(datos));
    window.aplicarAjustes();
  };
  const atributo = (a) => raiz.getAttribute(`data-${a}`);
  const variable = (v) => raiz.style.getPropertyValue(v);

  it('escribe cada opción válida igual que la lista de la pantalla', () => {
    for (const [clave, lista] of Object.entries(OPCIONES)) {
      for (const valor of lista) {
        aplicar({ [clave]: valor });
        const esperado = clave === 'tema' ? { sistema: 'claro', ...PALETAS }[valor] ?? valor : valor;
        expect(atributo(clave)).toBe(esperado);
      }
    }
  });

  it('los estilos siempre oscuros lo son con cualquier tema, y los bordes solo con true', () => {
    expect(SIEMPRE_OSCUROS).toEqual(['batman']);
    for (const estilo of SIEMPRE_OSCUROS) {
      aplicar({ estilo, tema: 'claro' });
      expect(atributo('estilo')).toBe(estilo);
      expect(atributo('tema')).toBe('oscuro');
    }
    // Plano and Pizarrón follow the theme, like Original.
    for (const estilo of ['plano', 'pizarron']) {
      aplicar({ estilo, tema: 'claro' });
      expect(atributo('tema')).toBe('claro');
      aplicar({ estilo, tema: 'oscuro' });
      expect(atributo('tema')).toBe('oscuro');
    }
    expect(atributo('bordes')).toBe('no');
    aplicar({ estilo: 'hoja', tema: 'claro', bordes: true });
    expect(atributo('tema')).toBe('claro');
    expect(atributo('bordes')).toBe('si');
    aplicar({ bordes: 'si' });
    expect(atributo('bordes')).toBe('no');
    expect(normalizar({ bordes: 'si' }).bordes).toBe(false);
    expect(normalizar({ estilo: 'otro' }).estilo).toBe('original');
  });

  it.each(Object.entries(PALETAS))('%s es el tema %s con data-paleta, y la marca se borra al volver a otro tema', (paleta, base) => {
    aplicar({ tema: paleta });
    expect(atributo('tema')).toBe(base);
    expect(atributo('paleta')).toBe(paleta);
    aplicar({ tema: base });
    expect(atributo('tema')).toBe(base);
    expect(atributo('paleta')).toBeNull();
    aplicar({ tema: paleta });
    aplicar({ tema: 'sistema' });
    expect(atributo('paleta')).toBeNull();
    // Every style takes the palette, and an always-dark one stays dark with any of them (Lavanda too).
    for (const estilo of OPCIONES.estilo) {
      aplicar({ tema: paleta, estilo });
      expect(atributo('paleta'), estilo).toBe(paleta);
      expect(atributo('tema'), estilo).toBe(SIEMPRE_OSCUROS.includes(estilo) ? 'oscuro' : base);
    }
    expect(normalizar({ tema: paleta }).tema).toBe(paleta);
  });

  it.each(OPCIONES.estilo)('el color principal elegido pinta la cabecera de %s, y sin él vuelve la del estilo', (estilo) => {
    aplicar({ estilo, accion: '#8a1f3d' });
    expect(atributo('cabecera')).toBe('propia');
    expect(variable('--accion')).toBe('#8a1f3d');
    aplicar({ estilo });
    expect(atributo('cabecera')).toBeNull();
  });

  it('el color de la acción elegido le gana a la paleta', () => {
    aplicar({ tema: 'rosa', accion: '#112233' });
    expect(variable('--accion')).toBe('#112233');
  });

  it('el tema del sistema se resuelve al que tenga el dispositivo', () => {
    window.sistemaOscuro = true;
    aplicar({ tema: 'sistema' });
    expect(atributo('tema')).toBe('oscuro');
    aplicar({ tema: 'claro' });
    expect(atributo('tema')).toBe('claro');
  });

  it('descarta lo que no está en la lista, también si el archivo está roto', () => {
    aplicar({ tema: '"><script>', letra: 'x', accion: 'red;background:url(//x)', resaltador: 'url(//x)' });
    expect(atributo('tema')).toBe('claro');
    expect(atributo('letra')).toBe('normal');
    expect(variable('--accion')).toBe('');
    expect(variable('--resaltador')).toBe('');
    aplicar('{no es json');
    expect(atributo('contraste')).toBe('normal');
    aplicar('[1]');
    expect(atributo('daltonismo')).toBe('ninguno');
  });

  it('calcula el texto y el hover del color principal igual que la pantalla', () => {
    for (const color of ['#17324d', '#ffe14d', '#7c7c7c', '#000000', '#ffffff', '#3578bd']) {
      aplicar({ accion: color, resaltador: color });
      expect(variable('--accion')).toBe(color);
      expect(variable('--accion-texto')).toBe(textoSobre(color));
      expect(variable('--resaltador-texto')).toBe(textoSobre(color));
      expect(variable('--accion-hover')).toMatch(/^#[0-9a-f]{6}$/);
      expect(variable('--accion-hover')).not.toBe(color);
      expect(contraste(variable('--accion-hover'), textoSobre(color))).toBeGreaterThanOrEqual(Math.min(4.5, contraste(color, textoSobre(color))));
    }
  });

  it('volver al original saca las variables', () => {
    aplicar({ accion: '#112233', resaltador: '#445566' });
    aplicar({});
    for (const v of ['--accion', '--accion-hover', '--accion-texto', '--resaltador', '--resaltador-texto']) expect(variable(v)).toBe('');
  });

  it('marca las páginas claras y el brillo de las oscuras igual que la pantalla', () => {
    const casos = [
      {}, { pdf: 'sepia' }, { pdf: 'oscuro', pdfClaro: 'sepia' }, { pdf: 'tema', pdfClaro: 'sepia' }, { pdf: 'claro', pdfClaro: 'sepia' },
      { pdf: 'oscuro', pdfClaro: '"><b>' }, { pdfBrillo: 0.8 }, { pdfBrillo: 1 }, { pdfBrillo: 0.876 }, { pdfBrillo: 9 }, { pdfBrillo: -1 }, { pdfBrillo: '1' },
    ];
    for (const datos of casos) {
      aplicar(datos);
      const esperado = normalizar(datos);
      expect(atributo('pdf'), JSON.stringify(datos)).toBe(esperado.pdf);
      expect(raiz.dataset.pdfClaro, JSON.stringify(datos)).toBe(esperado.pdfClaro);
      expect(Number(variable('--pdf-brillo')), JSON.stringify(datos)).toBe(esperado.pdfBrillo);
    }
    expect(PDF_CLAROS.every((p) => OPCIONES.pdf.includes(p))).toBe(true);
  });

  it('escribe la posición del menú antes de pintar, igual que la pantalla', () => {
    for (const posicion of POSICIONES_DEL_MENU) {
      aplicar({ menu: { posicion } });
      expect(atributo('menu-lado')).toBe(posicion);
    }
    for (const raro of [{ menu: { posicion: 'derecha' } }, { menu: 'izquierda' }, { menu: null }, {}, '{roto']) {
      aplicar(raro);
      expect(atributo('menu-lado')).toBe('arriba');
    }
  });

  it('Sensible a la luz: lo marca antes de pintar, y con él todo queda sin animaciones', () => {
    aplicar({ movimiento: 'sistema' });
    expect([atributo('luz'), atributo('movimiento')]).toEqual(['no', 'sistema']);
    aplicar({ luz: true, movimiento: 'reducido' });
    expect([atributo('luz'), atributo('movimiento')]).toEqual(['si', 'ninguno']);
    aplicar({ luz: 'si' });
    expect(atributo('luz')).toBe('no');
  });

  it('Sensible a la luz: un cambio de tema se funde donde el navegador sabe, y sin él cambia de una', async () => {
    const pasos = [];
    document.startViewTransition = (cambiar) => {
      pasos.push(raiz.hasAttribute('data-fundido'));
      cambiar();
      return { finished: Promise.resolve() };
    };
    try {
      aplicar({ tema: 'claro' });
      aplicar({ tema: 'oscuro' });
      expect(pasos).toEqual([]);
      aplicar({ tema: 'oscuro', luz: true });
      aplicar({ tema: 'claro', luz: true });
      aplicar({ tema: 'claro', luz: true, letra: 'grande' });
      expect(pasos).toEqual([true, true]);
      expect(atributo('tema')).toBe('claro');
      await Promise.resolve();
      expect(raiz.hasAttribute('data-fundido')).toBe(false);
    } finally {
      delete document.startViewTransition;
    }
  });

  it('otra pestaña cambia los atributos por el evento storage', () => {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify({ contraste: 'alto' }));
    window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_AJUSTES }));
    expect(atributo('contraste')).toBe('alto');
  });
});

describe('la luna del lector', () => {
  beforeEach(() => {
    localStorage.clear();
    volverAjustesOriginales();
  });

  afterEach(() => volverAjustesOriginales());

  const luna = (temaOscuro = false) => alternarPdfOscuro(pdfOscuro(ajustesActuales().pdf, temaOscuro));

  it('apagada vuelve a las claras que tenías: claras o sepia', () => {
    luna();
    expect(ajustesActuales()).toMatchObject({ pdf: 'oscuro', pdfClaro: 'claro' });
    luna();
    expect(ajustesActuales().pdf).toBe('claro');
    cambiarAjustes({ pdf: 'sepia' });
    luna();
    expect(ajustesActuales()).toMatchObject({ pdf: 'oscuro', pdfClaro: 'sepia' });
    luna();
    expect(ajustesActuales().pdf).toBe('sepia');
    expect(JSON.parse(localStorage.getItem(CLAVE_AJUSTES))).toMatchObject({ pdf: 'sepia', pdfClaro: 'sepia' });
  });

  it('con «Como el tema» y el tema oscuro, la apaga hacia la clara de antes', () => {
    cambiarAjustes({ pdf: 'sepia' });
    cambiarAjustes({ pdf: 'tema' });
    expect(ajustesActuales().pdfClaro).toBe('sepia');
    luna(true);
    expect(ajustesActuales().pdf).toBe('sepia');
    cambiarAjustes({ pdf: 'tema' });
    luna(false);
    expect(ajustesActuales()).toMatchObject({ pdf: 'oscuro', pdfClaro: 'sepia' });
  });
});

describe('useVista', () => {
  let contenedor;
  let raizReact;
  const Prueba = () => useVista('calendario');

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    volverAjustesOriginales();
    contenedor = document.createElement('div');
    raizReact = createRoot(contenedor);
    act(() => raizReact.render(createElement(Prueba)));
  });

  afterEach(() => {
    act(() => raizReact.unmount());
    volverAjustesOriginales();
  });

  it('mantiene los nombres que usan las pantallas', () => {
    expect(VISTAS).toEqual({
      hoy: ['agenda', 'tablero', 'compacta'],
      materia: ['secciones', 'tarjetas', 'tabla'],
      materias: ['tarjetas', 'lista', 'grandes'],
      calendario: ['mes', 'semana', 'agenda'],
    });
  });

  it('arranca en la primera y se actualiza sola', () => {
    expect(contenedor.textContent).toBe('mes');
    act(() => {
      elegirVista('calendario', 'semana');
    });
    expect(contenedor.textContent).toBe('semana');
    expect(JSON.parse(localStorage.getItem(CLAVE_AJUSTES)).vistas.calendario).toBe('semana');
  });

  it('una vista que no existe queda en la primera', () => {
    act(() => {
      elegirVista('calendario', 'otra');
    });
    expect(contenedor.textContent).toBe('mes');
  });

  it('sigue a otra pestaña', () => {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify({ vistas: { calendario: 'agenda' } }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_AJUSTES }));
    });
    expect(contenedor.textContent).toBe('agenda');
  });

  it('volver todo deja lo demás como venía', () => {
    act(() => {
      cambiarAjustes({ tema: 'oscuro', accion: '#112233' });
      elegirVista('calendario', 'semana');
    });
    act(() => volverAjustesOriginales());
    expect(localStorage.getItem(CLAVE_AJUSTES)).toBeNull();
    expect(contenedor.textContent).toBe('mes');
  });

  it('volver todo deja Sensible a la luz como estaba', () => {
    act(() => cambiarAjustes({ luz: true, tema: 'oscuro' }));
    act(() => volverAjustesOriginales());
    expect(ajustesActuales()).toEqual({ ...normalizar(null), luz: true });
    expect(JSON.parse(localStorage.getItem(CLAVE_AJUSTES))).toEqual({ luz: true });
    act(() => cambiarAjustes({ luz: false }));
    act(() => volverAjustesOriginales());
    expect(localStorage.getItem(CLAVE_AJUSTES)).toBeNull();
  });

  it('volver todo también vuelve el orden y la posición del menú', () => {
    act(() => {
      ordenarMenu(['repaso', ...EN_EL_MENU]);
      ponerPosicionDelMenu('izquierda');
    });
    expect(ajustesActuales().menu.orden[0]).toBe('repaso');
    expect(ajustesActuales().menu.posicion).toBe('izquierda');
    expect(JSON.parse(localStorage.getItem(CLAVE_AJUSTES)).menu.posicion).toBe('izquierda');
    act(() => volverAjustesOriginales());
    expect(ajustesActuales().menu.orden).toEqual(EN_EL_MENU);
    expect(ajustesActuales().menu.posicion).toBe('arriba');
  });
});

describe('la tarjeta de Materias y cómo se ve Consultron', () => {
  const raiz = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    raiz.removeAttribute('style');
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    new Function(SCRIPT)();
  });

  afterEach(() => {
    delete window.aplicarAjustes;
    delete window.matchMedia;
  });

  const aplicar = (datos) => {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(datos));
    window.aplicarAjustes();
  };

  it('sin nada, la tarjeta con símbolo y Consultron como venía', () => {
    expect(normalizar({ labColores: { clave: '#ABCDEF', variable: 'rojo', otro: '#000000' } }).labColores).toEqual({ clave: '#abcdef' });
    expect(normalizar({ labColores: '#000000' }).labColores).toEqual({});
    expect(normalizar(null)).toMatchObject({ tarjeta: 'simbolo', consultronLetra: 'normal', consultronForma: 'globos', consultronLado: 'derecha', consultronColor: null });
    expect(normalizar({ tarjeta: 'arcoiris', consultronLado: 'arriba', consultronColor: 'red' })).toMatchObject({ tarjeta: 'simbolo', consultronLado: 'derecha', consultronColor: null });
    expect(normalizar(null).consultronAparicion).toBe('modal');
    expect(normalizar({ consultronAparicion: 'lateral' }).consultronAparicion).toBe('lateral');
    expect(normalizar({ consultronAparicion: 'abajo' }).consultronAparicion).toBe('modal');
    for (const estilo of ESTILOS_DE_TARJETA) expect(normalizar({ tarjeta: estilo }).tarjeta).toBe(estilo);
  });

  it('el laboratorio: lo raro vuelve a como venía', () => {
    const raro = normalizar({ labLetra: 'Comic Sans', labTamano: 99, labBase: 'diagonal', labSangria: 3, labErrores: 0, labAutocompletar: 'no' });
    expect(raro).toMatchObject({ labLetra: 'sistema', labTamano: LAB_TAMANO.max, labBase: 'auto', labSangria: 4, labErrores: true, labAutocompletar: true });
    expect(normalizar({ labErrores: false, labAutocompletar: false, labSangria: 2, labTabEnC: true })).toMatchObject({ labErrores: false, labAutocompletar: false, labSangria: 2, labTabEnC: true });
    expect(normalizar({ labRevisar: 'no' }).labRevisar).toBe(true);
    expect(normalizar({ labRevisar: false }).labRevisar).toBe(false);
  });

  it('public/ajustes.js escribe la letra y el tamaño del código, con la misma lista', () => {
    for (const [letra, pila] of Object.entries(LETRAS_DE_CODIGO)) {
      aplicar({ labLetra: letra });
      expect(raiz.style.getPropertyValue('--codigo-letra')).toBe(letra === 'sistema' ? '' : pila);
    }
    aplicar({ labLetra: 'fira-code', labTamano: 20 });
    expect(raiz.style.getPropertyValue('--codigo-ligaduras')).toBe('normal');
    expect(raiz.style.getPropertyValue('--codigo-tamano')).toBe('20px');
    expect(raiz.style.getPropertyValue('--codigo-alto')).toBe('30px');
    aplicar({ labLetra: 'url(//x)', labTamano: 'grande' });
    for (const v of ['--codigo-letra', '--codigo-ligaduras', '--codigo-tamano', '--codigo-alto']) expect(raiz.style.getPropertyValue(v)).toBe('');
  });

  it('public/ajustes.js tiene las mismas listas de Consultron que la pantalla', () => {
    const listas = new Function(`${/var CONSULTRON = (\{[^}]*\});/.exec(SCRIPT)[1].replace(/^/, 'return ')}`)();
    expect(listas).toEqual(APARIENCIA_CONSULTRON);
  });

  it('escribe cada opción de Consultron en <html>, y lo raro queda en la primera', () => {
    for (const [clave, lista] of Object.entries(APARIENCIA_CONSULTRON)) {
      const atributo = `data-consultron-${clave.slice(10).toLowerCase()}`;
      for (const valor of lista) {
        aplicar({ [clave]: valor });
        expect(raiz.getAttribute(atributo)).toBe(valor);
      }
      aplicar({ [clave]: '"><script>' });
      expect(raiz.getAttribute(atributo)).toBe(lista[0]);
    }
  });

  it('el color de Consultron: con el texto que se lee encima, y sin él vuelve al principal', () => {
    for (const color of ['#17324d', '#ffe14d', '#000000', '#ffffff']) {
      aplicar({ consultronColor: color });
      expect(raiz.dataset.consultronColor).toBe('propio');
      expect(raiz.style.getPropertyValue('--consultron-accion')).toBe(color);
      expect(raiz.style.getPropertyValue('--consultron-accion-texto')).toBe(textoSobre(color));
      expect(raiz.style.getPropertyValue('--consultron-accion-hover')).toMatch(/^#[0-9a-f]{6}$/);
    }
    aplicar({ consultronColor: 'url(//x)' });
    expect(raiz.dataset.consultronColor).toBe('no');
    for (const v of ['--consultron-accion', '--consultron-accion-hover', '--consultron-accion-texto']) expect(raiz.style.getPropertyValue(v)).toBe('');
  });

  it('volver todo a como venía también vuelve la tarjeta y Consultron', () => {
    cambiarAjustes({ tarjeta: 'portada', consultronForma: 'documento', consultronLado: 'izquierda', consultronColor: '#112233' });
    expect(ajustesActuales()).toMatchObject({ tarjeta: 'portada', consultronForma: 'documento', consultronColor: '#112233' });
    volverAjustesOriginales();
    expect(ajustesActuales()).toMatchObject({ tarjeta: 'simbolo', consultronForma: 'globos', consultronLado: 'derecha', consultronColor: null });
    expect(raiz.dataset.consultronLado).toBe('derecha');
    expect(raiz.dataset.consultronColor).toBe('no');
  });
});
