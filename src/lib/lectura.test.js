import { beforeEach, describe, expect, it } from 'vitest';
import {
  alcanzaParaBuscar, buscarEnIndice, docDe, docDeResumen, esDoc, hallarEn, hallarEnDocumento, hallarPalabras, MAX_NOMBRE_SENALADOR, MAX_SENALADORES, palabrasDe, piezaEn, plegar, recorte, sanearLecturas, sanearResaltado, sanearSenalador, textoDePagina, TOPE_HALLAZGOS,
} from './lectura';
import { fijarUsuario, mioActual, sanearMio } from './mio';
import { borrarResaltado, cambiarResaltado, lecturaDe, recordarPagina, resaltar, sacarSenalador, senalar } from './resaltados';
import { marcar, piezas, unir } from './union';

const resaltado = (extra = {}) => ({ id: 1_790_000_000_000_001, pagina: 3, cajas: [[0.1, 0.2, 0.5, 0.02]], desde: 40, hasta: 52, color: 'verde', nota: 'Entra en el parcial', creado: 1_790_000_000_000, cambiado: 1_790_000_000_000, ...extra });

describe('la clave de cada archivo', () => {
  it('es solo de números: la materia y la clave del campus, o la de un archivo tuyo', () => {
    expect(docDe({ materiaId: 7, clave: '101' })).toBe('7-101');
    expect(docDe({ materiaId: 7, clave: '101.k3j9' })).toBe('7-101.k3j9');
    expect(docDe({ propio: true, archivoId: 'archivo0001', nombre: 'tp.pdf' })).toBe('aarchivo0001');
    expect(docDe({ materiaId: 7, clave: 'c55', origen: 'classroom' })).toBeNull();
    expect(docDe({ propio: true, nombre: 'tp.pdf' })).toBeNull();
    expect(docDe({ materiaId: 'Materia A', clave: '101' })).toBeNull();
    expect(esDoc('7-apunte.pdf')).toBe(false);
    expect(docDeResumen('0B6F1C2A-1d2e-4f5a-8b9c-0d1e2f3a4b5c')).toBe('r0b6f1c2a1d2e4f5a8b9c0d1e2f3a4b5c');
    expect(esDoc(docDeResumen('0b6f1c2a-1d2e-4f5a-8b9c-0d1e2f3a4b5c'))).toBe(true);
    expect(docDeResumen('0b6f1c2a1d2e4f5a8b9c0d1e2f3a4b5c')).toBeNull();
    expect(docDeResumen('../0b6f1c2a-1d2e-4f5a-8b9c-0d1e2f3a4b5c')).toBeNull();
    expect(docDeResumen(null)).toBeNull();
    expect(esDoc('r0b6f1c2a')).toBe(false);
  });
});

