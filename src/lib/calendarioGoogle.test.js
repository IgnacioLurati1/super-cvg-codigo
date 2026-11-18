import { describe, expect, it } from 'vitest';
import { agregarAGoogle, deGoogle, eventoParaGoogle, huellaGoogle, idDeGoogle, idEnGoogle, idValido, origenDeId, planear, ZONA } from './calendarioGoogle';

const segundos = (...partes) => Math.floor(new Date(...partes).getTime() / 1000);

describe('agregarAGoogle', () => {
  const partes = (link) => {
    const url = new URL(link);
    return { base: `${url.origin}${url.pathname}`, ...Object.fromEntries(url.searchParams) };
  };

  it('una fecha de día entero va de ese día al siguiente, sin hora', () => {
    const link = partes(agregarAGoogle({ titulo: 'Parcial de Física', materia: 'Física I', tipo: 'parcial', cuando: segundos(2026, 10, 30, 12), sinHora: true }));
    expect(link).toEqual({
      base: 'https://calendar.google.com/calendar/render',
      action: 'TEMPLATE',
      text: 'Parcial de Física (Física I)',
      dates: '20261130/20261201',
      details: 'Parcial, desde Super CVG',
    });
  });

  it('el último día del año pasa al año siguiente', () => {
    expect(partes(agregarAGoogle({ titulo: 'Fin', cuando: segundos(2026, 11, 31, 12), sinHora: true })).dates).toBe('20261231/20270101');
  });

  it('una fecha con hora dura una hora, en UTC', () => {
    const cuando = segundos(2026, 10, 7, 10, 30);
    const link = partes(agregarAGoogle({ titulo: 'Consulta', materia: null, tipo: 'otro', cuando, sinHora: false }));
    const iso = (s) => new Date(s * 1000).toISOString().replace(/[-:]/g, '').replace('.000', '');
    expect(link.dates).toBe(`${iso(cuando)}/${iso(cuando + 3600)}`);
    expect(link.dates).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
    expect(link.text).toBe('Consulta');
    expect(link.details).toBe('Desde Super CVG');
  });

  it('los espacios van como %20 y la barra entre fechas queda tal cual', () => {
    const link = agregarAGoogle({ titulo: 'Parcial de Física', cuando: segundos(2026, 10, 30, 12), sinHora: true });
    expect(link).toContain('text=Parcial%20de%20F%C3%ADsica&');
    expect(link).toContain('dates=20261130/20261201&');
    expect(link).not.toContain('+');
  });

  it('recorta un título o una materia muy largos, sin partir un emoji', () => {
    const titulo = `${'a'.repeat(198)}\u{1F4DA}\u{1F4DA}${'b'.repeat(50)}`;
    const materia = 'M'.repeat(300);
    const { text } = partes(agregarAGoogle({ titulo, materia, cuando: segundos(2026, 10, 7, 12), sinHora: true }));
    const [suyo, resto] = text.split(' (');
    expect([...suyo]).toHaveLength(200);
    expect(suyo).toBe(`${'a'.repeat(198)}\u{1F4DA}\u2026`);
    expect(resto).toBe(`${'M'.repeat(99)}\u2026)`);
    expect(partes(agregarAGoogle({ titulo: 'Corto', materia: 'Física I', cuando: segundos(2026, 10, 7, 12), sinHora: true })).text).toBe('Corto (Física I)');
  });

  it('un título con símbolos llega entero y no agrega parámetros', () => {
    const link = new URL(agregarAGoogle({ titulo: 'TP & guía #4 ?x=1', cuando: segundos(2026, 10, 7, 12), sinHora: true }));
    expect(link.searchParams.get('text')).toBe('TP & guía #4 ?x=1');
    expect([...link.searchParams.keys()]).toEqual(['action', 'text', 'dates', 'details']);
  });
});

describe('idEnGoogle', () => {
  it('siempre el mismo para la misma fecha, y solo con lo que Google acepta', () => {
    expect(idEnGoogle({ id: 4567 })).toBe('campus4567');
    expect(idEnGoogle({ id: 'e12', propio: 'evento' })).toBe('propio653132');
    expect(idEnGoogle({ id: 'f3-4', propio: 'fecha' })).toBe(idEnGoogle({ id: 'f3-4', propio: 'fecha' }));
    for (const id of [idEnGoogle({ id: 1 }), idEnGoogle({ id: 't700001-99', propio: 'tarea' }), idEnGoogle({ id: 'e1', propio: 'evento' })]) {
      expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    }
  });
});

