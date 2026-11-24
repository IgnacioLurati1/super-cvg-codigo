// Classroom as the site opens: the list of courses and the courses joined last time leave at once; the permission is
// renewed first if it ended; nothing without Classroom turned on.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const google = vi.hoisted(() => ({ token: 'g', usos: ['classroom'], cursos: ['111', '222'], renovar: vi.fn(async () => true) }));
const classroom = vi.hoisted(() => ({ cargarCursos: vi.fn(async () => []), cargarDatosCurso: vi.fn(async () => ({})), cargarEntregas: vi.fn(async () => new Set()), cursoParecido: () => null }));
vi.mock('./google', () => ({
  disponibleGoogle: () => true,
  usosDeGoogle: () => google.usos,
  tokenGoogle: () => google.token,
  permisoGoogle: () => google.token,
  cursosDeClassroom: () => google.cursos,
  recordarCursosDeClassroom: vi.fn(),
  renovarGoogle: (...a) => google.renovar(...a),
}));
vi.mock('./classroom', () => classroom);

const { adelantarClassroom } = await import('./classroomUnido');

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(google, { token: 'g', usos: ['classroom'], cursos: ['111', '222'] });
});

describe('Classroom as the site opens', () => {
  it('asks for the list and for each course joined last time, at once', () => {
    adelantarClassroom();
    expect(classroom.cargarCursos).toHaveBeenCalledTimes(1);
    expect(classroom.cargarDatosCurso.mock.calls).toEqual([['111'], ['222']]);
    expect(classroom.cargarEntregas.mock.calls).toEqual([['111'], ['222']]);
    expect(google.renovar).not.toHaveBeenCalled();
  });

  it('with the permission ended, renews it first, and asks only if it came', async () => {
    google.token = null;
    google.renovar.mockImplementationOnce(async () => {
      google.token = 'nuevo';
      return true;
    });
    adelantarClassroom();
    expect(classroom.cargarCursos).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(classroom.cargarDatosCurso).toHaveBeenCalledTimes(2));
    google.token = null;
    google.renovar.mockImplementationOnce(async () => false);
    vi.clearAllMocks();
    adelantarClassroom();
    await new Promise((ok) => setTimeout(ok, 10));
    expect(classroom.cargarCursos).not.toHaveBeenCalled();
  });

  it('without Classroom turned on, asks nothing', () => {
    google.usos = ['drive'];
    adelantarClassroom();
    expect(classroom.cargarCursos).not.toHaveBeenCalled();
    expect(google.renovar).not.toHaveBeenCalled();
  });
});
