import { describe, expect, it } from 'vitest';
import { EN_EL_MENU, normalizar } from './ajustes';
import { codigoDeEstilo, leerCodigoDeEstilo, MAX_ESCRITO } from './codigoDeEstilo';
import { CODIGOS_DE_ANTES } from './codigoDeEstilo.fixture';
import { moverBloque, ordenDeHoy } from './hoy';
import { sanearMio } from './mio';

const MIOS = normalizar({
  estilo: 'plano',
  tema: 'oscuro',
  contraste: 'alto',
  letra: 'enorme',
  pdf: 'oscuro',
  pdfClaro: 'sepia',
  pdfBrillo: 0.87,
  tarjeta: 'franja',
  contenido: 'tenida',
  consultronForma: 'documento',
  consultronLado: 'izquierda',
  consultronLetra: 'grande',
  vistas: { hoy: 'tablero', materia: 'tabla', materias: 'grandes', calendario: 'agenda' },
  menu: {
    estilo: 'pastillas',
    posicion: 'izquierda',
    alineacion: 'medio',
    ancho: 'pantalla',
    orden: ['repaso', 'hoy', 'mensajes'],
    lugares: { calculadoras: 'vista', buscar: 'mas', resumenes: 'oculta' },
  },
  bordes: true,
  bordesDelEstilo: true,
  lectura: true,
  vistos: false,
  facultad: false,
  atajos: false,
  velocidadVoz: 1.5,
  anchoPanelPdf: 333,
  anchoConsultron: 700,
  altoConsultron: 1390,
  anchoRincon: 361,
  accion: '#7A3FB0',
  consultronColor: '#0f9d58',
  // What each one needs: never in the code.
  daltonismo: 'rojo-verde',
  movimiento: 'ninguno',
});

const pasado = sanearMio({});
const MIO = sanearMio({
  hoy: { ...moverBloque(pasado, 'facu', 0, 'principal'), ocultos: ['ultimo', 'cambios'], cuenta: ['entregas', 'propias'], dias: 30, fuera: [12] },
  avisosOcultos: ['foros', 'contactos'],
});

const TUYOS = normalizar({ daltonismo: 'azul-amarillo', movimiento: 'reducido' });
const TU_MIO = sanearMio({ hoy: { fuera: [55] } });

const aplicar = (cambio, de = TUYOS, mio = TU_MIO) => ({
  ajustes: normalizar({ ...de, ...cambio.ajustes }),
  mio: sanearMio({ ...mio, hoy: { ...mio.hoy, ...cambio.hoy }, avisosOcultos: cambio.avisosOcultos }),
});

