import { describe, expect, it } from 'vitest';
import { buscarFechas, candidatos, TOPE_BYTES, unirHallazgos, yaSumada } from './cazador';
import { huella } from './datos';

// Lunes 2 de noviembre de 2026, 10:00.
const AHORA = new Date(2026, 10, 2, 10, 0).getTime() / 1000;
const seg = (a, m, d, h = 12, min = 0) => new Date(a, m - 1, d, h, min).getTime() / 1000;
const buscar = (texto, ahora = AHORA) => buscarFechas(texto, ahora);
const una = (texto, ahora) => {
  const r = buscar(texto, ahora);
  expect(r, texto).toHaveLength(1);
  return r[0];
};

describe('formas de escribir una fecha', () => {
  it.each([
    ['Parcial 15/11/2026', seg(2026, 11, 15)],
    ['Parcial 15-11-26', seg(2026, 11, 15)],
    ['Parcial 15/11', seg(2026, 11, 15)],
    ['Parcial 5/1/27', seg(2027, 1, 5)],
    ['Parcial 15.11.2026', seg(2026, 11, 15)],
    ['Parcial 15 de noviembre', seg(2026, 11, 15)],
    ['Parcial sábado 15 de noviembre de 2026', seg(2026, 11, 15)],
    ['PARCIAL SABADO 15 DE NOVIEMBRE', seg(2026, 11, 15)],
    ['Parcial 15 de noviembre 2026', seg(2026, 11, 15)],
    ['Parcial 1° de diciembre', seg(2026, 12, 1)],
    ['Parcial 1ro de diciembre', seg(2026, 12, 1)],
    ['Parcial 15 de setiembre de 2027', seg(2027, 9, 15)],
    ['Parcial 15-nov-26', seg(2026, 11, 15)],
    ['Parcial 15 nov', seg(2026, 11, 15)],
    ['Parcial (15/11)', seg(2026, 11, 15)],
    ['Parcial: lun. 16/11.', seg(2026, 11, 16)],
    ['Parcial 15 / 11 / 2026', seg(2026, 11, 15)],
    ['Parcial 15–11–2026', seg(2026, 11, 15)],
  ])('%s', (texto, cuando) => {
    const f = una(texto);
    expect(f.cuando).toBe(cuando);
    expect(f.sinHora).toBe(true);
    expect(f.fuerte).toBe(true);
    expect(f.titulo.toLowerCase()).toBe('parcial');
  });

  it('no hay 31 de febrero, ni 31 de noviembre, ni mes 13', () => {
    expect(buscar('Parcial 31/2/2027')).toEqual([]);
    expect(buscar('Parcial 31/11')).toEqual([]);
    expect(buscar('Parcial 31 de noviembre')).toEqual([]);
    expect(buscar('Parcial 12/13')).toEqual([]);
    expect(buscar('Parcial 29/2/2027')).toEqual([]);
    expect(una('Parcial 29/2/2028', seg(2027, 6, 1)).cuando).toBe(seg(2028, 2, 29));
  });
});

describe('título', () => {
  it('los separadores que quedan al sacar la fecha y la hora no se ven', () => {
    expect(una('Parcial recuperatorio de teoría: Jueves 5/11 – 17:40 Hs – aula 201.').titulo).toBe('Parcial recuperatorio de teoría: aula 201');
  });
});

describe('hora cercana', () => {
  it.each([
    ['Parcial 15/11 a las 18:00', 18, 0],
    ['Parcial 15/11 a las 18', 18, 0],
    ['Parcial 15/11 18 hs', 18, 0],
    ['Parcial 15/11 18hs', 18, 0],
    ['Parcial 15/11 18.30 h', 18, 30],
    ['Parcial 15/11 18:30', 18, 30],
    ['Parcial 15/11 18:30 hs.', 18, 30],
    ['Parcial 15/11 18h30', 18, 30],
    ['Parcial 15/11 de 14 a 16 hs', 14, 0],
    ['Parcial 15/11 de 14:30 a 16:30 hs', 14, 30],
    ['Parcial a las 19 hs, el 15/11', 19, 0],
    ['Parcial 15 de noviembre de 2026, 8:15', 8, 15],
  ])('%s', (texto, hora, minutos) => {
    const f = una(texto);
    expect(f.sinHora).toBe(false);
    expect(f.cuando).toBe(seg(2026, 11, 15, hora, minutos));
    expect(f.titulo).toBe('Parcial');
  });

  it.each([
    'Parcial 15/11, duración 2 hs',
    'Parcial 15/11 (dura 3 horas)',
    'Parcial 15/11 aula 25:90',
    'Parcial 15/11 18.30',
    'Parcial 15/11 40 hs',
    'Parcial 15/11, 12 horas cátedra',
  ])('sin hora de verdad: %s', (texto) => {
    expect(buscar(texto)[0].sinHora).toBe(true);
  });
});

