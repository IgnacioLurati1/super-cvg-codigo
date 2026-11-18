import { describe, expect, it } from 'vitest';
import { sanearMio } from './mio';
import { cuantoFalta, deHoy, MAX_FRENTE, NUEVAS_POR_DIA, nuevasDelDia, nuevoId, paraPracticar, porMateria, proximoDia, repasoParaConsultron, responder, rondaParaConsultron, semana, sanearRepaso, sanearTarjeta, tarjetaDePractica } from './repaso';
import { armar, piezas, unir } from './union';

const tarjeta = (id, cambios = {}) => sanearTarjeta({ id, frente: `Pregunta ${id}`, dorso: 'Respuesta', creada: 1000, ...cambios });
const DIA = '2026-11-11';

describe('sanear', () => {
  it('keeps only what is known, within limits, and drops what does not print', () => {
    const t = sanearTarjeta({ id: 'rabc123', frente: ` ¿Qué es\u0007 TCP?\u202e `.padEnd(MAX_FRENTE + 50, 'x'), dorso: 'Línea 1\r\nLínea 2', materia: 'Redes', creada: 5, vence: '2026-02-31', paso: -3, facilidad: 999, veces: 1.5, extra: 1 });
    expect(t).toEqual({ id: 'rabc123', materia: null, frente: expect.stringMatching(/^¿Qué es TCP\? x+$/), dorso: 'Línea 1\nLínea 2', creada: 5, vence: null, paso: 0, facilidad: 250, veces: 0, olvidos: 0, desde: null });
    expect(t.frente.length).toBe(MAX_FRENTE);
    expect(sanearTarjeta({ id: 'rabc123', frente: '   ' })).toBeNull();
    expect(sanearTarjeta({ id: 'x', frente: 'Hola' })).toBeNull();
    expect(sanearTarjeta({ id: 'rabc123', frente: 'Hola', materia: 123 }).materia).toBe(123);
    expect(sanearTarjeta({ id: 'rabc123', frente: 'Hola', materia: 'pabc1234' }).materia).toBe('pabc1234');
  });

  it('the list: oldest first and no repeats', () => {
    const l = sanearRepaso([tarjeta('rbbbbbb', { creada: 2 }), tarjeta('raaaaaa', { creada: 1 }), tarjeta('rbbbbbb', { creada: 3 }), null, 'x']);
    expect(l.map((t) => t.id)).toEqual(['raaaaaa', 'rbbbbbb']);
    expect(sanearMio({ repaso: l }).repaso).toEqual(l);
    expect(sanearMio({}).repaso).toEqual([]);
  });
});

describe('responder', () => {
  it('a new card: «No me acordé» stays for today, «Me costó» tomorrow, «Me acordé» in two days, «Me salió sola» in four', () => {
    const nueva = tarjeta('rnueva1');
    expect(responder(nueva, 'otra', DIA)).toMatchObject({ vence: DIA, veces: 0, olvidos: 0, desde: DIA });
    expect(responder({ ...nueva, desde: '2026-11-01' }, 'bien', DIA).desde).toBe('2026-11-01');
    expect(responder(nueva, 'dificil', DIA)).toMatchObject({ vence: '2026-11-12', paso: 1, veces: 1 });
    expect(responder(nueva, 'bien', DIA)).toMatchObject({ vence: '2026-11-13', paso: 2, veces: 1 });
    expect(responder(nueva, 'facil', DIA)).toMatchObject({ vence: '2026-11-15', paso: 4, facilidad: 265 });
  });

  it('it goes further each time it goes well, and back to the start when forgotten', () => {
    let t = responder(tarjeta('rcurva1'), 'bien', DIA);
    t = responder(t, 'bien', t.vence);
    expect(t).toMatchObject({ paso: 5, vence: '2026-11-18' });
    t = responder(t, 'bien', t.vence);
    expect(t.paso).toBe(13);
    t = responder(t, 'dificil', t.vence);
    expect(t).toMatchObject({ paso: 16, facilidad: 235 });
    const olvidada = responder(t, 'otra', t.vence);
    expect(olvidada).toMatchObject({ paso: 0, veces: 0, olvidos: 1, facilidad: 215, vence: t.vence });
  });

  it('says how far each answer sends it', () => {
    const t = { ...tarjeta('rlejos1'), veces: 5, paso: 40 };
    expect(cuantoFalta(tarjeta('rlejos1'), 'bien', DIA)).toBe('2 días');
    expect(cuantoFalta(tarjeta('rlejos1'), 'dificil', DIA)).toBe('1 día');
    expect(cuantoFalta(tarjeta('rlejos1'), 'otra', DIA)).toBe('hoy');
    expect(cuantoFalta(t, 'bien', DIA)).toBe('3 meses');
    expect(cuantoFalta({ ...t, paso: 300 }, 'facil', DIA)).toBe('3 años');
  });
});

