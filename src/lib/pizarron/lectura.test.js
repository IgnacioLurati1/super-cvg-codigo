import { describe, expect, it } from 'vitest';
import { derDeGemini, lecturaEnTexto, leerLectura, lenguajeDelLab, lineasDeLectura, sinTexto, tablaEnTexto } from './lectura';

// Answers of Gemini to photos of Ignacio's classes (26/11/2026), cut.
const CODIGO = [
  '```matlab',
  'z=[]',
  'p1=1',
  '[num,den]=zp2tf(z,p,k)',
  '```',
  '',
  '$$s^2 + 51 s + 50$$',
  '',
  'Continuous-time transfer function.',
  '',
  '[Dibujo: Gráfica de Amplitud vs Tiempo (seconds) con tres curvas de respuesta al escalón]',
].join('\n');

const TABLA = ['RA', '', '[Dibujo: Árbol binario con nodos y frecuencias]', '', '| IM | COD |', '|---|---|', '| A | 1 |', '| D | 000 |'].join('\n');

const FORMULAS = [
  '### Controlador Proporcional Integral Derivativo (PID)',
  '',
  '$$q(t) = k_p \\cdot e(t) + q_s$$',
  '',
  'Aplicando variables de desviación:',
].join('\n');

describe('lo que leyó Gemini', () => {
  it('el código queda aparte, con su lenguaje, y la fórmula como fórmula', () => {
    const b = leerLectura(CODIGO);
    expect(b[0]).toEqual({ tipo: 'codigo', lenguaje: 'matlab', texto: 'z=[]\np1=1\n[num,den]=zp2tf(z,p,k)' });
    expect(b[1].tipo).toBe('parrafo');
    expect(b[1].partes[0]).toEqual({ formula: 's^2 + 51 s + 50', bloque: true });
    expect(b.at(-1).partes[0].texto).toMatch(/^\[Dibujo: /);
  });

  it('una tabla de Markdown es una tabla, con sus títulos en la primera fila', () => {
    const b = leerLectura(TABLA);
    const tabla = b.find((x) => x.tipo === 'tabla');
    expect(tabla.filas).toEqual([['IM', 'COD'], ['A', '1'], ['D', '000']]);
    expect(tablaEnTexto(tabla.filas)).toBe('IM\tCOD\nA\t1\nD\t000');
    expect(b[0]).toMatchObject({ tipo: 'parrafo' });
  });

  it('los títulos, en negrita; el texto, sin las marcas de LaTeX para buscarlo', () => {
    const b = leerLectura(FORMULAS);
    expect(b[0]).toMatchObject({ tipo: 'parrafo', titulo: true });
    expect(lecturaEnTexto(FORMULAS)).toBe('Controlador Proporcional Integral Derivativo (PID)\n\nq(t) = k_p \\cdot e(t) + q_s\n\nAplicando variables de desviación:');
    expect(lecturaEnTexto(TABLA)).not.toMatch(/---/);
  });

  it('una foto sin nada escrito', () => {
    expect(sinTexto(' [Sin texto] ')).toBe(true);
    expect(sinTexto('[Sin texto] y algo')).toBe(false);
  });
});

describe('un DER del pizarrón', () => {
  const JSON_DER = JSON.stringify({
    entidades: [
      { nombre: 'cliente', atributos: [{ nombre: 'id', clave: true }, { nombre: 'nombre' }] },
      { nombre: 'pedido', debil: true, atributos: [{ nombre: 'numero', clave: true }] },
    ],
    vinculos: [{ nombre: 'hace', atributos: [{ nombre: 'fecha' }], puntas: [{ a: 'Cliente', card: '1:1' }, { a: 'pedido', card: '0:N' }] }],
  });

  it('pasa a un .der del Laboratorio, con las puntas unidas por nombre', () => {
    const der = derDeGemini(JSON_DER);
    expect(der.entidades.map((e) => e.nombre)).toEqual(['cliente', 'pedido']);
    expect(der.entidades[1].debil).toBe(true);
    expect(der.entidades[0].atributos.find((a) => a.nombre === 'id').clave).toBe(true);
    const [v] = der.vinculos;
    expect(v.puntas.map((p) => p.a)).toEqual(der.entidades.map((e) => e.id));
    expect(v.puntas.map((p) => p.card)).toEqual(['1:1', '0:N']);
    expect(v.atributos[0].nombre).toBe('fecha');
  });

  it('en la respuesta, su bloque es un DER; si no es un JSON que sirva, queda como código', () => {
    const b = leerLectura(`### Clientes\n\n\`\`\`der\n${JSON_DER}\n\`\`\`\n\nFin`);
    expect(b.map((x) => x.tipo)).toEqual(['parrafo', 'der', 'parrafo']);
    expect(leerLectura('```der\n{ esto no es JSON\n```')[0]).toMatchObject({ tipo: 'codigo' });
    expect(derDeGemini('{"entidades":[]}')).toBe(null);
  });

  it('en el texto del PDF, el DER va en palabras para buscarlo', () => {
    const t = lecturaEnTexto(['Clientes', '', '```der', JSON_DER, '```', '', 'Fin'].join('\n'));
    expect(t).toBe('Clientes\n\nEntidad cliente: id (clave), nombre.\nEntidad débil pedido: numero (clave).\nVínculo hace entre cliente (1:1) y pedido (0:N): fecha.\n\nFin');
  });

  it('un vínculo con una punta que no es una entidad no entra', () => {
    const der = derDeGemini(JSON.stringify({ entidades: [{ nombre: 'a' }], vinculos: [{ nombre: 'x', puntas: [{ a: 'a', card: '1:1' }, { a: 'nadie', card: '0:N' }] }] }));
    expect(der.vinculos).toEqual([]);
  });
});

describe('lo leído en el PDF y en el Laboratorio', () => {
  it('cada línea en su renglón de la página, en orden y sin las marcas', () => {
    const l = lineasDeLectura(FORMULAS);
    expect(l.map((x) => x.texto)).toEqual(['Controlador Proporcional Integral Derivativo (PID)', 'q(t) = k_p \\cdot e(t) + q_s', 'Aplicando variables de desviación:']);
    expect(l[1].y0).toBeGreaterThan(l[0].y1);
    expect(l.every((x) => x.y1 <= 1 && x.x0 >= 0)).toBe(true);
  });

  it('el código va al Laboratorio solo si es de un lenguaje que corre ahí', () => {
    expect(lenguajeDelLab('Python')).toBe('python');
    expect(lenguajeDelLab('cpp')).toBe('c');
    expect(lenguajeDelLab('matlab')).toBe(null);
    expect(lenguajeDelLab('')).toBe(null);
  });
});

describe('lo que la revisión encontró', () => {
  it('dos DER en una respuesta van los dos en palabras', () => {
    const der = JSON.stringify({ entidades: [{ nombre: 'a' }] });
    const t = lecturaEnTexto(['```der', der, '```', 'medio', '```der', der, '```'].join('\n'));
    expect(t).not.toMatch(/entidades/);
    expect(t.match(/Entidad a\./g)).toHaveLength(2);
  });

  it('los pesos no son fórmulas: el texto de búsqueda los deja', () => {
    expect(lecturaEnTexto('Cuesta $50 y $x^2$ es')).toBe('Cuesta $50 y x^2 es');
  });
});