describe('lo pasado y lo lejano', () => {
  it('descarta lo pasado', () => {
    expect(buscar('Parcial 15/03')).toEqual([]);
    expect(buscar('Parcial 1/11/2026')).toEqual([]);
    expect(buscar('Parcial 15 de marzo')).toEqual([]);
    expect(buscar('Parcial 15/11/2025')).toEqual([]);
  });

  it('hoy sin hora sigue en pie, hoy a una hora que ya pasó no', () => {
    expect(una('Parcial 2/11').cuando).toBe(seg(2026, 11, 2));
    expect(buscar('Parcial 2/11 a las 8:00')).toEqual([]);
    expect(una('Parcial 2/11 a las 18:00').cuando).toBe(seg(2026, 11, 2, 18));
  });

  it('descarta lo que está a más de 18 meses', () => {
    expect(una('Parcial 1/5/2028').cuando).toBe(seg(2028, 5, 1));
    expect(buscar('Parcial 3/5/2028')).toEqual([]);
    expect(buscar('Parcial 15/11/2030')).toEqual([]);
  });

  it('sin año usa el año actual, aunque en enero mire a marzo', () => {
    expect(una('Parcial 15/3', seg(2027, 1, 10)).cuando).toBe(seg(2027, 3, 15));
    expect(buscar('Parcial 15/3', seg(2027, 4, 10))).toEqual([]);
  });
});

describe('falsos positivos', () => {
  // A principios de año, para que estas «fechas» no se caigan solo por haber pasado.
  const ENERO = seg(2026, 1, 1, 0, 1);
  it.each([
    '1/2 taza de harina',
    '3/4 kg',
    'Sumar 1/2 + 1/3',
    'x = 2/3',
    '3/4 de los alumnos',
    '2/3 del total',
    '3 1/2 pulgadas',
    'v2/3',
    'version 2/3',
    'Ley 26/04',
    'Ley N° 26/04 de educación',
    'Decreto 12/10',
    'Res. 15/11',
    'Art. 3/12',
    'Exp. 15/11/2026',
    'Tel 15-11-26',
    'Teléfono 15-11-2026',
    '011-4567-8901',
    '341-15-11-2026',
    '15-1234-5678',
    '+54 9 341 155-1234',
    '12/13',
    '45/12',
    '12/45',
    'Página 3/12',
    'pág. 3/12',
    'Hoja 3/12',
    '3/12',
    '- 3/12 -',
    'TP 1-2',
    'TP 3-4 y 5-6',
    'TP 1/2',
    'Parcial 2/3',
    'Unidad 3/4',
    'Unidades 1/2',
    'Nota 8/10',
    'Puntaje 10/10',
    'atención 24/7',
    'http://campus.utn.edu.ar/2026/11/15/noticia',
    'archivo_15/11.pdf/extra',
    '1/2/3/4',
    'Comisión 3/4',
    '4 set de ejercicios',
    'Ver 12.5.3',
    '192.168.10.12',
    '3,14/2',
    '2026/27',
  ])('%s', (texto) => {
    expect(buscar(texto, ENERO)).toEqual([]);
  });

  it('un número de página solo en su línea no toma prestado el párrafo de arriba', () => {
    const texto = 'Bibliografía recomendada de la materia\n3/12\nCapítulo siguiente del libro';
    expect(buscar(texto, ENERO)).toEqual([]);
  });

  it('pero «TP 11/12» es una fecha', () => {
    expect(una('TP 11/12').cuando).toBe(seg(2026, 12, 11));
  });

  it('un texto vacío o raro no rompe', () => {
    expect(buscar('')).toEqual([]);
    expect(buscar(null)).toEqual([]);
    expect(buscar('\n\n\f  \n')).toEqual([]);
    expect(buscar('15/'.repeat(5000))).toEqual([]);
  });
});

describe('fuerte', () => {
  it.each([
    ['Primer parcial 15/11'],
    ['Examen final 15/11'],
    ['Entrega 15/11'],
    ['Recuperatorio 15/11'],
    ['Trabajo práctico 2 15/11'],
    ['TP2 15/11'],
    ['Coloquio 15/11'],
    ['Evaluación 15/11'],
    ['Vence el 15/11'],
    ['Cierre de notas 15/11'],
  ])('con palabra: %s', (texto) => {
    expect(una(texto).fuerte).toBe(true);
  });

  it('sin palabra no es fuerte', () => {
    expect(una('Charla con la cátedra 15/11').fuerte).toBe(false);
    expect(una('15 de noviembre charla').fuerte).toBe(false);
  });

  it('sin palabra, con año completo y línea corta, sí', () => {
    expect(una('Charla 15/11/2026').fuerte).toBe(true);
    expect(una('Charla 15 de noviembre de 2026').fuerte).toBe(true);
    expect(una('Charla 15-11-26').fuerte).toBe(false);
    expect(una(`Charla con la cátedra sobre temas varios del cuatrimestre en el aula magna 15/11/2026`).fuerte).toBe(false);
  });

  it('una palabra lejos, en un párrafo largo, no cuenta', () => {
    const lejos = `El parcial ${'tiene varias cosas para decir sobre nada en particular '.repeat(4)} y nos vemos el 15/11 para charlar`;
    expect(una(lejos).fuerte).toBe(false);
  });

  it('final y parcial como parte de otra palabra no cuentan', () => {
    expect(una('Finalmente, charla el 15/11').fuerte).toBe(false);
    expect(una('Reunión imparcial 15/11').fuerte).toBe(false);
  });
});