describe('un resaltado', () => {
  it('guarda solo dónde está, el color, la nota y las fechas', () => {
    const limpio = sanearResaltado({ ...resaltado(), texto: 'el texto del PDF', cita: 'semáforo', nombre: 'apunte.pdf' });
    expect(limpio).toEqual(resaltado());
    expect(Object.keys(limpio).sort()).toEqual(['cajas', 'cambiado', 'color', 'creado', 'desde', 'hasta', 'id', 'nota', 'pagina']);
  });

  it('las cajas van de 0 a 1 y se redondean; las que se salen no entran', () => {
    const limpio = sanearResaltado(resaltado({ cajas: [[0.123456, 0.2, 0.3, 0.01], [0.9, 0.1, 0.5, 0.1], [-0.1, 0, 0.2, 0.2], [0.1, 0.1, 0, 0.1], 'x'] }));
    expect(limpio.cajas).toEqual([[0.1235, 0.2, 0.3, 0.01]]);
    expect(sanearResaltado(resaltado({ cajas: [[2, 2, 1, 1]] }))).toBeNull();
  });

  it('un color que no es de la lista queda amarillo, y la nota se corta al tope', () => {
    const limpio = sanearResaltado(resaltado({ color: 'url(javascript:x)', nota: `  ${'a'.repeat(3000)}` }));
    expect(limpio.color).toBe('amarillo');
    expect(limpio.nota.length).toBe(2000);
  });

  it('sin id, sin página o con lugares del texto al revés: lo que no se puede usar se descarta', () => {
    expect(sanearResaltado(resaltado({ id: 'uno' }))).toBeNull();
    expect(sanearResaltado(resaltado({ pagina: 0 }))).toBeNull();
    expect(sanearResaltado(resaltado({ desde: 60, hasta: 50 }))).toMatchObject({ desde: null, hasta: null });
  });

  it('por archivo: ordenados por página, sin repetidos, y un archivo sin nada no se guarda', () => {
    const lecturas = sanearLecturas({
      '7-101': { pagina: 4, resaltados: [resaltado({ id: 2, pagina: 5 }), resaltado({ id: 1 }), resaltado({ id: 1, pagina: 9 })] },
      '7-102': { pagina: 1, resaltados: [] },
      'apunte.pdf': { pagina: 2, resaltados: [resaltado()] },
      aarchivo0001: { pagina: 12 },
    });
    expect(Object.keys(lecturas)).toEqual(['7-101', 'aarchivo0001']);
    expect(lecturas['7-101'].resaltados.map((r) => [r.id, r.pagina])).toEqual([[1, 3], [2, 5]]);
    expect(lecturas.aarchivo0001).toEqual({ pagina: 12, resaltados: [], senaladores: [] });
    expect(sanearLecturas('nada')).toEqual({});
    expect(sanearMio({}).lecturas).toEqual({});
  });
});

describe('un señalador', () => {
  it('guarda solo la página y cuándo se puso', () => {
    expect(sanearSenalador({ pagina: 4, creado: 1_790_000_000_000, texto: 'Semáforos', archivo: 'apunte.pdf' })).toEqual({ pagina: 4, creado: 1_790_000_000_000 });
    // Its name: one line, without control characters, up to its tope; an empty one is no name.
    expect(sanearSenalador({ pagina: 4, creado: 5, nombre: '  Teorema\nde\u202eBayes  ' })).toEqual({ pagina: 4, creado: 5, nombre: 'Teorema de Bayes' });
    expect(sanearSenalador({ pagina: 4, creado: 5, nombre: 'x'.repeat(MAX_NOMBRE_SENALADOR + 9) }).nombre).toHaveLength(MAX_NOMBRE_SENALADOR);
    for (const nombre of ['', '   ', 7, null, ['a']]) expect(sanearSenalador({ pagina: 4, creado: 5, nombre })).toEqual({ pagina: 4, creado: 5 });
    expect(sanearSenalador({ pagina: 4 })).toEqual({ pagina: 4, creado: 1 });
    for (const pagina of [0, -2, 1.5, '4', 100_001, null]) expect(sanearSenalador({ pagina, creado: 5 })).toBeNull();
    expect(sanearSenalador('4')).toBeNull();
  });

  it('por archivo: uno por página, en orden, con tope, y un archivo con solo señaladores se guarda', () => {
    const lecturas = sanearLecturas({
      '7-101': { senaladores: [{ pagina: 9, creado: 3 }, { pagina: 2, creado: 4 }, { pagina: 9, creado: 5 }, { pagina: 'x' }] },
      '7-102': { senaladores: 'todas' },
      '7-103': { senaladores: Array.from({ length: MAX_SENALADORES + 50 }, (_, i) => ({ pagina: MAX_SENALADORES + 50 - i, creado: 7 })) },
    });
    expect(Object.keys(lecturas)).toEqual(['7-101', '7-103']);
    expect(lecturas['7-101']).toEqual({ pagina: null, resaltados: [], senaladores: [{ pagina: 2, creado: 4 }, { pagina: 9, creado: 3 }] });
    expect(lecturas['7-103'].senaladores).toHaveLength(MAX_SENALADORES);
    expect(lecturas['7-103'].senaladores[0].pagina).toBe(1);
  });
});