describe('origenDeId e idDeGoogle', () => {
  it('lee de qué fecha tuya es un id que escribió Super CVG, desde cualquier equipo', () => {
    expect(origenDeId(idEnGoogle({ id: 'e1730000000000123', propio: 'evento' }))).toEqual({ propio: 'evento', id: 1730000000000123 });
    expect(origenDeId(idEnGoogle({ id: 't7-45', propio: 'tarea' }))).toEqual({ propio: 'tarea', materiaId: 7, id: 45 });
    expect(origenDeId(idEnGoogle({ id: 'f7-9', propio: 'fecha' }))).toEqual({ propio: 'fecha', materiaId: 7, id: 9 });
    for (const otro of ['campus31', 'abc123def', 'propio7a', `propio${'00'.repeat(3)}`]) expect(origenDeId(otro)).toBeNull();
  });

  it('una fecha nacida en Google tiene siempre el mismo número, lejos de los que da Super CVG', () => {
    const n = idDeGoogle('3k1v5ab0c9e7');
    expect(n).toBe(idDeGoogle('3k1v5ab0c9e7'));
    expect(n).not.toBe(idDeGoogle('3k1v5ab0c9e8'));
    expect(Number.isSafeInteger(n) && n > 0 && n < Date.now() * 1000).toBe(true);
  });

  it('una fecha nacida en Google conserva su id allá', () => {
    expect(idEnGoogle({ id: 'e5', propio: 'evento', gid: '3k1v5ab0c9e7' })).toBe('3k1v5ab0c9e7');
    expect(idValido('3k1v5ab0c9e7')).toBe(true);
    expect(idValido('abc_20261110T120000Z')).toBe(false);
  });
});

describe('eventoParaGoogle', () => {
  const campus = { id: 31, titulo: 'Entrega TP 2', materia: 'Física I', materiaId: 7, vencimiento: true, cuando: segundos(2026, 10, 20, 23, 59), url: 'https://frro.cvg.utn.edu.ar/mod/assign/view.php?id=9' };

  it('una entrega del campus termina a su hora, dura una hora y lleva el link al campus', () => {
    const e = eventoParaGoogle(campus);
    expect(e.id).toBe('campus31');
    expect(e.summary).toBe('Entrega TP 2 (Física I)');
    expect(e.description).toBe('Entrega, desde Super CVG');
    expect(Date.parse(e.end.dateTime) / 1000).toBe(campus.cuando);
    expect(Date.parse(e.end.dateTime) - Date.parse(e.start.dateTime)).toBe(3600_000);
    expect(e.start.timeZone).toBe(ZONA);
    expect(e.source).toEqual({ title: 'Campus', url: campus.url });
    expect(e.transparency).toBe('transparent');
    expect(e.extendedProperties.private).toEqual({ cvg: '1', fuente: 'campus' });
  });

  it('una clase del campus empieza a su hora; uno de todo el sitio va sin materia', () => {
    const clase = eventoParaGoogle({ ...campus, vencimiento: false, titulo: 'Clase de consulta' });
    expect(Date.parse(clase.start.dateTime) / 1000).toBe(campus.cuando);
    expect(eventoParaGoogle({ ...campus, materia: 'General', materiaId: 0, titulo: 'Feriado' }).summary).toBe('Feriado');
    expect(eventoParaGoogle({ ...campus, momento: 'abre', titulo: 'Cuestionario 3' }).summary).toBe('Abre Cuestionario 3 (Física I)');
    expect(eventoParaGoogle({ ...campus, momento: 'vence', titulo: 'Cuestionario 3' }).summary).toBe('Cuestionario 3 (Física I)');
  });

  it('una fecha tuya sin hora ocupa el día entero', () => {
    const e = eventoParaGoogle({ id: 'f7-1', propio: 'fecha', titulo: 'Parcial', materia: 'Física I', materiaId: 7, cuando: segundos(2026, 11, 31, 12), sinHora: true });
    expect(e.start).toEqual({ date: '2026-12-31' });
    expect(e.end).toEqual({ date: '2027-01-01' });
    expect(e.source).toBeUndefined();
    expect(e.extendedProperties.private).toEqual({ cvg: '1', fuente: 'propio' });
  });

  it('una nacida en Google va sin descripción: la suya queda', () => {
    const e = eventoParaGoogle({ id: 'e5', propio: 'evento', gid: '3k1v5ab0c9e7', titulo: 'Cumple', cuando: segundos(2026, 11, 3, 12), sinHora: true, tipo: 'otro' });
    expect(e.id).toBe('3k1v5ab0c9e7');
    expect('description' in e).toBe(false);
  });
});