describe('título', () => {
  it('es la línea limpia, sin la fecha ni la hora', () => {
    expect(una('Segundo parcial: sábado 15/11/2026 a las 18:00 hs').titulo).toBe('Segundo parcial');
    expect(una('Fecha de entrega: 15/11').titulo).toBe('Entrega');
    expect(una('• Entrega del TP 2 – 15/11').titulo).toBe('Entrega del TP 2');
    expect(una('15/11 - entrega del informe').titulo).toBe('Entrega del informe');
    expect(una('Parcial (15/11) en el aula 3').titulo).toBe('Parcial en el aula 3');
  });

  it('hasta 80 caracteres, en el párrafo solo la oración que tiene la fecha', () => {
    const largo = una(`Entrega ${'muy larga '.repeat(30)}15/11`);
    expect(Array.from(largo.titulo).length).toBeLessThanOrEqual(80);
    expect(largo.titulo.endsWith('…')).toBe(true);
    const parrafo = una(`Este es un párrafo introductorio que habla de cualquier cosa de la materia. El parcial se toma el 15/11. Después hay otras cosas para decir sobre la cursada.`);
    expect(parrafo.titulo).toBe('Parcial se toma');
  });

  it('un título sin marcas invisibles', () => {
    expect(una('Parc‮ial​ 15/11').titulo).toBe('Parcial');
  });

  it('la fecha sola toma el título de la línea de al lado', () => {
    expect(una('Primer parcial\n15/11/2026').titulo).toBe('Primer parcial');
    expect(una('Texto cualquiera\n15/11\nPrimer parcial').titulo).toBe('Primer parcial');
    expect(una('Primer parcial\n15/11').fuerte).toBe(true);
    expect(una('15/11/2026').titulo).toBe('Fecha del documento');
    expect(una('Sábado 15/11').titulo).toBe('Fecha del documento');
  });
});

describe('varias fechas en una línea', () => {
  it('cada una con lo suyo, con la etiqueta adelante', () => {
    const [a, b] = buscar('Parcial 1: 15/11 a las 18 hs - Recuperatorio: 22/11 a las 19 hs');
    expect(a).toMatchObject({ titulo: 'Parcial 1', cuando: seg(2026, 11, 15, 18), fuerte: true });
    expect(b).toMatchObject({ titulo: 'Recuperatorio', cuando: seg(2026, 11, 22, 19), fuerte: true });
  });

  it('con la etiqueta atrás', () => {
    const [a, b] = buscar('15/11 Parcial - 22/11 Charla');
    expect(a).toMatchObject({ titulo: 'Parcial', fuerte: true });
    expect(b).toMatchObject({ titulo: 'Charla', fuerte: false });
  });

  it('una fila de tabla de un PDF', () => {
    const [a, b] = buscar('1 15/11 Parcial 22/11 Recuperatorio');
    expect(a.titulo).toBe('Parcial');
    expect(b.titulo).toBe('Recuperatorio');
  });

  it('un rango comparte el título', () => {
    const r = buscar('Entrega del 15/11 al 20/11');
    expect(r.map((f) => f.titulo)).toEqual(['Entrega', 'Entrega']);
    expect(r.map((f) => f.cuando)).toEqual([seg(2026, 11, 15), seg(2026, 11, 20)]);
    expect(r.every((f) => f.fuerte)).toBe(true);
    expect(buscar('Entrega 15/11-20/11')).toHaveLength(2);
  });
});

describe('huella y repetidos', () => {
  it('sale de la fecha y el título normalizado', () => {
    expect(una('Parcial 15/11').huella).toBe(huella('2026-11-15|parcial'));
    expect(una('PARCIAL 15 de noviembre').huella).toBe(una('Parcial: 15/11/2026').huella);
  });

  it('la misma fecha dos veces es una, y se queda con la hora', () => {
    const r = buscar('Parcial 15/11\nParcial: 15 de noviembre a las 18 hs\nParcial (15/11)');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ sinHora: false, cuando: seg(2026, 11, 15, 18) });
  });

  it('entra en lo que `mio.js` guarda', () => {
    expect(una('Parcial 15/11').huella.length).toBeLessThanOrEqual(24);
  });
});