describe('guardados por alumno', () => {
  beforeEach(() => {
    localStorage.clear();
    fijarUsuario(null);
    fijarUsuario(5);
  });

  it('se resalta, se cambia la nota y el color, se borra, y la página queda', () => {
    expect(resaltar('7-101', resaltado())).toBe(true);
    expect(cambiarResaltado('7-101', resaltado().id, { color: 'rosa', nota: 'Repasar' }, 1_790_000_100_000)).toBe(true);
    expect(lecturaDe(mioActual(), '7-101').resaltados[0]).toMatchObject({ color: 'rosa', nota: 'Repasar', cambiado: 1_790_000_100_000, pagina: 3 });
    expect(recordarPagina('7-101', 8)).toBe(true);
    expect(borrarResaltado('7-101', resaltado().id)).toBe(true);
    expect(lecturaDe(mioActual(), '7-101')).toEqual({ pagina: 8, resaltados: [], senaladores: [] });
    expect(recordarPagina('7-101', 1)).toBe(true);
    expect(mioActual().lecturas).toEqual({});
    expect(resaltar('apunte.pdf', resaltado())).toBe(false);
  });

  it('se señala una página, se saca, y sin nada más el archivo no queda', () => {
    expect(senalar('7-101', 5, 1_790_000_000_000)).toBe(true);
    expect(senalar('7-101', 2, 1_790_000_100_000)).toBe(true);
    // Again on the same page: it stays as it was.
    expect(senalar('7-101', 5, 1_790_000_200_000)).toBe(true);
    expect(lecturaDe(mioActual(), '7-101').senaladores).toEqual([{ pagina: 2, creado: 1_790_000_100_000 }, { pagina: 5, creado: 1_790_000_000_000 }]);
    expect(sacarSenalador('7-101', 2)).toBe(true);
    expect(sacarSenalador('7-101', 5)).toBe(true);
    expect(mioActual().lecturas).toEqual({});
    expect(senalar('apunte.pdf', 3)).toBe(false);
    expect(senalar('7-101', 0)).toBe(false);
  });

  it('un archivo lleno de señaladores no suma otro, y sacando uno vuelve a entrar', () => {
    for (let n = 1; n <= MAX_SENALADORES; n++) expect(senalar('7-101', n, 1_790_000_000_000 + n)).toBe(true);
    expect(senalar('7-101', MAX_SENALADORES + 1)).toBe(false);
    expect(senalar('7-101', 7)).toBe(true);
    sacarSenalador('7-101', 7);
    expect(senalar('7-101', MAX_SENALADORES + 1)).toBe(true);
    expect(lecturaDe(mioActual(), '7-101').senaladores).toHaveLength(MAX_SENALADORES);
  });

  it('en el disco no queda ni una letra del PDF', () => {
    resaltar('7-101', { ...resaltado(), cita: 'Semáforos binarios' });
    senalar('7-101', 4);
    expect(localStorage.getItem('cl.mio.5')).not.toMatch(/Sem[aá]foro/);
    expect(JSON.parse(localStorage.getItem('cl.mio.5')).lecturas['7-101'].senaladores).toEqual([{ pagina: 4, creado: expect.any(Number) }]);
  });
});

