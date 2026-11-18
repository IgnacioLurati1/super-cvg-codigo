// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { abrirRed, TROZO } from './red';
import { canalesLocales } from './canal';
import { crearSesion } from './sesion';
import { derivar, leerCodigo, mostrarCodigo, nuevoCodigo, ALFABETO, LARGO } from './codigo';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function dos(codigoB) {
  const canal = canalesLocales();
  const codigo = nuevoCodigo();
  const a = await abrirRed({ codigo, canal, directa: false });
  const b = await abrirRed({ codigo: codigoB ?? codigo, canal, directa: false });
  const llegaronA = [];
  const llegaronB = [];
  a.alRecibir((bytes, de) => llegaronA.push([bytes, de]));
  b.alRecibir((bytes, de) => llegaronB.push([bytes, de]));
  return { a, b, llegaronA, llegaronB };
}

describe('el código', () => {
  it('sale del alfabeto sin letras dudosas y se lee escrito de cualquier forma', () => {
    const c = nuevoCodigo();
    expect(c).toHaveLength(LARGO);
    expect([...c].every((x) => ALFABETO.includes(x))).toBe(true);
    expect(leerCodigo(mostrarCodigo(c).toLowerCase())).toBe(c);
    expect(leerCodigo(` ${c.slice(0, 4)} ${c.slice(4)} `)).toBe(c);
    // The whole invitation link, pasted as it comes from «Copiar link».
    expect(leerCodigo(`https://supercvg.lutastudios.com/en-vivo#${mostrarCodigo(c)}`)).toBe(c);
    expect(leerCodigo('ABCD-EFGH-IJKL')).toBeNull();
    expect(leerCodigo('corto')).toBeNull();
  });

  it('da siempre la misma sala y otra para otro código', async () => {
    const c = nuevoCodigo();
    const [x, y, z] = await Promise.all([derivar(c), derivar(c), derivar(nuevoCodigo())]);
    expect(x.sala).toBe(y.sala);
    expect(x.sala).not.toBe(z.sala);
    expect(x.sala).toMatch(/^[0-9a-f]{32}$/);
    expect(x.sala).not.toContain(c);
  });
});

describe('la red', () => {
  it('lleva un mensaje cifrado y dice de quién es', async () => {
    const { a, b, llegaronB } = await dos();
    await esperar(10);
    await a.mandar(new Uint8Array([1, 2, 3]));
    await esperar(50);
    expect(llegaronB).toEqual([[new Uint8Array([1, 2, 3]), a.yo]]);
    a.cerrar();
    b.cerrar();
  });

  it('con otro código no se lee nada (ni llegan a la misma sala)', async () => {
    const canal = canalesLocales();
    const a = await abrirRed({ codigo: nuevoCodigo(), canal, directa: false });
    const b = await abrirRed({ codigo: nuevoCodigo(), canal, directa: false });
    const llegaron = [];
    b.alRecibir((x) => llegaron.push(x));
    await a.mandar(new Uint8Array([9]));
    await esperar(50);
    expect(llegaron).toEqual([]);
    expect(a.sala).not.toBe(b.sala);
  });

  it('lo que pasa por el servidor no se puede leer', async () => {
    const vistos = [];
    const base = canalesLocales();
    const canal = (sala, yo, h) => {
      const c = base(sala, yo, h);
      return { ...c, mandar: (bytes) => (vistos.push(bytes), c.mandar(bytes)) };
    };
    const codigo = nuevoCodigo();
    const a = await abrirRed({ codigo, canal, directa: false });
    const b = await abrirRed({ codigo, canal, directa: false });
    b.alRecibir(() => {});
    await a.mandar(new TextEncoder().encode('la respuesta es 42'));
    await esperar(50);
    expect(vistos.length).toBeGreaterThan(0);
    const todo = new TextDecoder('latin1').decode(Uint8Array.from(vistos.flatMap((v) => [...v])));
    expect(todo).not.toContain('respuesta');
    expect(todo).not.toContain(codigo);
  });

  it('un mensaje grande va en partes y llega entero', async () => {
    const { a, llegaronB } = await dos();
    const grande = new Uint8Array(TROZO * 2 + 5).map((_, i) => i % 256);
    await a.mandar(grande);
    await esperar(800);
    expect(llegaronB).toHaveLength(1);
    expect(llegaronB[0][0]).toEqual(grande);
  });

  it('lo que va para uno solo, el resto no lo recibe', async () => {
    const canal = canalesLocales();
    const codigo = nuevoCodigo();
    const [a, b, c] = await Promise.all([0, 1, 2].map(() => abrirRed({ codigo, canal, directa: false })));
    const deB = [];
    const deC = [];
    b.alRecibir((x) => deB.push(x));
    c.alRecibir((x) => deC.push(x));
    await esperar(10);
    await a.mandar(new Uint8Array([7]), b.yo);
    await esperar(50);
    expect(deB).toHaveLength(1);
    expect(deC).toHaveLength(0);
  });

  it('sabe quién está y quién se fue', async () => {
    const { a, b } = await dos();
    const vistos = [];
    a.alCambiarPares((ids) => vistos.push([...ids]));
    await esperar(20);
    expect(vistos.at(-1)).toEqual([b.yo]);
    await b.cerrar();
    await esperar(20);
    expect(vistos.at(-1)).toEqual([]);
  });

  it('una sesión entera anda sobre la red', async () => {
    const canal = canalesLocales();
    const codigo = nuevoCodigo();
    const ra = await abrirRed({ codigo, canal, directa: false });
    const a = crearSesion({ red: ra, yo: { nombre: 'Ana', color: '#000', anfitrion: true } });
    a.doc.getText('t').insert(0, 'antes de que llegue');
    await esperar(200);
    const rb = await abrirRed({ codigo, canal, directa: false });
    const b = crearSesion({ red: rb, yo: { nombre: 'Beto', color: '#000' } });
    await esperar(600);
    expect(b.doc.getText('t').toString()).toBe('antes de que llegue');
    expect(b.otros().map((o) => o.nombre)).toEqual(['Ana']);
    b.doc.getText('t').insert(0, '¡');
    await esperar(400);
    expect(a.doc.getText('t').toString()).toBe('¡antes de que llegue');
    a.cerrar();
    b.cerrar();
  });
});
