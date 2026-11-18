// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { GRUPOS_DE_AVISOS, esGrupoDeAviso, grupoDeAviso, seVeAviso } from './avisos';
import { conTimbre } from './campana';
import { fijarUsuario, mioActual, sanearMio, verAvisos } from './mio';
import { DEMO_NOTIFICACIONES } from './demoNotificaciones';
import { cuantasSinVer, limpiarNotificaciones } from './notificaciones';

const demo = () => limpiarNotificaciones(DEMO_NOTIFICACIONES.lista().notifications, []);

describe('los tipos de aviso', () => {
  it('cada tipo que da notificaciones.js tiene su grupo, y lo desconocido va con «Otros»', () => {
    const tipos = GRUPOS_DE_AVISOS.flatMap((g) => g.tipos);
    expect(new Set(tipos).size).toBe(tipos.length);
    for (const tipo of ['foro', 'resumen', 'devolucion', 'nota', 'contenido', 'entrega', 'vence', 'fecha', 'cuestionario', 'intento', 'contacto', 'otro']) expect(tipos).toContain(tipo);
    expect(grupoDeAviso('foro')).toBe('foros');
    expect(grupoDeAviso('resumen')).toBe('foros');
    expect(grupoDeAviso('nota')).toBe('notas');
    expect(grupoDeAviso('rarisimo')).toBe('otros');
    expect(grupoDeAviso(undefined)).toBe('otros');
    expect(esGrupoDeAviso('foros')).toBe(true);
    expect(esGrupoDeAviso('<b>')).toBe(false);
  });

  it('los de ejemplo caen cada uno en su grupo, también el pedido de contacto', () => {
    const grupos = Object.fromEntries(demo().map((n) => [n.id, grupoDeAviso(n.tipo)]));
    expect(grupos[901]).toBe('foros');
    expect(grupos[902]).toBe('notas');
    expect(grupos[908]).toBe('contactos');
    expect(Object.values(grupos)).toContain('contenido');
    expect(Object.values(grupos)).toContain('cuestionarios');
    const [nota] = limpiarNotificaciones([{ id: 1, subject: 'Calificación de Parcial 1', component: 'moodle', eventtype: 'gradenotifications', timecreated: 100 }], []);
    expect(nota.tipo).toBe('nota');
  });

  it('se ve lo que no está oculto', () => {
    expect(seVeAviso({ tipo: 'foro' }, new Set())).toBe(true);
    expect(seVeAviso({ tipo: 'foro' }, undefined)).toBe(true);
    expect(seVeAviso({ tipo: 'foro' }, new Set(['foros']))).toBe(false);
    expect(seVeAviso({ tipo: 'devolucion' }, new Set(['foros']))).toBe(true);
  });

  it('no se ve lo de una materia sacada de Hoy', () => {
    const fuera = new Set([7]);
    expect(seVeAviso({ tipo: 'devolucion', materia: { id: 7 } }, new Set(), fuera)).toBe(false);
    expect(seVeAviso({ tipo: 'devolucion', materia: { id: '7' } }, undefined, fuera)).toBe(false);
    expect(seVeAviso({ tipo: 'devolucion', materia: { id: 8 } }, new Set(), fuera)).toBe(true);
    expect(seVeAviso({ tipo: 'devolucion' }, new Set(), fuera)).toBe(true);
  });
});

describe('el número de la campana con tipos ocultos', () => {
  const lista = [
    { id: 1, tipo: 'foro', cuando: 300, leida: false },
    { id: 2, tipo: 'devolucion', cuando: 200, leida: false },
    { id: 3, tipo: 'contenido', cuando: 100, leida: true },
  ];

  it('las de un tipo oculto no cuentan, nuevas o sin leer desde siempre', () => {
    expect(cuantasSinVer(lista, 150, 2)).toBe(2);
    expect(cuantasSinVer(lista, 150, 2, new Set(), new Set(['foros']))).toBe(1);
    expect(cuantasSinVer(lista, 0, 9, new Set(), new Set(['foros']))).toBe(8);
    expect(cuantasSinVer(lista, 0, 9, new Set([2]), new Set(['foros']))).toBe(7);
    // A read one of a hidden kind doesn't change the campus count.
    expect(cuantasSinVer(lista, 0, 9, new Set(), new Set(['contenido']))).toBe(9);
    expect(cuantasSinVer(lista, 150, 2, new Set(), new Set(['foros', 'notas']))).toBe(0);
  });

  it('las de una materia sacada de Hoy no cuentan', () => {
    const conMateria = lista.map((n) => ({ ...n, materia: { id: n.id === 1 ? 7 : 8 } }));
    expect(cuantasSinVer(conMateria, 150, 2, new Set(), new Set(), new Set([7]))).toBe(1);
    expect(cuantasSinVer(conMateria, 0, 9, new Set(), new Set(), new Set([7]))).toBe(8);
  });

  it('una nueva de un tipo oculto no hace sonar la campana', () => {
    const ocultos = new Set(['foros']);
    const quieta = conTimbre({ conteo: 0, contado: true, lista: [], visto: 100, numero: null, timbre: 0, ocultos });
    const llega = conTimbre({ ...quieta, conteo: 1, lista: [{ id: 9, tipo: 'foro', cuando: 400, leida: false }] });
    expect(llega).toMatchObject({ numero: 0, timbre: 0 });
    const otra = conTimbre({ ...llega, conteo: 2, lista: [{ id: 10, tipo: 'devolucion', cuando: 500, leida: false }, ...llega.lista] });
    expect(otra).toMatchObject({ numero: 1, timbre: 1 });
  });
});

describe('lo que elige el alumno', () => {
  afterEach(() => {
    localStorage.clear();
    fijarUsuario(null);
  });

  it('se guarda por alumno, solo las claves conocidas y una vez cada una', () => {
    fijarUsuario(5);
    expect(mioActual().avisosOcultos).toEqual([]);
    verAvisos('foros', false);
    verAvisos('foros', false);
    verAvisos('contactos', false);
    expect(mioActual().avisosOcultos).toEqual(['foros', 'contactos']);
    verAvisos('foros', true);
    expect(mioActual().avisosOcultos).toEqual(['contactos']);
    fijarUsuario(6);
    expect(mioActual().avisosOcultos).toEqual([]);
  });

  it('lo que entra de un archivo o de Drive pasa por sanearMio', () => {
    expect(sanearMio({ avisosOcultos: ['foros', 'foros', '<b>', 7, null, 'notas'] }).avisosOcultos).toEqual(['foros', 'notas']);
    for (const raro of ['foros', { foros: true }, null, undefined]) expect(sanearMio({ avisosOcultos: raro }).avisosOcultos).toEqual([]);
  });
});