describe('en la copia de Drive', () => {
  const datos = () => sanearMio({ lecturas: { '7-101': { pagina: 4, resaltados: [resaltado()] } } });

  it('cada resaltado y la página son elementos, y se arman de vuelta igual', () => {
    const p = piezas(datos());
    expect(Object.keys(p).filter((k) => k.startsWith('r/'))).toEqual(['r/7-101/pagina', `r/7-101/h/${resaltado().id}`]);
    expect(sanearMio(unir({ datos: datos() }, null).datos).lecturas).toEqual(datos().lecturas);
  });

  it('la nota de un resaltado escrita en dos dispositivos queda con las dos versiones', () => {
    const base = datos();
    const conNota = (nota) => sanearMio({ lecturas: { '7-101': { pagina: 4, resaltados: [resaltado({ nota, cambiado: 1_790_000_200_000 })] } } });
    const t = Object.fromEntries(Object.keys(piezas(base)).map((k) => [k, 10]));
    const aca = marcar({ t, d: {} }, base, conNota('Pregunta de final'), 20);
    const alla = marcar({ t, d: {} }, base, conNota('Lo dijo en clase'), 30);
    const unido = sanearMio(unir({ datos: conNota('Pregunta de final'), ...aca }, { datos: conNota('Lo dijo en clase'), t: alla.t }).datos);
    expect(unido.lecturas['7-101'].resaltados[0].nota).toBe('Lo dijo en clase\n\nPregunta de final');
  });

  it('cada señalador es un elemento con la página en la clave y cuándo se puso, y se arma de vuelta igual', () => {
    const d = sanearMio({ lecturas: { '7-101': { senaladores: [{ pagina: 12, creado: 1_790_000_000_000 }, { pagina: 3, creado: 1_790_000_100_000 }] } } });
    const p = piezas(d);
    expect(Object.entries(p).filter(([k]) => k.startsWith('r/'))).toEqual([['r/7-101/s/3', 1_790_000_100_000], ['r/7-101/s/12', 1_790_000_000_000]]);
    expect(sanearMio(unir({ datos: d }, null).datos).lecturas).toEqual(d.lecturas);
  });
});

describe('el texto de una página', () => {
  const items = [{ str: 'Semáforos', hasEOL: true }, { type: 'beginMarkedContent' }, { str: 'El semáforo ', hasEOL: false }, { str: 'binario', hasEOL: true }, { str: '' }];

  it('es la suma de sus piezas, con un salto donde termina un renglón', () => {
    expect(textoDePagina(items)).toEqual({ texto: 'Semáforos\nEl semáforo binario\n', inicios: [0, 10, 22, 30] });
    expect(piezaEn([0, 10, 22, 30], 0)).toBe(0);
    expect(piezaEn([0, 10, 22, 30], 21)).toBe(1);
    expect(piezaEn([0, 10, 22, 30], 25)).toBe(2);
    expect(piezaEn([], 3)).toBe(-1);
  });

  it('plegado: sin tildes, en minúscula y con un solo espacio, sabiendo de dónde salió cada letra', () => {
    const { plano, origen } = plegar('Ñandú  ﬁnal\n\nÁrbol');
    expect(plano).toBe('nandu final arbol');
    expect(origen[0]).toBe(0);
    expect(origen[plano.indexOf('fi')]).toBe(7);
    expect(origen[plano.indexOf('fi') + 1]).toBe(7);
    expect(origen[plano.indexOf('arbol')]).toBe(13);
    expect(palabrasDe('  Semáforo   BINARIO ')).toEqual(['semaforo', 'binario']);
  });
});

