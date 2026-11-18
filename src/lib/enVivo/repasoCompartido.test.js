// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { crearSesion, redesLocales, CADA_CAMBIOS } from './sesion';
import { camaraValida } from '../calculadoras/vistaGrafica';
import { leerCarpeta, paraGuardarCodigo, prepararProyectos } from './laboratorioCompartido';
import { darVuelta, leerRepaso, llevarMazo, marcar, MAX_DORSO, MAX_MAZO, otraVuelta, paraGuardarMazo, resumen, siguiente, soltarMazo, textoDelRepaso } from './repasoCompartido';

const abiertas = [];
function armar(n = 2) {
  const redes = redesLocales(n);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: k ? 'Beto' : 'Ana', color: k ? '#1d6fb8' : '#b4235a' } }));
  abiertas.push(...sesiones);
  return sesiones;
}
const esperar = (ms = CADA_CAMBIOS + 40) => new Promise((r) => setTimeout(r, ms));
const pestana = (s) => s.doc.getMap('h:p1');
const TARJETAS = [
  { id: 'r00000001', frente: '¿Qué es una derivada parcial?', dorso: 'La derivada respecto de una variable, con las otras fijas.', vence: '2026-11-20', paso: 4 },
  { id: 'r00000002', frente: '¿Qué dice el teorema de Schwarz?', dorso: '', vence: null },
  { id: 'r00000003', frente: 'Gradiente', dorso: 'El vector de las derivadas parciales.' },
];
const enOrden = () => 0.999;

afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
});