describe('the round of a day', () => {
  const tarjetas = [
    tarjeta('rvieja1', { vence: '2026-11-01', materia: 10 }),
    tarjeta('rhoy001', { vence: DIA, materia: 20 }),
    tarjeta('rmanana', { vence: '2026-11-12', materia: 10 }),
    ...Array.from({ length: 25 }, (_, i) => tarjeta(`rnueva${String(i).padStart(2, '0')}`, { creada: 2000 + i, materia: 10 })),
  ];

  it('the due ones first, oldest first, then new ones up to the day room', () => {
    const ronda = deHoy(tarjetas, { dia: DIA });
    expect(ronda.slice(0, 2).map((t) => t.id)).toEqual(['rvieja1', 'rhoy001']);
    expect(ronda).toHaveLength(2 + NUEVAS_POR_DIA);
    expect(deHoy(tarjetas, { dia: DIA, nuevasHechas: 18 })).toHaveLength(4);
    expect(nuevasDelDia([tarjeta('rdesde1', { desde: DIA }), tarjeta('rdesde2', { desde: '2026-11-10' })], DIA)).toBe(1);
    expect(deHoy(tarjetas, { dia: DIA, materia: 20 }).map((t) => t.id)).toEqual(['rhoy001']);
  });

  it('counts by course and knows the next day', () => {
    const c = porMateria(tarjetas, DIA);
    expect(c.get(10)).toEqual({ total: 27, vencidas: 1, nuevas: 25 });
    expect(c.get(20)).toEqual({ total: 1, vencidas: 1, nuevas: 0 });
    expect(proximoDia(tarjetas, DIA)).toBe('2026-11-12');
    expect(proximoDia([], DIA)).toBeNull();
  });

  it('a practice round: every card or those of a course, mixed, each once', () => {
    const todas = paraPracticar(tarjetas, undefined, () => 0.5);
    expect(todas).toHaveLength(tarjetas.length);
    expect(new Set(todas).size).toBe(tarjetas.length);
    expect(paraPracticar(tarjetas, 20)).toEqual(['rhoy001']);
    expect(paraPracticar([], undefined)).toEqual([]);
  });

  it('the week ahead: today as the round says, then the cards due each day, across the end of a month', () => {
    const s = semana(tarjetas, { dia: DIA, hoyCuantas: 22 });
    expect(s.map((d) => d.dia)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']);
    expect(s.map((d) => d.cuantas)).toEqual([22, 1, 0, 0, 0, 0, 0]);
    expect(semana([], { dia: '2026-11-28', dias: 4 }).map((d) => d.dia)).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01']);
  });
});

describe('Drive', () => {
  it('each card is one piece: an answer on one device and a new card on another, both stay', () => {
    const base = { repaso: [tarjeta('rcomun1')] };
    expect(armar(piezas(sanearMio(base))).repaso).toEqual(base.repaso);
    const respondida = { repaso: [responder(base.repaso[0], 'bien', DIA)] };
    const conOtra = { repaso: [...base.repaso, tarjeta('rotra01', { creada: 3000 })] };
    const { datos } = unir({ datos: sanearMio(respondida), t: { 'rep/rcomun1': 200 }, d: { 'rep/rcomun1': 100 } }, { datos: sanearMio(conOtra), t: { 'rep/rcomun1': 100, 'rep/rotra01': 150 } });
    const juntas = sanearMio(datos).repaso;
    expect(juntas.map((t) => t.id)).toEqual(['rcomun1', 'rotra01']);
    expect(juntas[0].vence).toBe('2026-11-13');
  });
});

it('ids are new each time and valid', () => {
  const a = nuevoId(1);
  const b = nuevoId(1);
  expect(a).not.toBe(b);
  expect(sanearTarjeta({ id: a, frente: 'x' })).not.toBeNull();
});

it('a practice question as a card', () => {
  expect(tarjetaDePractica({ pregunta: ' ¿Qué es un socket? ', ideas: ['Un extremo de conexión', 'IP y puerto'] })).toEqual({ frente: '¿Qué es un socket?', dorso: '- Un extremo de conexión\n- IP y puerto' });
});

describe('what Consultron reads', () => {
  it('the page: today, the days ahead, each course and its cards with their answers', () => {
    const fisica = [tarjeta('rfis0001', { frente: '¿Qué dice la ley de Ohm?', dorso: 'V = I · R', vence: DIA }), tarjeta('rfis0002')];
    const semanaDe = semana([...fisica, tarjeta('rotra001', { vence: '2026-11-13' })], { dia: DIA, hoyCuantas: 2 });
    const p = repasoParaConsultron({ grupos: [{ nombre: 'Física II', hoy: 2, lista: fisica }, { nombre: 'Sin materia', hoy: 0, lista: [tarjeta('rotra001')] }], paraHoy: 2, semanaDe });
    expect(p.titulo).toBe('Repaso');
    expect(p.datos).toEqual([['Para hoy', '2 tarjetas'], ['Los próximos días', 'viernes 13: 1 tarjeta'], ['Física II', '2 tarjetas, 2 para hoy'], ['Sin materia', '1 tarjeta']]);
    expect(p.resultado[0]).toEqual(['Tarjeta de Física II', '¿Qué dice la ley de Ohm? Respuesta: V = I · R']);
    expect(p.notas).toContain('3 tarjetas');
    expect(repasoParaConsultron({ grupos: [], paraHoy: 0 }).notas).toMatch(/todavía no escribió/);
    expect(repasoParaConsultron({ grupos: [{ nombre: 'A', hoy: 0, lista: [tarjeta('raaa0001')] }], paraHoy: 0, proxima: 'mañana' }).datos[0]).toEqual(['Para hoy', 'nada, la próxima vuelta es mañana']);
  });

  it('a card of a round: the answer only once turned', () => {
    const t = tarjeta('rfis0001', { frente: '¿Qué dice la ley de Ohm?', dorso: 'V = I · R' });
    const antes = rondaParaConsultron({ tarjeta: t, materia: 'Física II', vuelta: false, practica: false, quedan: 3, total: 5 });
    expect(antes.titulo).toBe('Repaso, ronda de hoy');
    expect(JSON.stringify(antes)).not.toContain('V = I');
    expect(antes.notas).toMatch(/no le digas la respuesta/i);
    const despues = rondaParaConsultron({ tarjeta: t, materia: 'Física II', vuelta: true, practica: true, quedan: 3, total: 5 });
    expect(despues.titulo).toBe('Repaso, práctica');
    expect(despues.datos).toContainEqual(['Respuesta que escribió', 'V = I · R']);
  });
});
