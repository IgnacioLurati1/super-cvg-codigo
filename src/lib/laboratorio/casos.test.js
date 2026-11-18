// Test cases of the lab (docs/laboratorio-ide.md, point 3): the comparison, what a run prints, how they're kept with
// the file or the project, how they travel to Drive (also past an older version of the site) and in the zip.
import { beforeEach, describe, expect, it } from 'vitest';
import { fijarUsuario, mioActual, sanearMio } from '../mio';
import { armar, piezas, unir } from '../union';
import { capturar, casosATexto, casosDeTexto, comparar, lineasDe, normalizar, resultadoDe } from './casos';
import { crearProyecto, guardarArchivoNuevo, guardarCasos } from './guardado';
import { MAX_CASOS, MAX_ENTRADA, MAX_TOTAL_CASOS, sanearCasos } from './saneo';
import { leerZip, zipDeProyecto } from './zip';

const H = 1_760_000_000_000;
const caso = (n, cosas = {}) => ({ id: `c${String(n).padStart(4, '0')}`, nombre: `Caso ${n}`, entrada: '2\n3', esperada: '5', ...cosas });

describe('comparar', () => {
  it('sin contar los espacios al final ni las líneas vacías del final', () => {
    expect(normalizar('a  \nb\t\n\n\n')).toBe('a\nb');
    expect(comparar('5\n', '5   \n\n').paso).toBe(true);
    expect(comparar('', '\n\n').paso).toBe(true);
    // Spaces at the start or in the middle do count.
    expect(comparar('a b', 'a  b').paso).toBe(false);
  });

  it('exacto: cuenta todo', () => {
    expect(comparar('5', '5\n', true).paso).toBe(false);
    expect(comparar('5 ', '5', true).filas).toEqual([{ n: 1, tipo: 'distinta', esperada: '5 ', salida: '5', desde: 1 }]);
    expect(comparar('5\n', '5\n', true).paso).toBe(true);
  });

  it('marca cada línea: igual, distinta desde dónde, la que falta y la que sobra', () => {
    expect(comparar('Suma: 5\nfin', 'Suma: 6\nfin').filas).toEqual([
      { n: 1, tipo: 'distinta', esperada: 'Suma: 5', salida: 'Suma: 6', desde: 6 },
      { n: 2, tipo: 'igual', esperada: 'fin', salida: 'fin' },
    ]);
    expect(comparar('a\nb', 'a').filas[1]).toEqual({ n: 2, tipo: 'falta', esperada: 'b', salida: null });
    expect(comparar('a', 'a\nb').filas[1]).toEqual({ n: 2, tipo: 'sobra', esperada: null, salida: 'b' });
    expect(comparar('a', '').filas).toEqual([{ n: 1, tipo: 'falta', esperada: 'a', salida: null }]);
  });
});

describe('lo que sale de una corrida', () => {
  it('una línea por lectura, y un Enter al final no suma otra', () => {
    expect(lineasDe('')).toEqual([]);
    expect(lineasDe('2\n3\n')).toEqual(['2', '3']);
    expect(lineasDe('2\n\n')).toEqual(['2', '']);
  });

  it('lo que imprime y cada línea que lee, como la consola; stderr no cuenta; al acabarse, el fin de la entrada', () => {
    const c = capturar(['2', '3']);
    c.mirar({ tipo: 'salida', flujo: 'out', texto: 'a: ' });
    expect(c.responder()).toBe('2');
    c.mirar({ tipo: 'salida', flujo: 'err', texto: 'warning\n' });
    c.mirar({ tipo: 'salida', flujo: 'out', texto: 'b: ' });
    expect(c.responder()).toBe('3');
    c.mirar({ tipo: 'salida', flujo: 'out', texto: '5\n' });
    expect(c.responder()).toBe(null);
    expect(c.texto()).toBe('a: 2\nb: 3\n5\n');
    // A browser that can't pause gets the lines at the start, and the engine writes each one: the same text.
    expect(c.lineas).toEqual(['2', '3']);
    c.mirar({ tipo: 'limpiar' });
    expect(c.texto()).toBe('');
  });

  it('cómo terminó cada caso', () => {
    const c = caso(1);
    expect(resultadoDe(c, { ms: 3 }, '5\n').estado).toBe('paso');
    expect(resultadoDe(c, { ms: 3 }, '6\n')).toMatchObject({ estado: 'fallo', comparacion: { paso: false } });
    expect(resultadoDe(c, { error: 'Traceback\n  línea 1\nZeroDivisionError: division by zero', linea: 1 }, '')).toMatchObject({ estado: 'error', error: 'ZeroDivisionError: division by zero' });
    expect(resultadoDe(c, { error: 'Traceback\n  línea 1\nZeroDivisionError: division by zero', linea: 1 }, '', 'python').error).toMatch(/^ZeroDivisionError: Dividiste por cero/);
    expect(resultadoDe(c, { cortado: 'tiempo' }, '').estado).toBe('tiempo');
    expect(resultadoDe(c, { cortado: 'parado' }, '').estado).toBe('parado');
    expect(resultadoDe(c, { cortado: 'salida' }, '').estado).toBe('error');
  });
});

