import { describe, expect, it } from 'vitest';
import { normalizar } from './ajustes';
import { codigoDeEstilo, leerCodigoDeEstilo } from './codigoDeEstilo';
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
