import { describe, expect, it } from 'vitest';
import {
  AIRE,
  anillosLapiz,
  apoyoLapiz,
  bajoLapiz,
  describirEscena,
  ejesCamara,
  encuadrar,
  desdeBisagra,
  esquinasHoja,
  formaNota,
  girosDeVaiven,
  haciaBisagra,
  lapizEnEscena,
  PUNTOS_LAPIZ,
  posturaNota,
  proyectar,
  puntosEscena,
  puntosLapiz,
  puntosNota,
  radioCono,
  rotarXYZ,
  seccionHex,
} from './describir.js';
import { CUADERNO, DERIVADAS, ESPIRAL, LAPIZ, NOTA } from './medidas.js';
import { diasDeNotas, esPorSoftware } from './soporte.js';

const GRADO = Math.PI / 180;
const DIAS = [{ dia: 5, semana: 'jue' }, { dia: 9, semana: 'lun' }, { dia: 16, semana: 'lun' }];
const escena = describirEscena({ dias: DIAS });
const { cuaderno } = escena;
const tapa = cuaderno.tapa;
const yaw = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Pencil surface points in the cover's own frame.
const lapizEnTapa = () => puntosLapiz(escena, { paso: 0.5, vueltas: 36 }).map((p) => haciaBisagra(tapa, p));
// Every note point over a full float cycle.
const notaEnElTiempo = (nota) => Array.from({ length: 24 }, (_, i) => puntosNota(nota, { t: (i / 24) * 2 * nota.flota.periodo })).flat();

/** Is p inside a box of `tamano` centred at `centro`, grown by `margen` on every side? */
const dentroDeCaja = (p, tamano, centro, margen) => p.every((v, k) => Math.abs(v - centro[k]) < tamano[k] / 2 + margen);
const dentroDeHoja = (p, pieza, margen) => dentroDeCaja(haciaBisagra(pieza, p), pieza.tamano, [0, pieza.tamano[1] / 2, pieza.tamano[2] / 2], margen);

describe('medidas de los estándares', () => {
  it('el cuaderno es un A4 (ISO 216) y sus piezas también', () => {
    expect([CUADERNO.largo, CUADERNO.ancho]).toEqual([297, 210]);
    for (const pieza of [cuaderno.contratapa, cuaderno.bloque, tapa, ...cuaderno.hojas]) {
      expect(pieza.tamano[0]).toBe(297);
      expect(pieza.tamano[2]).toBe(210);
    }
    expect(CUADERNO.largo / CUADERNO.ancho).toBeCloseTo(Math.SQRT2, 2);
  });

  it('el grueso suma las tapas y las 80 hojas, con el aire justo para que no titilen', () => {
    const papel = cuaderno.bloque.tamano[1] + cuaderno.hojas.length * CUADERNO.hoja;
    expect(papel).toBeCloseTo(CUADERNO.hojas * CUADERNO.hoja, 6);
    expect(cuaderno.grueso).toBeCloseTo(CUADERNO.contratapa + papel + CUADERNO.tapa + (cuaderno.hojas.length + 1) * AIRE, 6);
  });

  it('el espiral va a paso 3:1 (8,47 mm) con 34 agujeros centrados en el lomo', () => {
    const { xs } = cuaderno.anillos;
    expect(ESPIRAL.paso).toBeCloseTo(8.467, 3);
    expect(xs).toHaveLength(34);
    xs.slice(1).forEach((x, i) => expect(x - xs[i]).toBeCloseTo(ESPIRAL.paso, 9));
    expect(xs[0] + xs.at(-1)).toBeCloseTo(0, 9);
    const margen = CUADERNO.largo / 2 + xs[0];
    expect(margen).toBeGreaterThan(5);
    expect(margen).toBeLessThan(12);
  });

  it('el lápiz mide 175 mm, con 7 mm entre caras y la esquina redondeada', () => {
    expect(PUNTOS_LAPIZ.fin - PUNTOS_LAPIZ.punta).toBeCloseTo(LAPIZ.largo, 9);
    const seccion = seccionHex();
    const alto = Math.max(...seccion.map((p) => p[0])) - Math.min(...seccion.map((p) => p[0]));
    expect(alto).toBeCloseTo(LAPIZ.entreCaras, 6);
    const lejos = Math.max(...seccion.map(([y, z]) => Math.hypot(y, z)));
    expect(lejos).toBeLessThan(DERIVADAS.radioEsquinas);
    expect(lejos).toBeGreaterThan(DERIVADAS.radioEsquinas - LAPIZ.esquina);
  });

  it('la punta tiene el cono de un sacapuntas y deja ver unos 4 mm de mina', () => {
    expect(Math.atan(radioCono(10) - radioCono(9)) * 2).toBeCloseTo(LAPIZ.cono * GRADO, 6);
    expect(radioCono(PUNTOS_LAPIZ.madera)).toBeCloseTo(LAPIZ.mina / 2, 9);
    const mina = PUNTOS_LAPIZ.madera - PUNTOS_LAPIZ.punta;
    expect(mina).toBeGreaterThan(3.5);
    expect(mina).toBeLessThan(6);
  });

  it('virola de 12 mm y goma de 6 mm afuera, con sus diámetros', () => {
    expect(PUNTOS_LAPIZ.finVirola - PUNTOS_LAPIZ.inicioVirola).toBe(LAPIZ.virola.largo);
    expect(PUNTOS_LAPIZ.fin - PUNTOS_LAPIZ.finVirola).toBeCloseTo(LAPIZ.goma.afuera, 9);
    expect(bajoLapiz((PUNTOS_LAPIZ.inicioVirola + PUNTOS_LAPIZ.finVirola) / 2) * 2).toBe(LAPIZ.virola.diametro);
    expect(bajoLapiz(PUNTOS_LAPIZ.fin - 2) * 2).toBe(LAPIZ.goma.diametro);
  });

  it('las notas miden 76 × 76 mm medidas sobre el papel, también con la curva', () => {
    const { puntos, columnas } = formaNota({ curva: 4 });
    const fila = puntos.slice(0, columnas + 1);
    expect(fila.at(-1)[0] - fila[0][0]).toBe(NOTA.lado);
    const borde = puntos.filter((_, i) => i % (columnas + 1) === 0);
    let largo = 0;
    for (let i = 1; i < borde.length; i++) largo += Math.hypot(borde[i][1] - borde[i - 1][1], borde[i][2] - borde[i - 1][2]);
    expect(largo).toBeCloseTo(NOTA.lado, 2);
    // The adhesive band stays flat.
    expect(borde.filter((p) => p[2] < -NOTA.lado / 2 + NOTA.adhesivo - 0.01).every((p) => p[1] === 0)).toBe(true);
  });
});