describe('saneo', () => {
  it('solo texto, con topes, sin repetidos y hasta MAX_CASOS', () => {
    const NUL = String.fromCharCode(0);
    const limpios = sanearCasos([
      { id: 'c0001', nombre: ' Uno\n', entrada: `1\r\n2${NUL}`, esperada: 'x\ty', exacto: true, otro: 1 },
      { id: 'c0001', nombre: 'Repetido' },
      { id: 'mal', nombre: 'Sin id' },
      { id: 'c0002', nombre: 7, entrada: 'a'.repeat(MAX_ENTRADA + 5), esperada: {}, exacto: 'si' },
      'cualquier cosa',
    ]);
    expect(limpios).toEqual([
      { id: 'c0001', nombre: 'Uno', entrada: '1\n2', esperada: 'x\ty', exacto: true },
      { id: 'c0002', nombre: '', entrada: 'a'.repeat(MAX_ENTRADA), esperada: '' },
    ]);
    expect(sanearCasos(Array.from({ length: MAX_CASOS + 5 }, (_, i) => caso(i)))).toHaveLength(MAX_CASOS);
  });

  it('todos los casos del alumno juntos tienen un tope: lo que no entra se cae del último', () => {
    const grande = Array.from({ length: 10 }, (_, i) => caso(i, { esperada: 'x'.repeat(8_000) }));
    const proyectos = Array.from({ length: 3 }, (_, i) => ({ id: `qabc1234${i}`, nombre: `P${i}`, lenguaje: 'c', creado: H + i, cambiado: H + i, casos: grande }));
    const d = sanearMio({ proyectosLab: proyectos });
    const largos = d.proyectosLab.map((p) => (p.casos ?? []).reduce((n, c) => n + c.esperada.length, 0));
    expect(largos.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_TOTAL_CASOS);
    expect(d.proyectosLab[0].casos).toHaveLength(10);
    expect(d.proyectosLab[2].casos).toBeUndefined();
  });
});

