import { afterEach, describe, expect, it, vi } from 'vitest';

// A place of the lab without the browser: its files in a Map.
function labFalso(donde, archivos = { 'main.c': 'int main(void) { return 0; }' }) {
  const datos = new Map(Object.entries(archivos));
  return {
    datos,
    donde,
    lenguaje: 'c',
    proyecto: null,
    abierto: 'main.c',
    principal: 'main.c',
    archivos: () => [...datos].map(([nombre, contenido]) => ({ nombre, contenido })),
    escribir: (n, t) => datos.has(n) && Boolean(datos.set(n, t)),
    crear: (n, t) => !datos.has(n) && Boolean(datos.set(n, t)),
    borrar: (n) => datos.delete(n),
    noSePuedeCrear: () => '',
  };
}

// Each test with the module new: its state lives in it.
async function cargar() {
  vi.resetModules();
  return import('./propuestas');
}

afterEach(() => {
  vi.doUnmock('./codigo');
  vi.doUnmock('./pantalla');
  vi.doUnmock('../../components/consultron/enEditor');
});

describe('las propuestas, por lugar', () => {
  it('irse a otro archivo y volver: las propuestas y «Deshacer» siguen, y andan', async () => {
    const p = await cargar();
    const a = labFalso('archivo-a');
    const b = labFalso('archivo-b');
    p.alLugar(a.donde);
    p.empezarPedido(a.donde);
    p.proponer(a, 'main.c', 'A1', { solo: true });
    p.proponer(a, 'main.c', 'A2');
    expect(a.datos.get('main.c')).toBe('A1');

    p.alLugar(b.donde);
    expect(p.propuestasAhora()).toEqual({ donde: 'archivo-b', archivos: [], hecho: [] });
    expect(p.aplicar(b, 'main.c')).toBe(false);
    p.deshacer(b);
    expect(b.datos.get('main.c')).toBe('int main(void) { return 0; }');

    p.alLugar(a.donde);
    expect(p.propuestasAhora().archivos.map((x) => x.despues)).toEqual(['A2']);
    expect(p.propuestasAhora().hecho).toHaveLength(1);
    expect(p.aplicar(a, 'main.c')).toBe(true);
    expect(a.datos.get('main.c')).toBe('A2');
    p.deshacer(a);
    expect(a.datos.get('main.c')).toBe('int main(void) { return 0; }');
    expect(p.propuestasAhora()).toMatchObject({ archivos: [], hecho: [] });
  });

  it('cada lugar ve las suyas: descartar en uno no toca el otro', async () => {
    const p = await cargar();
    const a = labFalso('archivo-a');
    const b = labFalso('archivo-b');
    p.alLugar(a.donde);
    p.proponer(a, 'main.c', 'de A');
    p.alLugar(b.donde);
    p.proponer(b, 'main.c', 'de B');
    p.descartar('main.c');
    expect(p.propuestasAhora().archivos).toEqual([]);
    p.alLugar(a.donde);
    expect(p.propuestasAhora().archivos.map((x) => x.despues)).toEqual(['de A']);
    expect(p.contenidoPara(b, 'main.c')).toBe('int main(void) { return 0; }');
  });

  it('un pedido que sigue después de cambiar de lugar deja lo suyo en el lugar donde se pidió', async () => {
    const p = await cargar();
    const a = labFalso('archivo-a');
    const b = labFalso('archivo-b');
    const avisos = vi.fn();
    p.suscribirPropuestas(avisos);
    p.alLugar(a.donde);
    p.empezarPedido(a.donde);
    p.alLugar(b.donde);
    avisos.mockClear();
    // What the agent still proposes for A, with B in view.
    p.proponer(a, 'main.c', 'arreglado');
    expect(p.propuestasAhora()).toMatchObject({ donde: 'archivo-b', archivos: [] });
    expect(p.propuestasAhora('archivo-a').archivos.map((x) => x.despues)).toEqual(['arreglado']);
    expect(avisos).not.toHaveBeenCalled();
    expect(b.datos.get('main.c')).toBe('int main(void) { return 0; }');
    p.alLugar(a.donde);
    expect(p.aplicar(a, 'main.c')).toBe(true);
    expect(a.datos.get('main.c')).toBe('arreglado');
  });

  it('con «Aplicar solo», lo de un pedido que sigue después de cambiar de lugar queda propuesto en el suyo, sin escribir en el que se ve', async () => {
    const enVista = { lab: null };
    const ideA = labFalso('archivo-a');
    const ideB = labFalso('archivo-b');
    vi.resetModules();
    vi.doMock('../../components/consultron/enEditor', () => ({ mostrarEnEditor: () => {} }));
    vi.doMock('./pantalla', () => ({ ideAhora: () => enVista.lab }));
    // The agent, as if the student opened B while it worked: it still asks to edit A's file.
    vi.doMock('./codigo', () => ({
      TOPE_ARCHIVO: 30_000,
      useCodigo: () => ({}),
      trabajar: async (texto, { herramienta }) => {
        enVista.lab = ideB;
        await herramienta('editar_archivo', { nombre: 'main.c', reemplazo: 'de A' }, ideA);
        return { texto: 'Listo.' };
      },
    }));
    const agente = await import('./agente');
    const p = await import('./propuestas');
    enVista.lab = ideA;
    await agente.mandar('cambialo', { solo: true });
    expect(ideA.datos.get('main.c')).toBe('int main(void) { return 0; }');
    expect(ideB.datos.get('main.c')).toBe('int main(void) { return 0; }');
    expect(p.propuestasAhora()).toMatchObject({ donde: 'archivo-b', archivos: [] });
    expect(p.propuestasAhora('archivo-a').archivos.map((x) => x.despues)).toEqual(['de A']);
  });

  it('un lugar borrado se olvida', async () => {
    const p = await cargar();
    const a = labFalso('archivo-a');
    p.alLugar(a.donde);
    p.proponer(a, 'main.c', 'x');
    p.alLugar('archivo-b');
    p.olvidarLugar(a.donde);
    expect(p.hayEnAlgunLugar()).toBe(false);
    p.alLugar(a.donde);
    expect(p.propuestasAhora().archivos).toEqual([]);
    // The one in view, too.
    p.proponer(a, 'main.c', 'y');
    p.olvidarLugar(a.donde);
    expect(p.propuestasAhora()).toEqual({ donde: 'archivo-a', archivos: [], hecho: [] });
  });

  it('guarda hasta 20 lugares: se va el que se tocó hace más, nunca el que se ve', async () => {
    const p = await cargar();
    p.alLugar('lugar-0');
    for (let i = 0; i < 22; i++) p.proponer(labFalso(`lugar-${i}`), 'main.c', `v${i}`);
    expect(p.propuestasAhora().archivos.map((x) => x.despues)).toEqual(['v0']);
    expect(p.propuestasAhora('lugar-1').archivos).toEqual([]);
    expect(p.propuestasAhora('lugar-2').archivos).toEqual([]);
    expect(p.propuestasAhora('lugar-3').archivos.map((x) => x.despues)).toEqual(['v3']);
    expect(p.propuestasAhora('lugar-21').archivos.map((x) => x.despues)).toEqual(['v21']);
    // Coming back to one counts as touching it.
    p.alLugar('lugar-3');
    p.proponer(labFalso('lugar-22'), 'main.c', 'v22');
    expect(p.propuestasAhora('lugar-0').archivos).toEqual([]);
    expect(p.propuestasAhora('lugar-3').archivos.map((x) => x.despues)).toEqual(['v3']);
  });
});