describe('proporciones', () => {
  it('el lápiz es 25 veces más largo que ancho y entra en la diagonal del cuaderno', () => {
    expect(LAPIZ.largo / LAPIZ.entreCaras).toBe(25);
    expect(LAPIZ.largo).toBeLessThan(Math.hypot(CUADERNO.largo, CUADERNO.ancho));
  });

  it('cada aro es más grande que el grueso del cuaderno, así la tapa gira', () => {
    expect(ESPIRAL.diametro).toBeGreaterThan(cuaderno.grueso + ESPIRAL.alambre * 2);
  });

  it('las notas son cuadradas y caben cuatro a lo ancho del A4', () => {
    expect(NOTA.lado * 2).toBeLessThan(CUADERNO.ancho);
    expect(NOTA.lado * 3).toBeLessThan(CUADERNO.largo);
  });
});

describe('cada pieza en su lugar', () => {
  it('es una función pura', () => {
    expect(describirEscena({ dias: DIAS })).toEqual(escena);
  });

  it('nada queda por debajo del piso que recibe las sombras', () => {
    const minimo = Math.min(...puntosEscena(escena).map((p) => p[1]));
    expect(minimo).toBeGreaterThanOrEqual(escena.suelo);
    expect(minimo - escena.suelo).toBeLessThan(0.1);
  });

  it('el lápiz apoya sobre la tapa, sin hundirse ni flotar', () => {
    const minimo = Math.min(...lapizEnTapa().map((p) => p[1]));
    expect(minimo - tapa.tamano[1]).toBeGreaterThanOrEqual(0);
    expect(minimo - tapa.tamano[1]).toBeLessThan(AIRE + 0.01);
    const { inclinacion, apoyos } = apoyoLapiz();
    expect(Math.abs(inclinacion)).toBeLessThan(0.5 * GRADO);
    // On the flat near the point and on the ferrule, the two widest parts.
    expect(apoyos[0][1]).toBeCloseTo(-DERIVADAS.apotema, 9);
    expect(apoyos[1][1]).toBeCloseTo(-LAPIZ.virola.diametro / 2, 9);
  });

  it('el lápiz queda entero sobre la tapa, lejos de los agujeros', () => {
    for (const [x, , z] of lapizEnTapa()) {
      expect(Math.abs(x)).toBeLessThan(CUADERNO.largo / 2 - 10);
      expect(z).toBeGreaterThan(ESPIRAL.margen + ESPIRAL.agujero[1] + 10);
      expect(z).toBeLessThan(CUADERNO.ancho - 10);
    }
  });

  it('las hojas sueltas y la tapa se abren en abanico sin cruzarse', () => {
    const piezas = [...cuaderno.hojas, tapa];
    const yBloque = cuaderno.bloque.centro[1] + cuaderno.bloque.tamano[1] / 2;
    expect(piezas[0].pivote[1]).toBeGreaterThan(yBloque);
    // Corners of every piece stay over the notebook's footprint.
    for (const p of piezas) for (const [x, , z] of esquinasHoja(p)) expect(Math.abs(x) <= 148.5 + 0.1 && Math.abs(z) <= 105 + 0.1).toBe(true);
    for (let i = 1; i < piezas.length; i++) {
      expect(piezas[i].angulo).toBeGreaterThan(piezas[i - 1].angulo);
      for (const z of [0, 50, 105, 160, 210]) {
        expect(desdeBorde(piezas[i], z, 0)).toBeGreaterThan(desdeBorde(piezas[i - 1], z, piezas[i - 1].tamano[1]));
      }
    }
    // The cover opens just a few degrees: the fan shows at the free edge without hiding the pencil.
    expect(tapa.angulo).toBeLessThan(5 * GRADO);
  });

  it('el alambre pasa por dentro del agujero en las dos caras y a media altura', () => {
    const { radio, alambre, centro } = cuaderno.anillos;
    const lomo = -CUADERNO.ancho / 2;
    const [desde, hasta] = [lomo + ESPIRAL.margen - ESPIRAL.agujero[1] / 2, lomo + ESPIRAL.margen + ESPIRAL.agujero[1] / 2];
    for (const y of [0, cuaderno.grueso]) {
      const z = centro[1] + Math.sqrt(radio ** 2 - (y - centro[0]) ** 2);
      expect(z - alambre).toBeGreaterThan(desde);
      expect(z + alambre).toBeLessThan(hasta);
    }
    expect(centro[1] + radio + alambre).toBeLessThan(hasta);
    expect(centro[0]).toBeCloseTo(cuaderno.grueso / 2, 9);
  });

  it('las notas no tocan el cuaderno, el espiral, el lápiz ni entre ellas mientras flotan', () => {
    const lapiz = puntosLapiz(escena, { paso: 1, vueltas: 8 });
    const { radio, alambre, centro, xs } = cuaderno.anillos;
    const espiral = { tamano: [xs.at(-1) - xs[0] + 6, 2 * (radio + alambre), 2 * (radio + alambre)], centro: [0, centro[0], centro[1]] };
    for (const nota of escena.notas) {
      for (const p of notaEnElTiempo(nota)) {
        expect(dentroDeCaja(p, cuaderno.contratapa.tamano, cuaderno.contratapa.centro, 3)).toBe(false);
        expect(dentroDeCaja(p, cuaderno.bloque.tamano, cuaderno.bloque.centro, 3)).toBe(false);
        for (const h of [...cuaderno.hojas, tapa]) expect(dentroDeHoja(p, h, 3)).toBe(false);
        expect(dentroDeCaja(p, espiral.tamano, espiral.centro, 3)).toBe(false);
        expect(Math.min(...lapiz.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])))).toBeGreaterThan(8);
      }
    }
    // Two notes can only meet if their centres come closer than a diagonal (plus what they float).
    const [a, b, c] = escena.notas;
    for (const [m, n] of [[a, b], [a, c], [b, c]]) {
      const lejos = Math.hypot(m.centro[0] - n.centro[0], m.centro[1] - n.centro[1], m.centro[2] - n.centro[2]);
      expect(lejos).toBeGreaterThan(NOTA.lado * Math.SQRT2 + m.flota.amplitud + n.flota.amplitud);
    }
  });

  it('cada nota muestra su día y su color de materia', () => {
    expect(escena.notas.map((n) => [n.dia, n.semana, n.color])).toEqual([
      [5, 'jue', '--materia-0'],
      [9, 'lun', '--materia-1'],
      [16, 'lun', '--materia-2'],
    ]);
  });

  it('desde la vista de entrada las notas se leen derechas y no de canto', () => {
    const { arriba, atras } = ejesCamara(escena.camara.elevacion);
    for (const nota of escena.notas) {
      const girar = (v) => yaw(rotarXYZ(v, nota.giro), escena.camara.giro);
      // The top of the text (the adhesive band, -z) points up on screen.
      expect(dot(girar([0, 0, -1]), arriba)).toBeGreaterThan(0.6);
      // The printed face looks at the camera, not edge on.
      expect(dot(girar([0, 1, 0]), atras)).toBeGreaterThan(Math.cos(65 * GRADO));
    }
  });

  it('flota apenas y con «reducir movimiento» queda quieta', () => {
    const nota = escena.notas[0];
    expect(posturaNota(nota, 1.3, true)).toEqual({ y: nota.centro[1], giro: nota.giro });
    for (let t = 0; t < 10; t += 0.37) {
      const { y, giro } = posturaNota(nota, t, false);
      expect(Math.abs(y - nota.centro[1])).toBeLessThanOrEqual(nota.flota.amplitud + 1e-9);
      expect(Math.abs(giro[2] - nota.giro[2])).toBeLessThanOrEqual(nota.vaiven + 1e-9);
    }
  });
});