describe('buscar en el documento', () => {
  const pagina = (texto) => ({ ...plegar(texto), texto });
  const paginas = [pagina('El semáforo binario protege la sección crítica.'), null, pagina('Un SEMÁFORO contador. Otro semaforo.')];

  it('marca cada vez que aparece, con su lugar en el texto de la página', () => {
    const hallados = hallarEnDocumento(paginas, 'semaforo');
    expect(hallados).toEqual([{ pagina: 1, desde: 3, hasta: 11 }, { pagina: 3, desde: 3, hasta: 11 }, { pagina: 3, desde: 27, hasta: 35 }]);
    expect(paginas[0].texto.slice(3, 11)).toBe('semáforo');
  });

  it('lo escrito junto primero; si junto no está, cada palabra por su lado', () => {
    expect(hallarEnDocumento(paginas, 'semaforo binario')).toEqual([{ pagina: 1, desde: 3, hasta: 19 }]);
    expect(hallarEnDocumento(paginas, 'critica semaforo').map((h) => h.pagina)).toEqual([1, 1, 3, 3]);
    expect(hallarEnDocumento(paginas, '   ')).toEqual([]);
  });

  it('con una letra no busca, y no marca más que el tope', () => {
    expect(hallarEnDocumento(paginas, 'e')).toEqual([]);
    expect(hallarEnDocumento(paginas, ' é ')).toEqual([]);
    expect(alcanzaParaBuscar('e')).toBe(false);
    expect(alcanzaParaBuscar('el')).toBe(true);
    expect(hallarEnDocumento(paginas, 'or').length).toBeGreaterThan(2);
    expect(hallarEnDocumento(paginas, 'or', 2)).toHaveLength(2);
    const larga = [pagina('ab '.repeat(800))];
    expect(hallarEnDocumento(larga, 'ab')).toHaveLength(TOPE_HALLAZGOS);
    // Each word by its side: the ones of one letter don't count.
    expect(hallarEnDocumento(paginas, 'y critica').map((h) => h.pagina)).toEqual([1]);
  });

  it('al inicio de palabra, sin pisarse', () => {
    expect(hallarEn('el foro del semaforo', 'foro', { alInicio: true })).toEqual([[3, 7]]);
    expect(hallarEn('aaaa', 'aa')).toEqual([[0, 2], [2, 4]]);
    expect(hallarPalabras('sistema operativo', ['sistema', 'sis'])).toEqual([[0, 7]]);
  });
});

describe('el recorte de un resultado', () => {
  const largo = `${'Introducción a los procesos del sistema. '.repeat(4)}El semáforo binario cuida la sección crítica y el semáforo contador cuenta. ${'Más texto que sigue después. '.repeat(6)}`;

  it('es corto, empieza cerca de la palabra y la marca cada vez', () => {
    const partes = recorte(largo, ['semaforo']);
    const texto = partes.map((p) => p.texto).join('');
    expect(texto.length).toBeLessThanOrEqual(170);
    expect(texto.startsWith('…')).toBe(true);
    expect(texto.endsWith('…')).toBe(true);
    expect(partes.filter((p) => p.marca).map((p) => p.texto)).toEqual(['semáforo', 'semáforo']);
  });

  it('sin cortes si entra entero, y los espacios de más se juntan', () => {
    expect(recorte('Parcial:\n  el  martes', ['martes'])).toEqual([{ texto: 'Parcial: el ', marca: false }, { texto: 'martes', marca: true }]);
    expect(recorte('nada que ver', ['semaforo'])).toEqual([]);
  });
});

describe('el índice de los PDF', () => {
  const doc = (...textos) => ({ paginas: textos.map((t) => ({ texto: t, plano: plegar(t).plano })) });
  const indice = new Map([
    ['1-11', doc('Portada del apunte', 'El semáforo binario', 'Otro semáforo binario', 'El binario solo')],
    ['1-12', doc('Semáforos', 'Nada de binarios por acá')],
    ['2-21', doc('Solo una palabra: semáforo')],
  ]);

  it('da cada archivo con todas las palabras, la primera página con todas y cuántas más las tienen', () => {
    const hallados = buscarEnIndice(indice, 'semaforo binari');
    expect([...hallados.keys()]).toEqual(['1-11', '1-12']);
    expect(hallados.get('1-11')).toMatchObject({ pagina: 2, otras: 1 });
    expect(hallados.get('1-11').partes.filter((p) => p.marca).map((p) => p.texto)).toEqual(['semáforo', 'binari']);
    // Not together on one page: the page with most of them.
    expect(hallados.get('1-12')).toMatchObject({ pagina: 1, otras: 0 });
  });

  it('busca al inicio de cada palabra y sin palabras no da nada', () => {
    expect([...buscarEnIndice(indice, 'aforo').keys()]).toEqual([]);
    expect(buscarEnIndice(indice, ' ').size).toBe(0);
  });
});
