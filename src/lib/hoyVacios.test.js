import { afterEach, describe, expect, it } from 'vitest';
import { anotarVacios, estaVacio, olvidarVacios } from './hoyVacios';
import { vaciarCache } from './sesion';

describe('los bloques vacíos de Hoy, para la vista previa', () => {
  afterEach(olvidarVacios);

  it('marca solo lo que Hoy ya dijo que está vacío', () => {
    anotarVacios({ tareas: true, avisos: false });
    expect(estaVacio('tareas')).toBe(true);
    expect(estaVacio('avisos')).toBe(false);
    expect(estaVacio('fechas')).toBe(false);
    anotarVacios({ tareas: false });
    expect(estaVacio('tareas')).toBe(false);
  });

  it('al vaciar la caché (Salir, Actualizar) se olvida', () => {
    anotarVacios({ mensajes: true });
    vaciarCache();
    expect(estaVacio('mensajes')).toBe(false);
  });
});
