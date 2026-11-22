import { describe, expect, it } from 'vitest';
import { eventoParaGoogle, idValido } from './calendarioGoogle';
import { eventosDeExamenes, examenesDelAlumno, leerExamenes, TOPES } from './sysacadExamenes';

const AHORA = Date.UTC(2026, 10, 19, 15);
const examen = (extra = {}) => ({ materia: 'Tecnologías para la Automatización', dia: '2026-12-10', turno: 'Tarde', teorico: '15:00', practico: '16:30', tribunal: 'Ferreyra', ...extra });
const mensaje = (extra = {}) => ({ fuente: 'sysacad-lindo', para: 'super-cvg', v: 3, tipo: 'examenes', vinculada: true, alumno: 'PEREZ, Juan', fecha: AHORA - 60_000, examenes: [examen()], ...extra });

describe('el mensaje de los exámenes', () => {
  it('se queda con la materia, el día y las horas; el turno y el tribunal no siguen', () => {
    expect(leerExamenes(mensaje(), AHORA)).toEqual({
      vinculada: true,
      alumno: 'PEREZ, Juan',
      fecha: AHORA - 60_000,
      examenes: [{ materia: 'Tecnologías para la Automatización', dia: '2026-12-10', teorico: '15:00', practico: '16:30' }],
    });
  });

  it('sin vincular no trae nada, y si trae algo no vale', () => {
    expect(leerExamenes(mensaje({ vinculada: false, alumno: null, fecha: null, examenes: [] }), AHORA)).toEqual({ vinculada: false, alumno: null, fecha: null, examenes: [] });
    expect(leerExamenes(mensaje({ vinculada: false }), AHORA)).toBeNull();
    expect(leerExamenes(mensaje({ vinculada: false, alumno: null, fecha: null }), AHORA)).toBeNull();
  });

  it('vinculada sin nada leído todavía', () => {
    expect(leerExamenes(mensaje({ alumno: null, fecha: null, examenes: [] }), AHORA)).toEqual({ vinculada: true, alumno: null, fecha: null, examenes: [] });
    expect(leerExamenes(mensaje({ fecha: null }), AHORA)).toBeNull();
  });

  it('otra forma, otra versión u otra clave no valen', () => {
    for (const malo of [
      null,
      [],
      mensaje({ v: 2 }),
      mensaje({ tipo: 'pestanas' }),
      mensaje({ para: 'otro' }),
      mensaje({ extra: 1 }),
      mensaje({ vinculada: 'si' }),
      mensaje({ fecha: AHORA + 2 * 86_400_000 }),
      mensaje({ fecha: 0 }),
      mensaje({ alumno: '' }),
      mensaje({ examenes: [examen({ codigo: 'X1' })] }),
      mensaje({ examenes: [{ materia: 'Física I', dia: '2026-12-10' }] }),
      mensaje({ examenes: [examen({ dia: '2026-02-30' })] }),
      mensaje({ examenes: [examen({ dia: '10/12/2026' })] }),
      mensaje({ examenes: [examen({ teorico: '24:00' })] }),
      mensaje({ examenes: [examen({ practico: '9:00' })] }),
      mensaje({ examenes: [examen({ materia: '   ' })] }),
      mensaje({ examenes: [examen({ materia: 'Física\u0000I' })] }),
      mensaje({ examenes: [examen({ materia: 'x'.repeat(TOPES.materia + 1) })] }),
      mensaje({ examenes: [examen({ turno: 'x'.repeat(TOPES.turno + 1) })] }),
      mensaje({ examenes: [examen({ tribunal: 'x'.repeat(TOPES.tribunal + 1) })] }),
      mensaje({ examenes: Array.from({ length: TOPES.examenes + 1 }, (_, i) => examen({ materia: `Materia ${i}` })) }),
    ]) expect(leerExamenes(malo, AHORA)).toBeNull();
  });

  it('una materia y un día repetidos quedan una vez, y salen ordenados por día', () => {
    const leido = leerExamenes(mensaje({ examenes: [examen({ dia: '2026-12-17' }), examen(), examen({ teorico: '08:00' })] }), AHORA);
    expect(leido.examenes.map((e) => [e.dia, e.teorico])).toEqual([['2026-12-10', '15:00'], ['2026-12-17', '15:00']]);
  });
});

describe('de quién son', () => {
  const leido = leerExamenes(mensaje(), AHORA);
  it('solo del alumno de esta cuenta del campus', () => {
    expect(examenesDelAlumno(leido, 'Juan Pérez')).toHaveLength(1);
    expect(examenesDelAlumno(leido, 'María Gómez')).toBeNull();
    expect(examenesDelAlumno(leido, '')).toBeNull();
    expect(examenesDelAlumno({ ...leido, alumno: null }, 'Juan Pérez')).toBeNull();
    // Nothing read yet in that browser: not known, so Google keeps what another one put there.
    expect(examenesDelAlumno({ ...leido, fecha: null, examenes: [] }, 'Juan Pérez')).toBeNull();
    expect(examenesDelAlumno(null, 'Juan Pérez')).toBeNull();
  });
});

describe('como fechas del calendario', () => {
  it('arranca a la hora más temprana; sin ninguna, todo el día', () => {
    const [conHora, sinHora] = eventosDeExamenes([
      { materia: 'Física I', dia: '2026-12-10', teorico: '15:00', practico: '09:30' },
      { materia: 'Química', dia: '2026-12-11', teorico: null, practico: null },
    ]);
    expect(conHora).toMatchObject({ titulo: 'Final de Física I', propio: 'sysacad', tipo: 'final', sinHora: false });
    expect(new Date(conHora.cuando * 1000).toString()).toMatch(/Dec 10 2026 09:30/);
    expect(sinHora).toMatchObject({ titulo: 'Final de Química', sinHora: true });
    expect(eventosDeExamenes(null)).toEqual([]);
  });

  it('a Google van solo el título y la hora, con el mismo id para el mismo examen', () => {
    const [e] = eventosDeExamenes([{ materia: 'Análisis Matemático II', dia: '2026-12-10', teorico: '15:00', practico: null }]);
    const g = eventoParaGoogle(e);
    expect(g).toMatchObject({ summary: 'Final de Análisis Matemático II', description: 'Te anotaste en Sysacad, desde Super CVG', extendedProperties: { private: { cvg: '1', fuente: 'sysacad' } } });
    expect(g.start.dateTime).toBe('2026-12-10T18:00:00.000Z');
    expect(JSON.stringify(g)).not.toMatch(/Ferreyra|Tarde/);
    expect(idValido(g.id)).toBe(true);
    expect(eventoParaGoogle(eventosDeExamenes([{ materia: 'Análisis Matemático II', dia: '2026-12-10', teorico: null, practico: null }])[0]).id).toBe(g.id);
    // The longest subject, all in letters of two bytes, still fits in an id of Google.
    const largo = eventoParaGoogle(eventosDeExamenes([{ materia: 'á'.repeat(TOPES.materia), dia: '2026-12-10', teorico: null, practico: null }])[0]);
    expect(idValido(largo.id)).toBe(true);
  });
});
