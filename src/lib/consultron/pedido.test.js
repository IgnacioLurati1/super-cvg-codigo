import { describe, expect, it } from 'vitest';
import { charlaAntes } from './motor';
import { citasDe, conCitaQueFalta, noEsta, objeta, pideOtraVez, preguntaObjetada, puedeSerNoEsta } from './pedido';

const trozo = (texto) => ({ trozo: { doc: 'd', pagina: 1, texto, fuente: { tipo: 'propia', clase: 'texto', nombre: 'Servo SG90' } } });
const servo = trozo('## Servo SG90\nEl servo SG90 del robot gira 180 grados y se alimenta con 5 volts.\nSu señal de control es PWM de 50 Hz.');
const aviso = trozo('Mensaje del tablón del 1 de noviembre.\nEl jueves 12 no hay clase por el congreso. Recuperamos el sábado a las 9 en el aula 305.');
const otro = trozo('Mensaje del tablón del 18 de octubre.\nAviso 12 de ejemplo');

describe('conCitaQueFalta', () => {
  it('le pone el número a una respuesta corta que sale de un fragmento y vino sin él', () => {
    const texto = '<think>\n\n</think>\n\nEl servo SG90 gira **180 grados** y se alimenta con **5 volts**.';
    const con = conCitaQueFalta(texto, [servo]);
    expect(con).toBe('<think>\n\n</think>\n\nEl servo SG90 gira **180 grados** y se alimenta con **5 volts** [1].');
    expect(citasDe(con, 1)).toEqual([1]);
  });

  it('elige el fragmento que dice casi todo, entre varios', () => {
    const texto = 'Según el aviso del tablón, el **jueves 12** no hay clase porque hay un **congreso**. La clase se recupera el **sábado a las 9** en el **aula 305**.';
    expect(conCitaQueFalta(texto, [otro, aviso])).toBe(`${texto.slice(0, -1)} [2].`);
  });

  it('sin punto final, el número va al final', () => {
    expect(conCitaQueFalta('El servo SG90 gira 180 grados', [servo])).toBe('El servo SG90 gira 180 grados [1]');
  });

  it('no toca una respuesta que ya nombra un fragmento', () => {
    const texto = 'El servo gira 180 grados [1] y se alimenta con 5 volts.';
    expect(conCitaQueFalta(texto, [servo, aviso])).toBe(texto);
  });

  it('no le pone número a lo que no sale de ningún fragmento', () => {
    // A number that no piece has: the model brought it from what it knows.
    expect(conCitaQueFalta('El servo SG90 gira 270 grados y se alimenta con 5 volts.', [servo])).toBe('El servo SG90 gira 270 grados y se alimenta con 5 volts.');
    // Words of the subject, and little of the piece.
    const general = 'Un servo es un motor con un circuito que lo lleva a un ángulo fijo y lo mantiene ahí aunque le hagan fuerza.';
    expect(conCitaQueFalta(general, [servo])).toBe(general);
  });

  it('no toca una respuesta sin fragmentos, ni una que es una lista o trae código', () => {
    expect(conCitaQueFalta('El servo SG90 gira 180 grados.', [])).toBe('El servo SG90 gira 180 grados.');
    const lista = 'El servo SG90:\n\n- Gira 180 grados.\n- Se alimenta con 5 volts.';
    expect(conCitaQueFalta(lista, [servo])).toBe(lista);
    const codigo = 'El servo SG90 gira 180 grados.\n\n```c\nint grados = 180;\n```';
    expect(conCitaQueFalta(codigo, [servo])).toBe(codigo);
  });
});

describe('lo que todavía puede terminar en «No lo encuentro en tus apuntes.»', () => {
  it('cada comienzo de la frase, con sus asteriscos, lo que piensa y un número de pieza a medias', () => {
    const frase = 'No lo encuentro en tus apuntes.';
    for (let i = 0; i <= frase.length; i += 1) expect(puedeSerNoEsta(frase.slice(0, i))).toBe(true);
    for (const t of ['', '<think>veamos', '<think>nada</think>No lo enc', '**No lo encuentro', 'No lo encuentro en tus apuntes. [', 'No lo encuentro en tus apuntes. [1, 2', 'No lo encuentro en tus apuntes.** [3]', 'No lo encuentro en tus apuntes [2', null])
      expect(puedeSerNoEsta(t)).toBe(true);
  });

  it('una respuesta de verdad deja de esperar en cuanto se aparta', () => {
    for (const t of ['Sí', 'No, un semáforo', 'No lo sé', 'No lo encuentro en tus apuntes, pero', 'No lo encuentro en tus apuntes. Igual', 'Un bucle repite'])
      expect(puedeSerNoEsta(t)).toBe(false);
  });

  it('lo que termina siendo la frase entera es la frase', () => {
    for (const t of ['No lo encuentro en tus apuntes.', '**No lo encuentro en tus apuntes.**', 'No lo encuentro en tus apuntes. [1]']) {
      expect(puedeSerNoEsta(t)).toBe(true);
      expect(noEsta(t)).toBe(true);
    }
  });
});

describe('objeta', () => {
  it('las de Ignacio, tal cual: dice que la respuesta estaba mal', () => {
    for (const q of ['De hecho es al reves', 'No no, que hay en mi calendario el viernes?', 'está mal', 'te equivocaste', 'no, eso no'])
      expect(objeta(q), q).toBe(true);
  });

  it('no una pregunta nueva que empieza con «no»', () => {
    for (const q of ['no entiendo las derivadas', 'no me sale el ejercicio 3', '¿Qué es una derivada?', 'y para rendirla?'])
      expect(objeta(q), q).toBe(false);
  });

  it('vuelve a preguntar lo primero, sin darle la razón', () => {
    const pedido = preguntaObjetada('Que necesito para cursar legislacion?');
    expect(pedido).toMatch(/^Que necesito para cursar legislacion\?\n/);
    expect(pedido).toContain('No digas que tiene razón');
    expect(pedido).toContain('empezando por «Según Sysacad»');
    expect(preguntaObjetada('que hay el viernes?', 'Según tu calendario')).toContain('empezando por «Según tu calendario»');
  });
});

describe('charlaAntes', () => {
  const hilo = [
    { id: 1, estado: 'listo', pregunta: 'que necesito para cursar inteligencia artificial?', texto: 'Te falta regularizar Simulación [1].', soloSitio: true },
    { id: 2, estado: 'listo', pregunta: '¿Qué es un servo?', texto: 'Un motor con control de posición [1].' },
  ];

  it('sin las respuestas de sus datos cuando la pregunta nueva es de otra cosa', () => {
    const turnos = charlaAntes(hilo, 3, { sinPropias: true });
    expect(turnos.map((t) => t.content)).toEqual(['¿Qué es un servo?', 'Un motor con control de posición.']);
  });

  it('con todas para seguir hablando de su carrera', () => {
    expect(charlaAntes(hilo, 3)).toHaveLength(4);
  });
});

describe('pideOtraVez', () => {
  it('sobre la respuesta de antes', () => {
    for (const q of ['no entiendo', 'No entendí nada', 'no lo entendí, explicamelo más fácil', 'no entiendo eso', 'más simple', 'con un ejemplo'])
      expect(pideOtraVez(q), q).toBe(true);
  });

  it('no un tema nuevo', () => {
    for (const q of ['no entiendo las derivadas', 'no entiendo cómo se calcula el promedio ponderado'])
      expect(pideOtraVez(q), q).toBe(false);
  });
});