describe('con el archivo o el proyecto', () => {
  beforeEach(() => {
    localStorage.clear();
    fijarUsuario(null);
    fijarUsuario(5);
  });

  it('se guardan con el archivo suelto sin cambiar su fecha, y pasan al proyecto que se arma con él', () => {
    const a = guardarArchivoNuevo({ nombre: 'suma', lenguaje: 'c', codigo: 'int main(void){}' }, H);
    expect(guardarCasos(a, [caso(1), caso(2)])).toBe(true);
    const archivo = mioActual().laboratorio[0];
    expect(archivo.casos.map((c) => c.id)).toEqual(['c0001', 'c0002']);
    expect(archivo.cambiado).toBe(H);
    expect(guardarCasos('lnoexiste1', [caso(1)])).toBe(false);
    expect(guardarCasos(a, Array.from({ length: MAX_CASOS + 1 }, (_, i) => caso(i)))).toBe(false);

    const q = crearProyecto({ nombre: 'Suma' }, a, H + 1);
    expect(mioActual().proyectosLab[0].casos).toHaveLength(2);
    expect(mioActual().laboratorio[0].casos).toBeUndefined();
    expect(guardarCasos(q, [])).toBe(true);
    expect(mioActual().proyectosLab[0].casos).toBeUndefined();
  });

  it('viajan a Drive como un elemento aparte y vuelven igual', () => {
    const d = sanearMio({
      proyectosLab: [{ id: 'qabc12345', nombre: 'Suma', lenguaje: 'c', principal: 'labc12345', creado: H, cambiado: H, casos: [caso(1)] }],
      laboratorio: [
        { id: 'labc12345', nombre: 'main', lenguaje: 'c', codigo: 'int main(void){}', proyecto: 'qabc12345', creado: H, cambiado: H },
        { id: 'lsuelto12', nombre: 'otro', lenguaje: 'python', codigo: 'print(1)', creado: H, cambiado: H, casos: [caso(2, { exacto: true })] },
      ],
    });
    const p = piezas(d);
    expect(p['labt/qabc12345']).toEqual([caso(1)]);
    expect(p['labt/lsuelto12']).toEqual([caso(2, { exacto: true })]);
    expect(p['labp/qabc12345'].casos).toBeUndefined();
    expect(p['lab/lsuelto12'].casos).toBeUndefined();
    expect(sanearMio(armar(p))).toEqual(d);
    // The cases of something that isn't there anymore don't come back alone.
    expect(sanearMio(armar({ 'labt/qzzz99999': [caso(1)] })).proyectosLab).toEqual([]);
  });

  it('un dispositivo con una versión vieja del sitio no los borra al unir', () => {
    const conCasos = sanearMio({
      proyectosLab: [{ id: 'qabc12345', nombre: 'Suma', lenguaje: 'c', principal: 'labc12345', creado: H, cambiado: H, casos: [caso(1)] }],
      laboratorio: [{ id: 'labc12345', nombre: 'main', lenguaje: 'c', codigo: 'int main(void){}', proyecto: 'qabc12345', creado: H, cambiado: H }],
    });
    const tiempos = Object.fromEntries(Object.keys(piezas(conCasos)).map((k) => [k, H]));
    const copia = { datos: conCasos, t: tiempos };
    // The old one doesn't know `casos`: its sanearMio drops them. It changes the code and joins.
    const sinCasos = (m) => ({ ...m, proyectosLab: m.proyectosLab.map(({ casos: _c, ...p }) => p), laboratorio: m.laboratorio.map(({ casos: _c, ...a }) => a) });
    const viejo = sinCasos(conCasos);
    viejo.laboratorio[0] = { ...viejo.laboratorio[0], codigo: 'int main(void){return 1;}', cambiado: H + 5 };
    const delViejo = unir({ datos: viejo, t: { ...tiempos, 'lab/labc12345': H + 5 }, d: { 'lab/labc12345': H } }, copia, { ahora: H + 6 });
    // What it writes to Drive: its data, without them, and the time of each element, theirs too.
    const copiaVieja = { datos: sinCasos(delViejo.datos), t: delViejo.t };
    expect(copiaVieja.t['labt/qabc12345']).toBe(H);
    // The new one joins with that copy: it keeps the cases, and takes the code.
    const r = unir({ datos: conCasos, t: tiempos, d: {} }, copiaVieja, { ahora: H + 7 });
    const unido = sanearMio(r.datos);
    expect(unido.proyectosLab[0].casos).toEqual([caso(1)]);
    expect(unido.laboratorio[0].codigo).toBe('int main(void){return 1;}');
  });
});

describe('en el zip', () => {
  it('van en un archivo de texto aparte y vuelven iguales', () => {
    const casos = [
      caso(1, { nombre: 'Suma simple' }),
      caso(2, { nombre: 'Sin entrada', entrada: '', esperada: 'Hola\n', exacto: true }),
      caso(3, { nombre: 'Con líneas vacías', entrada: 'a\n\nb\n', esperada: 'x\n\ny' }),
    ];
    const texto = casosATexto(casos);
    expect(texto).toContain('=== Caso: Suma simple\n--- Entrada\n2\n3\n--- Salida esperada\n5\n');
    const vueltos = casosDeTexto(texto);
    expect(vueltos.map(({ id: _id, ...c }) => c)).toEqual(casos.map(({ id: _id, ...c }) => c));
    expect(new Set(vueltos.map((c) => c.id)).size).toBe(3);

    const zip = zipDeProyecto('Suma', [{ nombre: 'main.c', contenido: 'int main(void){}' }, { nombre: 'casos.txt', contenido: 'datos' }], casos);
    const r = leerZip(zip);
    // A data file of the project named the same is still the project's.
    expect(r.archivos.map((a) => `${a.nombre}.${a.ext}`)).toEqual(['casos.txt', 'main.c']);
    expect(r.afuera).toEqual([]);
    expect(r.casos.map((c) => c.nombre)).toEqual(['Suma simple', 'Sin entrada', 'Con líneas vacías']);
    expect(leerZip(zipDeProyecto('Suma', [{ nombre: 'main.c', contenido: '' }])).casos).toEqual([]);
  });

  it('un archivo escrito a mano: lo que no tiene forma de caso no entra', () => {
    expect(casosDeTexto('basura\n=== Caso:\n--- Entrada\n1\n--- Salida esperada\n1').map((c) => [c.nombre, c.entrada, c.esperada])).toEqual([['Caso 1', '1', '1']]);
    expect(casosDeTexto('nada que ver')).toEqual([]);
  });
});