describe('Repaso en grupo', () => {
  it('el mazo que lleva uno lo ven todos, solo con frente y dorso', async () => {
    const [a, b] = armar();
    expect(llevarMazo(pestana(a), TARJETAS, { titulo: 'Análisis II', yo: a.yo }, enOrden)).toBe(true);
    await esperar();
    const r = leerRepaso(pestana(b));
    expect(r.mazo).toEqual(TARJETAS.map((t) => ({ f: t.frente, d: t.dorso })));
    expect(r).toMatchObject({ titulo: 'Análisis II', de: a.yo.id, deNombre: 'Ana', i: 0, vuelta: false });
    // Nothing of the student's schedule travels.
    expect(JSON.stringify(pestana(b).toJSON())).not.toMatch(/vence|paso|r0000000/);
  });

  it('dar vuelta, saber o no y pasar de tarjeta es de todos; dos que pasan a la vez avanzan una', async () => {
    const [a, b] = armar();
    llevarMazo(pestana(a), TARJETAS, { titulo: 'Análisis II', yo: a.yo }, enOrden);
    await esperar();
    darVuelta(pestana(b));
    marcar(pestana(a), a.yo, 0, 'si');
    marcar(pestana(b), b.yo, 0, 'no');
    await esperar();
    let r = leerRepaso(pestana(a));
    expect(r.vuelta).toBe(true);
    expect(r.marcas.get(a.yo.id).get(0)).toBe('si');
    expect(r.marcas.get(b.yo.id).get(0)).toBe('no');
    expect(textoDelRepaso(r)).toContain('Respuesta: La derivada');

    siguiente(pestana(a), 0);
    siguiente(pestana(b), 0);
    await esperar();
    r = leerRepaso(pestana(b));
    expect(r.i).toBe(1);
    expect(r.vuelta).toBe(false);
    expect(textoDelRepaso(r)).not.toContain('Respuesta');

    // The same mark again takes it back.
    marcar(pestana(a), a.yo, 0, 'si');
    expect(leerRepaso(pestana(a)).marcas.get(a.yo.id)?.get(0)).toBeUndefined();
  });

  it('al final, cada uno con lo suyo; otra vuelta empieza sin marcas', async () => {
    const [a, b] = armar();
    llevarMazo(pestana(a), TARJETAS, { titulo: 'Análisis II', yo: a.yo }, enOrden);
    marcar(pestana(a), a.yo, 0, 'si');
    marcar(pestana(a), a.yo, 1, 'no');
    marcar(pestana(a), a.yo, 2, 'si');
    for (let k = 0; k < 3; k += 1) siguiente(pestana(a), k);
    await esperar();
    const r = leerRepaso(pestana(b));
    expect(r.i).toBe(3);
    expect(resumen(r)).toEqual([{ persona: a.yo.id, nombre: 'Ana', color: '#b4235a', si: 2, no: 1, cuales: [1] }]);
    otraVuelta(pestana(b));
    await esperar();
    expect(leerRepaso(pestana(a))).toMatchObject({ i: 0, vuelta: false });
    expect(leerRepaso(pestana(a)).marcas.size).toBe(0);
    soltarMazo(pestana(a));
    expect(leerRepaso(pestana(a)).mazo).toEqual([]);
  });

  it('lo que llega roto o de más no entra', async () => {
    const [a, b] = armar();
    const datos = pestana(b);
    const muchas = Array.from({ length: MAX_MAZO + 30 }, (_, k) => ({ f: `Pregunta ${k}`, d: 'x'.repeat(MAX_DORSO + 500) }));
    datos.set('mazo', [null, 'texto', { f: '' }, { f: 42 }, ...muchas]);
    datos.set('i', 9999);
    datos.set('vuelta', 'sí');
    datos.set('r:0:../x:0', 'si');
    datos.set('r:0:r1:0', '<b>sí</b>');
    datos.set('p:r1', { nombre: '<img src=x onerror=alert(1)>', color: 'red; background: url(x)' });
    await esperar();
    const r = leerRepaso(pestana(a));
    expect(r.mazo.length).toBeLessThanOrEqual(MAX_MAZO);
    expect(r.mazo.every((t) => t.d.length <= MAX_DORSO)).toBe(true);
    expect(r.i).toBe(0);
    expect(r.vuelta).toBe(false);
    expect(r.marcas.size).toBe(0);
    // Names stay text; colors go through colorValido before a style.
    expect(r.personas.get('r1').nombre).toBe('<img src=x onerror=alert(1)>');
  });

  it('para guardar, el mazo como lista', () => {
    const [a] = armar(1);
    llevarMazo(pestana(a), TARJETAS, { titulo: 'Análisis II', yo: a.yo }, enOrden);
    const { nombre, texto } = paraGuardarMazo(leerRepaso(pestana(a)));
    expect(nombre).toBe('Repaso: Análisis II');
    expect(texto.split('\n')).toEqual([
      '# Análisis II',
      '',
      '- ¿Qué es una derivada parcial? — La derivada respecto de una variable, con las otras fijas.',
      '- ¿Qué dice el teorema de Schwarz? — sin respuesta escrita',
      '- Gradiente — El vector de las derivadas parciales.',
    ]);
  });
});

describe('guardar y vista de las otras herramientas', () => {
  it('el código se guarda tal cual, con el nombre de su lenguaje', () => {
    const [a] = armar(1);
    prepararProyectos(pestana(a));
    leerCarpeta(pestana(a))[0].archivos[0].texto.insert(0, 'if x:\n    print(1)\n');
    const g = paraGuardarCodigo(pestana(a));
    expect(g.nombre).toBe('Código de la sesión.py');
    expect(g.lenguaje).toBe('python');
    expect(g.texto.startsWith('if x:\n    print(1)\n')).toBe(true);
  });

  it('una cámara que llega trae solo sus tres números', () => {
    expect(camaraValida({ giro: 1, alza: 0.2, dist: 1.1, otra: 'x' })).toEqual({ giro: 1, alza: 0.2, dist: 1.1 });
    expect(camaraValida({ giro: 'a', alza: 0, dist: 1 })).toBeNull();
    expect(camaraValida({ giro: Infinity, alza: 0, dist: 1 })).toBeNull();
    expect(camaraValida(null)).toBeNull();
  });
});