describe('huellaGoogle y deGoogle', () => {
  it('el mismo momento escrito por Super CVG o devuelto por Google da la misma huella', () => {
    const e = eventoParaGoogle({ id: 'e1', propio: 'evento', titulo: 'Consulta', cuando: segundos(2026, 10, 7, 10), sinHora: false });
    const comoGoogle = { ...e, start: { dateTime: '2026-11-07T10:00:00-03:00', timeZone: ZONA }, end: { dateTime: '2026-11-07T11:00:00-03:00' }, description: 'otra', colorId: '5' };
    expect(huellaGoogle(comoGoogle)).toBe(huellaGoogle({ ...e, start: { dateTime: new Date(Date.parse('2026-11-07T10:00:00-03:00')).toISOString() }, end: { dateTime: new Date(Date.parse('2026-11-07T11:00:00-03:00')).toISOString() } }));
    expect(huellaGoogle({ ...e, summary: 'Otra' })).not.toBe(huellaGoogle(e));
  });

  it('saca la materia del título si es la tuya, y toma el día o la hora de inicio', () => {
    const nombres = { 7: 'Física I', 9: 'Química' };
    expect(deGoogle({ summary: 'Parcial (Física I)', start: { date: '2026-11-20' }, end: { date: '2026-11-22' }, description: 'Parcial, desde Super CVG' }, { nombres, materia: 'Física I' }))
      .toEqual({ titulo: 'Parcial', cuando: segundos(2026, 10, 20, 12), sinHora: true, tipo: 'parcial' });
    expect(deGoogle({ summary: 'Parcial (Química)', start: { dateTime: '2026-11-20T09:30:00-03:00' } }, { nombres, materia: 'Física I' }))
      .toEqual({ titulo: 'Parcial', cuando: Date.parse('2026-11-20T09:30:00-03:00') / 1000, sinHora: false, tipo: 'otro', materiaId: 9 });
    expect(deGoogle({ summary: 'Cumple (de Beto)', start: { date: '2026-11-20' } }, { nombres }).titulo).toBe('Cumple (de Beto)');
    expect(deGoogle({ summary: '  ', start: { date: '2026-11-20' } }).titulo).toBe('Sin título');
    expect(deGoogle({ summary: 'Sin día', start: {} })).toBeNull();
  });
});