describe('pasar tu estilo con un código', () => {
  it('lleva toda la configuración y se lee igual de vuelta', () => {
    const codigo = codigoDeEstilo(MIOS, MIO);
    expect(codigo).toMatch(/^CVG-[0-9A-Z]{5}(-[0-9A-Z]{1,5})+$/);
    const { ajustes, mio } = aplicar(leerCodigoDeEstilo(codigo, TUYOS));
    const resto = { ...ajustes, daltonismo: undefined, movimiento: undefined };
    const esperado = { ...MIOS, daltonismo: undefined, movimiento: undefined };
    expect(resto).toEqual(esperado);
    expect(ordenDeHoy(mio)).toEqual(ordenDeHoy(MIO));
    expect(mio.hoy.ocultos.sort()).toEqual(['cambios', 'ultimo']);
    expect(mio.hoy.cuenta).toEqual(['entregas', 'propias']);
    expect(mio.hoy.dias).toBe(30);
    expect(mio.avisosOcultos.sort()).toEqual(['contactos', 'foros']);
    // The same code again from what it left.
    expect(codigoDeEstilo(ajustes, mio)).toBe(codigo);
    expect([ajustes.daltonismo, ajustes.movimiento]).toEqual(['azul-amarillo', 'reducido']);
  });

  it.each(['rosa', 'bosque', 'cafe', 'lavanda', 'infierno', 'glaciar', 'cosmico'])('una paleta viaja en el código: Hoja con %s se lee de vuelta', (tema) => {
    const mios = normalizar({ estilo: 'hoja', tema });
    const codigo = codigoDeEstilo(mios, MIO);
    const { ajustes } = aplicar(leerCodigoDeEstilo(codigo, TUYOS));
    expect([ajustes.estilo, ajustes.tema]).toEqual(['hoja', tema]);
    expect(codigoDeEstilo(ajustes, MIO)).toBe(codigo);
  });

  it('un código de antes de las paletas sigue entrando igual', () => {
    // Made with Hoja, Oscuro and a big letter, when «Oscuro» was the last theme: the lists only grew at the end.
    const { ajustes } = aplicar(leerCodigoDeEstilo('CVG-21201-00C01-00011-00101-W01W0-B8050-00000-00000-00006-T4HR0-00000-000G0-000ZZ-Z6', TUYOS));
    expect([ajustes.estilo, ajustes.tema, ajustes.letra]).toEqual(['hoja', 'oscuro', 'grande']);
  });

  it('no pisa el daltonismo, el movimiento ni las materias de cada uno', () => {
    const { ajustes, mio } = aplicar(leerCodigoDeEstilo(codigoDeEstilo(MIOS, MIO), TUYOS));
    expect(ajustes.daltonismo).toBe('azul-amarillo');
    expect(ajustes.movimiento).toBe('reducido');
    expect(mio.hoy.fuera).toEqual([55]);
  });

  it('no lleva Sensible a la luz: queda el de cada uno, prendido o apagado', () => {
    const conLuz = normalizar({ ...TUYOS, luz: true });
    expect(codigoDeEstilo(normalizar({ ...MIOS, luz: true }), MIO)).toBe(codigoDeEstilo(MIOS, MIO));
    expect(aplicar(leerCodigoDeEstilo(codigoDeEstilo(MIOS, MIO), conLuz), conLuz).ajustes.luz).toBe(true);
    expect(aplicar(leerCodigoDeEstilo(codigoDeEstilo(normalizar({ ...MIOS, luz: true }), MIO), TUYOS)).ajustes.luz).toBe(false);
  });

  it('lo que está como vino queda como vino', () => {
    const codigo = codigoDeEstilo(normalizar({}), sanearMio({}));
    const { ajustes, mio } = aplicar(leerCodigoDeEstilo(codigo, MIOS), MIOS, MIO);
    expect(ajustes.estilo).toBe('original');
    expect(mio.hoy.cuenta).toBeNull();
    expect(mio.hoy.dias).toBeNull();
    expect(mio.avisosOcultos).toEqual([]);
    expect(ordenDeHoy(mio)).toEqual(ordenDeHoy(sanearMio({})));
  });

  it('se escribe como venga: sin CVG, sin guiones, en minúsculas, con espacios, y con o, i o l por 0 y 1', () => {
    const codigo = codigoDeEstilo(MIOS, MIO);
    const esperado = leerCodigoDeEstilo(codigo, {});
    expect(leerCodigoDeEstilo(codigo.toLowerCase(), {})).toEqual(esperado);
    expect(leerCodigoDeEstilo(codigo.replace(/^CVG-/, '').replace(/-/g, ' '), {})).toEqual(esperado);
    expect(leerCodigoDeEstilo(`  ${codigo}\n`, {})).toEqual(esperado);
    expect(leerCodigoDeEstilo(codigo.replace(/0/g, 'O').replace(/1/g, 'l'), {})).toEqual(esperado);
  });

  it('sin letras que se confunden con números', () => {
    for (const estilo of ['original', 'hoja', 'profesional', 'batman', 'plano', 'pizarron']) {
      for (const accion of [null, '#000000', '#ffffff', '#7a3fb0']) {
        expect(codigoDeEstilo({ ...MIOS, estilo, accion }, MIO)).not.toMatch(/[ILOU]/);
      }
    }
  });

  // Made on 13/11, before «Contenido de cada materia» (version 1): Plano, Franja, Tabla and a violet.
  it('un código de antes se sigue leyendo, sin tocar el contenido de las materias', () => {
    const viejo = 'CVG-14000-00C02-00011-00101-W01W0-B8050-20000-00000-00002-85NZ0-00000-000G0-007A3-FB0ZZ-1';
    const { ajustes } = aplicar(leerCodigoDeEstilo(viejo, normalizar({ contenido: 'linea' })), normalizar({ contenido: 'linea' }));
    expect([ajustes.estilo, ajustes.tarjeta, ajustes.vistas.materia, ajustes.accion]).toEqual(['plano', 'franja', 'tabla', '#7a3fb0']);
    expect(ajustes.contenido).toBe('linea');
  });

  // Made on 19/11, before the alignment and the width of the bar on top (version 2): they stay as the other one had them.
  it('un código de la versión 2 se sigue leyendo, sin tocar la alineación ni el ancho de la barra', () => {
    const viejo = 'CVG-24213-21712-22100-22303-H0BW1-06001-22213-1YHDA-1H006-MQQT1-C9G00-GM093-1127A-3FB0Z-0F9D5-8J';
    const tuyos = normalizar({ menu: { alineacion: 'izquierda', ancho: 'pantalla' } });
    const { ajustes } = aplicar(leerCodigoDeEstilo(viejo, tuyos), tuyos);
    expect(ajustes.menu).toMatchObject({ estilo: 'pastillas', posicion: 'izquierda', alineacion: 'izquierda', ancho: 'pantalla' });
    expect(ajustes.accion).toBe('#7a3fb0');
  });

  it('el fogonazo de Batman viaja en el código, y uno de antes lo trae prendido', () => {
    const apagado = codigoDeEstilo(normalizar({ ...MIOS, estilo: 'batman', fogonazo: false }), MIO);
    expect(aplicar(leerCodigoDeEstilo(apagado, TUYOS)).ajustes.fogonazo).toBe(false);
    const prendido = codigoDeEstilo(normalizar({ ...MIOS, estilo: 'batman' }), MIO);
    expect(aplicar(leerCodigoDeEstilo(prendido, { ...TUYOS, fogonazo: false })).ajustes.fogonazo).toBe(true);
    const viejo = 'CVG-42800-00C01-00011-00101-W01W0-B8050-00000-00000-00006-T4HR0-00000-000G0-00000-ZZZZM';
    expect(aplicar(leerCodigoDeEstilo(viejo, { ...TUYOS, fogonazo: false })).ajustes.fogonazo).toBe(true);
  });

  it('el borde de la cabecera de Pizarrón viaja en el código', () => {
    const mios = normalizar({ ...MIOS, estilo: 'pizarron', bandeja: '#2b6cb0' });
    const codigo = codigoDeEstilo(mios, MIO);
    const { ajustes } = aplicar(leerCodigoDeEstilo(codigo, TUYOS));
    expect([ajustes.estilo, ajustes.bandeja]).toEqual(['pizarron', '#2b6cb0']);
    expect(codigo.slice(4, 5)).toBe('9');
  });

  it('el color del tema viaja en el código, y uno de antes lo deja como el del tema', () => {
    const mios = normalizar({ ...MIOS, potente: true, temaColor: '#ec4899' });
    const codigo = codigoDeEstilo(mios, MIO);
    expect(aplicar(leerCodigoDeEstilo(codigo, { ...TUYOS, temaColor: '#10b981' })).ajustes.temaColor).toBe('#ec4899');
    const viejo = 'CVG-42800-00C01-00011-00101-W01W0-B8050-00000-00000-00006-T4HR0-00000-000G0-00000-ZZZZM';
    expect(aplicar(leerCodigoDeEstilo(viejo, { ...TUYOS, temaColor: '#10b981' })).ajustes.temaColor).toBe(null);
  });

  it('la cabecera viaja en el código, aparte del color principal', () => {
    const mios = normalizar({ ...MIOS, cabecera: '#121417' });
    const codigo = codigoDeEstilo(mios, MIO);
    const { ajustes } = aplicar(leerCodigoDeEstilo(codigo, TUYOS));
    expect([ajustes.accion, ajustes.cabecera]).toEqual(['#7a3fb0', '#121417']);
    expect(codigoDeEstilo(ajustes, MIO)).toBe(codigo);
  });

  // Made on 19/11, before the header's own color (version 3): Hoja and a bordó. The header goes back to the style's.
  it('un código de la versión 3 se sigue leyendo, con la cabecera del estilo', () => {
    const viejo = 'CVG-31000-00C01-00011-00101-W01W0-B8050-00000-00000-00006-T4HR0-00000-000G0-00000-8A1F3-DZZE';
    const tuyos = normalizar({ cabecera: '#ffffff' });
    const { ajustes } = aplicar(leerCodigoDeEstilo(viejo, tuyos), tuyos);
    expect([ajustes.estilo, ajustes.accion, ajustes.cabecera]).toEqual(['hoja', '#8a1f3d', null]);
  });

  // Made on 22/11, before the strong version of the themes (version 4): Profesional and Glaciar. It doesn't touch it.
  it('un código de la versión 4 se sigue leyendo, sin tocar la versión potente', () => {
    const viejo = 'CVG-42800-00C01-00011-00101-W01W0-B8050-00000-00000-00006-T4HR0-00000-000G0-00000-ZZZZM';
    const tuyos = normalizar({ potente: true });
    const { ajustes } = aplicar(leerCodigoDeEstilo(viejo, tuyos), tuyos);
    expect([ajustes.estilo, ajustes.tema, ajustes.potente]).toEqual(['profesional', 'glaciar', true]);
  });

  it('la versión potente viaja en el código', () => {
    const { ajustes } = aplicar(leerCodigoDeEstilo(codigoDeEstilo(normalizar({ tema: 'cosmico', potente: true, fondoCalidad: 'ultra' }), MIO), {}), normalizar({}));
    expect([ajustes.tema, ajustes.potente, ajustes.fondoMueve, ajustes.fondoCalidad]).toEqual(['cosmico', true, false, 'ultra']);
  });

  // Diseños entered the menu inside version 5: its order and places take 9 and 6 characters. The codes from before,
  // of any version, read exactly as they read at b3e648e, and Diseños starts where it starts (last, inside «Más»).
  it.each(CODIGOS_DE_ANTES.map((x) => [x.codigo.slice(4, 5), x.codigo, x.leido]))('un código de la versión %s de antes de Diseños se lee igual: %s', (_, codigo, leido) => {
    // The same, Batman's beam on, as it was before version 8, and the theme's color as the theme's, before version 9.
    expect(leerCodigoDeEstilo(codigo, TUYOS)).toEqual({ ...leido, ajustes: { ...leido.ajustes, fogonazo: true, temaColor: null } });
    const { ajustes } = aplicar(leerCodigoDeEstilo(codigo, TUYOS));
    expect(ajustes.menu.orden.at(-1)).toBe('disenos');
    expect(ajustes.menu.lugares.disenos).toBe('mas');
  });

  it('el código más largo, con todos los colores propios y los filtros, entra en el campo para pegarlo', () => {
    const todo = normalizar({ fondoFiltro: 'sepia', fondoIntensidad: 35, fondoTono: 290, fondoDesenfoque: 40, accion: '#123456', resaltador: '#abcdef', consultronColor: '#654321', cabecera: '#0f0f0f', bandeja: '#aabbcc', temaColor: '#ddeeff' });
    const codigo = codigoDeEstilo(todo, MIO);
    expect(codigo.length).toBeGreaterThan(120);
    expect(codigo.length).toBeLessThanOrEqual(MAX_ESCRITO);
    // What the Diseños service takes (supercvg-disenos/reglas.ts): 120 characters without «CVG» and the dashes.
    expect(codigo.replace(/^CVG-/, '').replace(/-/g, '').length).toBeLessThanOrEqual(120);
    expect(leerCodigoDeEstilo(codigo, TUYOS)).not.toBeNull();
  });

  it('los filtros del fondo viajan en el código: filtro, intensidad, tono y desenfoque', () => {
    const mios = normalizar({ fondoFiltro: 'sepia', fondoIntensidad: 35, fondoTono: 290, fondoDesenfoque: 40 });
    const { ajustes } = aplicar(leerCodigoDeEstilo(codigoDeEstilo(mios, MIO), TUYOS));
    expect([ajustes.fondoFiltro, ajustes.fondoIntensidad, ajustes.fondoTono, ajustes.fondoDesenfoque]).toEqual(['sepia', 35, 290, 40]);
    const topes = normalizar({ fondoFiltro: 'suave', fondoIntensidad: 100, fondoTono: 355, fondoDesenfoque: 100 });
    const leido = aplicar(leerCodigoDeEstilo(codigoDeEstilo(topes, MIO), TUYOS)).ajustes;
    expect([leido.fondoFiltro, leido.fondoIntensidad, leido.fondoTono, leido.fondoDesenfoque]).toEqual(['suave', 100, 355, 100]);
  });

  it('Diseños viaja en el código: su lugar en el menú y en el orden', () => {
    const mios = normalizar({ menu: { orden: ['disenos', 'hoy', 'materias'], lugares: { disenos: 'vista', hoy: 'mas' } } });
    const codigo = codigoDeEstilo(mios, MIO);
    expect(codigo[4]).toBe('9');
    const { ajustes } = aplicar(leerCodigoDeEstilo(codigo, TUYOS));
    expect(ajustes.menu.orden.slice(0, 3)).toEqual(['disenos', 'hoy', 'materias']);
    expect(ajustes.menu.lugares.disenos).toBe('vista');
    expect(ajustes.menu.lugares.hoy).toBe('mas');
    expect(codigoDeEstilo(ajustes, MIO)).toBe(codigo);
    const oculto = normalizar({ menu: { lugares: { disenos: 'oculta' } } });
    expect(aplicar(leerCodigoDeEstilo(codigoDeEstilo(oculto, MIO), TUYOS)).ajustes.menu.lugares.disenos).toBe('oculta');
  });

  it('cualquier orden del menú vuelve igual, también con las últimas pantallas primero', () => {
    for (const primera of ['envivo', 'consultron', 'disenos', 'repaso']) {
      const orden = [primera, ...[...EN_EL_MENU].reverse().filter((c) => c !== primera)];
      const { ajustes } = aplicar(leerCodigoDeEstilo(codigoDeEstilo(normalizar({ menu: { orden } }), MIO), TUYOS));
      expect(ajustes.menu.orden).toEqual(orden);
    }
  });

  it('un código nuevo nunca se lee como uno de antes ni al revés', () => {
    const lugares = ['vista', 'mas', 'oculta'];
    let semilla = 7;
    const azar = () => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla / 2147483648;
    };
    for (let n = 0; n < 200; n++) {
      const orden = [...EN_EL_MENU];
      for (let i = orden.length - 1; i > 0; i--) {
        const j = Math.floor(azar() * (i + 1));
        [orden[i], orden[j]] = [orden[j], orden[i]];
      }
      const menu = { orden, lugares: Object.fromEntries(EN_EL_MENU.map((c, i) => [c, lugares[(n + i) % 3]])) };
      const colores = n % 2 ? { accion: '#123456', cabecera: '#abcdef' } : {};
      const mios = normalizar({ menu, ...colores });
      const codigo = codigoDeEstilo(mios, MIO);
      const { ajustes } = aplicar(leerCodigoDeEstilo(codigo, TUYOS));
      expect(ajustes.menu.orden).toEqual(mios.menu.orden);
      expect(ajustes.menu.lugares).toEqual(mios.menu.lugares);
    }
  });

  it('un error de tipeo o algo que no es un código no pasa', () => {
    const codigo = codigoDeEstilo(MIOS, MIO);
    for (let i = 4; i < codigo.length; i++) {
      if (codigo[i] === '-') continue;
      const otro = codigo[i] === '2' ? '3' : '2';
      expect(leerCodigoDeEstilo(codigo.slice(0, i) + otro + codigo.slice(i + 1), {}), `lugar ${i}`).toBeNull();
    }
    expect(leerCodigoDeEstilo(codigo.slice(0, -2), {})).toBeNull();
    for (const basura of ['', 'hola', 'CVG-', 'https://supercvg.lutastudios.com', '<script>', 'x'.repeat(500), null, 42]) {
      expect(leerCodigoDeEstilo(basura, {})).toBeNull();
    }
  });
});