describe('el lápiz afilado', () => {
  it('cerca de la punta es todo madera, después aparece el festón y atrás todo pintado', () => {
    const anillos = anillosLapiz();
    expect(anillos[0].pintado.every((p) => !p)).toBe(true);
    expect(anillos.at(-1).pintado.every(Boolean)).toBe(true);
    const festones = anillos.filter((a) => a.pintado.some(Boolean) && a.pintado.some((p) => !p));
    expect(festones.length).toBeGreaterThan(5);
    // In the scallop, the middle of each flat is still painted while the corners are already cut.
    for (const a of festones) for (const [y, z] of a.puntos) expect(Math.hypot(y, z)).toBeLessThanOrEqual(radioCono(a.x) + 1e-9);
  });

  it('el festón empieza donde el cono alcanza la cara y termina en la esquina', () => {
    const anillos = anillosLapiz();
    const festones = anillos.filter((a) => a.pintado.some(Boolean) && a.pintado.some((p) => !p));
    expect(radioCono(festones[0].x)).toBeGreaterThanOrEqual(DERIVADAS.apotema - 1e-9);
    const lejos = Math.max(...seccionHex().map(([y, z]) => Math.hypot(y, z)));
    expect(radioCono(festones.at(-1).x)).toBeLessThan(lejos);
  });
});