describe('planear', () => {
  const desde = segundos(2026, 10, 10);
  const deCampus = (id, cuando, titulo = `Clase ${id}`) => eventoParaGoogle({ id, titulo, materia: 'Física I', materiaId: 7, vencimiento: false, cuando });
  const propia = (id, titulo, cuando = desde + 86_400) => eventoParaGoogle({ id, propio: 'evento', titulo, cuando, sinHora: true });
  const enGoogle = (e, extra = {}) => ({ ...e, updated: '2026-11-10T12:00:00Z', ...extra });
  const igual = (e) => [huellaGoogle(e), huellaGoogle(e)];

  it('la primera vez, lo que está igual en los dos lados queda; lo de acá va y lo de allá viene', () => {
    const misma = propia('e1', 'Misma');
    const plan = planear({ deseados: [misma, propia('e2', 'Nueva acá')], existentes: [enGoogle(misma), enGoogle({ id: 'amano1', summary: 'Cumple', start: { date: '2026-11-20' }, end: { date: '2026-11-21' } })], desde });
    expect(plan.poner.map((e) => e.summary)).toEqual(['Nueva acá']);
    expect(plan.cambiar).toEqual([]);
    expect(plan.traer.map(({ id, como }) => [id, como])).toEqual([['amano1', 'nuevo']]);
    expect(plan.base[misma.id]).toEqual(igual(misma));
    expect(plan.base.amano1[0]).toBeNull();
  });

  it('lo que cambió acá va, lo que cambió allá viene, y si cambió en los dos gana lo último', () => {
    const a = propia('e1', 'A');
    const b = propia('e2', 'B');
    const c = propia('e3', 'C');
    const base = { [a.id]: igual(a), [b.id]: igual(b), [c.id]: igual(c) };
    const aAca = { ...a, summary: 'A cambiada acá' };
    const bAlla = enGoogle({ ...b, summary: 'B cambiada en Google' });
    const cAca = { ...c, summary: 'C acá' };
    const cAlla = enGoogle({ ...c, summary: 'C en Google' }, { updated: '2026-11-10T12:00:00Z' });
    const plan = planear({ deseados: [aAca, b, cAca], existentes: [enGoogle(a), bAlla, cAlla], base, tocado: { [c.id]: Date.parse('2026-11-10T11:00:00Z') }, desde });
    expect(plan.cambiar.map((e) => e.summary)).toEqual(['A cambiada acá']);
    expect(plan.traer.map(({ id, como }) => [id, como])).toEqual([[b.id, 'cambio'], [c.id, 'cambio']]);
    // Changed here after Google: here wins.
    const despues = planear({ deseados: [cAca], existentes: [cAlla], base, tocado: { [c.id]: Date.parse('2026-11-10T13:00:00Z') }, desde });
    expect(despues.cambiar.map((e) => e.summary)).toEqual(['C acá']);
  });

  it('lo borrado de un lado se borra del otro, salvo que haya cambiado después', () => {
    const a = propia('e1', 'A');
    const b = propia('e2', 'B');
    const base = { [a.id]: igual(a), [b.id]: igual(b) };
    const plan = planear({ deseados: [a], existentes: [enGoogle(b)], base, desde });
    expect(plan.traer).toEqual([{ id: a.id, como: 'borrado', remoto: undefined }]);
    expect(plan.quitar).toEqual([b.id]);
    expect(plan.base).toEqual({});
    const cambiada = planear({ deseados: [{ ...a, summary: 'A otra' }], existentes: [enGoogle({ ...b, summary: 'B otra' })], base, desde });
    expect(cambiada.poner.map((e) => e.summary)).toEqual(['A otra']);
    expect(cambiada.traer.map(({ id, como }) => [id, como])).toEqual([[b.id, 'nuevo']]);
  });

  it('una tarea hecha sale del calendario', () => {
    const t = eventoParaGoogle({ id: 't7-4', propio: 'tarea', titulo: 'TP', materia: 'Física I', materiaId: 7, cuando: desde + 86_400, sinHora: true });
    expect(planear({ deseados: [], existentes: [enGoogle(t)], desde, fuera: new Set([t.id]) }).quitar).toEqual([t.id]);
  });

  it('las del campus solo van: lo que el alumno borró o cambió en Google queda así hasta que el campus la cambie', () => {
    const borrada = deCampus(1, desde + 3600);
    const cambiada = deCampus(2, desde + 7200);
    const base = { [borrada.id]: igual(borrada), [cambiada.id]: igual(cambiada) };
    const suya = enGoogle({ ...cambiada, summary: 'Clase 2, a la que no voy' });
    expect(planear({ deseados: [borrada, cambiada], existentes: [suya], base, desde })).toMatchObject({ poner: [], cambiar: [], quitar: [], traer: [] });
    const otraHora = deCampus(2, desde + 9000);
    const plan = planear({ deseados: [deCampus(1, desde + 5400), otraHora], existentes: [suya], base, desde });
    expect(plan.poner.map((e) => e.id)).toEqual([borrada.id]);
    expect(plan.cambiar.map((e) => e.id)).toEqual([cambiada.id]);
  });

  it('una del campus que la cátedra sacó se borra desde hoy, salvo que el alumno la haya cambiado; las pasadas quedan', () => {
    const pasada = deCampus(8, desde - 86_400);
    const futura = deCampus(9, desde + 86_400);
    const tocada = deCampus(10, desde + 86_400);
    const base = { [futura.id]: igual(futura), [tocada.id]: igual(tocada) };
    const plan = planear({ deseados: [], existentes: [enGoogle(pasada), enGoogle(futura), enGoogle({ ...tocada, summary: 'Mía' })], base, desde });
    expect(plan.quitar).toEqual(['campus9']);
    expect(plan.base.campus10).toEqual(base.campus10);
  });

  it('sin el campus, las del campus quedan como están', () => {
    const c = deCampus(1, desde + 3600);
    const plan = planear({ deseados: [], existentes: [enGoogle(c)], base: { [c.id]: igual(c) }, desde, conCampus: false });
    expect(plan).toMatchObject({ poner: [], cambiar: [], quitar: [], traer: [] });
    expect(plan.base[c.id]).toEqual(igual(c));
  });

  it('lo que se repite en Google queda solo allá', () => {
    const serie = { id: 'serie1', summary: 'Gimnasio', start: { dateTime: '2026-11-10T08:00:00-03:00' }, recurrence: ['RRULE:FREQ=WEEKLY'] };
    const una = { id: 'serie1_20261117T110000Z', summary: 'Gimnasio', start: { dateTime: '2026-11-17T09:00:00-03:00' }, recurringEventId: 'serie1' };
    expect(planear({ deseados: [], existentes: [serie, una], desde })).toMatchObject({ poner: [], cambiar: [], quitar: [], traer: [] });
  });
});