describe('un cronograma entero', () => {
  it('saca lo que hay que sacar y nada más', () => {
    const texto = [
      'Universidad Tecnológica Nacional. Facultad Regional Rosario',
      'Ley 26/04 de educación superior',
      'Algoritmos y Estructuras de Datos, cronograma 2026',
      '',
      'Semana   Tema                  Actividad',
      '1  3/8   Introducción',
      '14 16/11  Unidad 5             Primer parcial',
      'Sábado 21 de noviembre, 9:00 hs. Recuperatorio.',
      'Entrega del TP 3: 30/11/2026',
      'Coloquio: 10 de diciembre de 2026 de 18 a 20 hs',
      'Consultas el 12/12',
      'Se aprueba con 6/10',
      'Página 2/12',
    ].join('\n');
    const r = buscar(texto);
    expect(r.filter((f) => f.fuerte).map((f) => [f.titulo, f.cuando])).toEqual([
      ['Unidad 5 Primer parcial', seg(2026, 11, 16)],
      ['Recuperatorio', seg(2026, 11, 21, 9)],
      ['Entrega del TP 3', seg(2026, 11, 30)],
      ['Coloquio', seg(2026, 12, 10, 18)],
    ]);
    expect(r.filter((f) => !f.fuerte).map((f) => f.titulo)).toEqual(['Consultas']);
  });
});

describe('qué documentos leer', () => {
  const archivo = (nombre, archivo_, extra = {}) => ({ tipo: 'archivo', clave: nombre, nombre, archivo: archivo_, mime: '', peso: 100, ...extra });

  it('por el nombre, PDF y Word nada más', () => {
    const items = [
      archivo('Cronograma', 'crono.pdf'),
      archivo('Unidad 1', 'apunte.pdf'),
      archivo('Programa analítico', 'programa.docx'),
      archivo('Programación orientada a objetos', 'poo.pdf'),
      archivo('Parcial1', 'parcial1_2024.pdf'),
      archivo('Fechas', 'fechas.xlsx'),
      archivo('Final', 'final.doc'),
      archivo('Regularidad', 'sin-extension', { mime: 'application/pdf' }),
      { tipo: 'enlace', clave: 'e', nombre: 'Cronograma en la web' },
      { tipo: 'actividad', clave: 'a', nombre: 'Entrega TP' },
    ];
    expect(candidatos(items).leibles.map((i) => i.nombre)).toEqual(['Cronograma', 'Programa analítico', 'Parcial1', 'Regularidad']);
  });

  it('primero los que seguro tienen fechas', () => {
    const items = [archivo('Parcial viejo', 'a.pdf'), archivo('Planificación', 'b.pdf'), archivo('Final', 'c.pdf'), archivo('Cursado', 'calendario.pdf')];
    expect(candidatos(items).leibles.map((i) => i.nombre)).toEqual(['Planificación', 'Cursado', 'Parcial viejo', 'Final']);
  });

  it('los muy pesados quedan aparte, y el de peso desconocido se intenta', () => {
    const { leibles, pesados } = candidatos([archivo('Cronograma', 'a.pdf', { peso: TOPE_BYTES + 1 }), archivo('Fechas', 'b.pdf', { peso: 0 }), archivo('Final', 'c.pdf', { peso: TOPE_BYTES })]);
    expect(pesados.map((i) => i.nombre)).toEqual(['Cronograma']);
    expect(leibles.map((i) => i.nombre)).toEqual(['Fechas', 'Final']);
    expect(candidatos(undefined)).toEqual({ leibles: [], pesados: [] });
  });
});

describe('juntar lo de varios archivos', () => {
  it('une sin repetir y recuerda de dónde salió', () => {
    const a = buscar('Parcial 15/11');
    const b = buscar('Parcial 15/11 a las 18 hs\nEntrega 20/11');
    let lista = unirHallazgos([], a, 'a.pdf');
    lista = unirHallazgos(lista, b, 'b.pdf');
    lista = unirHallazgos(lista, a, 'b.pdf');
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ titulo: 'Parcial', sinHora: false, archivos: ['a.pdf', 'b.pdf'] });
    expect(lista[1].archivos).toEqual(['b.pdf']);
  });

  it('reconoce lo ya sumado', () => {
    const [s] = buscar('Parcial 15/11');
    expect(yaSumada(s, [{ cuando: s.cuando, titulo: 'parcial' }])).toBe(true);
    expect(yaSumada(s, [{ cuando: s.cuando, titulo: 'Otra cosa' }])).toBe(false);
    expect(yaSumada(s, [{ cuando: s.cuando + 60, titulo: 'Parcial' }])).toBe(false);
  });
});