describe('encuadre', () => {
  it.each([[16 / 9], [1], [2.4]])('con aspecto %f todo entra en cuadro durante el vaivén', (aspecto) => {
    const puntos = puntosEscena(escena);
    const giros = girosDeVaiven(escena, escena.camara.giro);
    const marco = encuadrar(puntos, { giros, elevacion: escena.camara.elevacion, aspecto, fov: escena.camara.fov });
    const tanV = Math.tan((escena.camara.fov * GRADO) / 2);
    let [maxX, maxY] = [0, 0];
    for (const g of giros) {
      for (const p of puntos) {
        const [x, y, fondo] = proyectar(yaw(p, g), marco, escena.camara.elevacion);
        expect(fondo).toBeGreaterThan(0);
        maxX = Math.max(maxX, Math.abs(x));
        maxY = Math.max(maxY, Math.abs(y));
      }
    }
    expect(maxX).toBeLessThanOrEqual(tanV * aspecto + 1e-9);
    expect(maxY).toBeLessThanOrEqual(tanV + 1e-9);
    // Tight: one of the two directions fills the frame up to its margin.
    expect(Math.max(maxX / (tanV * aspecto), maxY / tanV)).toBeGreaterThan(0.9);
  });

  it('el lápiz que se ve es el mismo que apoya', () => {
    const punta = lapizEnEscena(escena, [PUNTOS_LAPIZ.punta, 0, 0]);
    const goma = lapizEnEscena(escena, [PUNTOS_LAPIZ.fin, 0, 0]);
    expect(Math.hypot(punta[0] - goma[0], punta[1] - goma[1], punta[2] - goma[2])).toBeCloseTo(LAPIZ.largo, 6);
  });
});

describe('días de las notas', () => {
  it('cuenta desde hoy y cruza de mes', () => {
    expect(diasDeNotas(new Date(2026, 10, 3))).toEqual(DIAS);
    expect(diasDeNotas(new Date(2026, 10, 28)).map((d) => d.dia)).toEqual([30, 4, 11]);
  });
});

/** Height of a hinged piece's face (its bottom at 0, top at its thickness) at distance z from the hinge. */
const desdeBorde = (pieza, z, alto) => desdeBisagra(pieza, [0, alto, z])[1];

describe('esPorSoftware', () => {
  it('spots CPU renderers and lets real GPUs through', () => {
    expect(esPorSoftware('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(esPorSoftware('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(esPorSoftware('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)')).toBe(true);
    expect(esPorSoftware('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(esPorSoftware('Apple GPU')).toBe(false);
    expect(esPorSoftware(undefined)).toBe(false);
  });
});
