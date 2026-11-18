import { describe, expect, it } from 'vitest';
import { ESQUEMA_PREGUNTA, claveDeTrozo, elegirTrozo, esquemaDeCorreccion, leerCorreccion, leerPregunta, materiaDelTema, pedidoDeCorreccion, pedidoDePregunta, pidePractica, porPalabras, sinRespuesta } from './practica';

const TEXTO = 'Una máscara de subred separa la parte de red de la parte de host de una dirección IP. Con una máscara /26 se forman cuatro subredes de 64 direcciones cada una, de las que 62 sirven para hosts. La primera dirección es la de la red y la última la de broadcast.';
const trozo = { doc: 'pdf:1', pagina: 3, texto: TEXTO, fuente: { tipo: 'pdf', nombre: 'Direccionamiento', materia: 'Redes de Información' } };

describe('pedir práctica desde el chat', () => {
  it.each([
    ['Tomame preguntas de Redes', 'Redes'],
    ['practiquemos subredes', 'subredes'],
    ['¿Me podés tomar un examen de Física?', 'Física'],
    ['¿Podés tomarme un examen de Física?', 'Física'],
    ['Haceme un parcial sobre normalización, por favor', 'normalización'],
    ['Preguntame de colas M/M/1', 'colas M/M/1'],
    ['Quiero practicar', ''],
    ['Tomame una pregunta de mis apuntes', ''],
    ['Dame 3 preguntas de Sistemas Operativos', 'Sistemas Operativos'],
  ])('«%s»', (texto, tema) => {
    expect(pidePractica(texto)?.tema ?? null).toBe(tema);
  });

  it.each(['¿Qué es una máscara de subred?', 'Dame la fórmula de Little', 'Explicame los semáforos', '¿Qué preguntas toman en el final?', 'Armame una consulta SQL'])('«%s» no es práctica', (texto) => {
    expect(pidePractica(texto)).toBeNull();
  });

  it('un tema puede nombrar la materia, y queda lo demás', () => {
    const materias = [{ id: 1, nombre: 'Redes de Información' }, { id: 2, nombre: 'Física II' }];
    expect(materiaDelTema('Redes', materias)).toEqual({ materia: materias[0], tema: '' });
    expect(materiaDelTema('subredes', materias)).toEqual({ materia: null, tema: 'subredes' });
    expect(materiaDelTema('Física campo eléctrico', materias)).toEqual({ materia: materias[1], tema: 'campo eléctrico' });
  });
});

describe('el trozo de la pregunta', () => {
  const corto = { ...trozo, doc: 'pdf:2', texto: 'Índice. Tema 1.' };
  const guia = { ...trozo, doc: 'guia', fuente: { tipo: 'guia', nombre: 'Consultron' } };

  it('con tema, uno de los mejores, de los apuntes y largo', () => {
    const elegidos = [{ trozo: guia }, { trozo: corto }, { trozo }];
    expect(elegirTrozo({ elegidos, azar: () => 0 })).toBe(trozo);
    expect(elegirTrozo({ elegidos, usados: new Set([claveDeTrozo(trozo)]) })).toBeNull();
  });

  it('sin tema, cualquiera de los documentos', () => {
    const docs = [{ doc: 'pdf:1', fuente: trozo.fuente, paginas: ['Carátula', TEXTO] }];
    const t = elegirTrozo({ docs, azar: () => 0.99 });
    expect(t).toMatchObject({ doc: 'pdf:1', pagina: 2, fuente: trozo.fuente });
  });
});

describe('la pregunta que arma el modelo', () => {
  const json = (v) => JSON.stringify({ pregunta: '', idea1: '', idea2: '', idea3: '', ...v });

  it('pide un formulario con la pregunta y tres ideas, con el trozo', () => {
    expect(ESQUEMA_PREGUNTA.required).toEqual(['pregunta', 'idea1', 'idea2', 'idea3']);
    const [sistema, usuario] = pedidoDePregunta(trozo, 'subredes');
    expect(sistema.content).toMatch(/no lo nombres/);
    expect(usuario.content).toContain(TEXTO);
    expect(usuario.content).toContain('Tema que quiere practicar: subredes');
  });

  it('queda con las ideas que están en el trozo', () => {
    const leida = leerPregunta(json({ pregunta: '¿Qué hace una máscara de subred?', idea1: 'separa la parte de red de la parte de host', idea2: 'usa el protocolo OSPF para enrutar paquetes', idea3: '' }), trozo);
    expect(leida).toEqual({ pregunta: '¿Qué hace una máscara de subred?', ideas: ['Separa la parte de red de la parte de host'] });
  });

  it('arregla la pregunta que nombra el fragmento o le faltan los signos', () => {
    expect(leerPregunta(json({ pregunta: 'Según el fragmento, ¿cuántas subredes forma una máscara /26?', idea1: 'cuatro subredes de 64 direcciones' }), trozo).pregunta).toBe('¿cuántas subredes forma una máscara /26?'.replace(/^¿c/, '¿C'));
    expect(leerPregunta(json({ pregunta: 'qué es la dirección de broadcast?', idea1: 'la última la de broadcast' }), trozo).pregunta).toBe('¿Qué es la dirección de broadcast?');
  });

  it('sin una idea del trozo, o roto, no hay pregunta', () => {
    expect(leerPregunta(json({ pregunta: '¿Qué es OSPF?', idea1: 'un protocolo de enrutamiento dinámico' }), trozo)).toBeNull();
    expect(leerPregunta(json({}), trozo)).toBeNull();
    expect(leerPregunta('no es json', trozo)).toBeNull();
    expect(leerPregunta('<think>a</think>' + json({ pregunta: '¿Qué separa la máscara?', idea1: 'la parte de red de la parte de host' }), trozo)).not.toBeNull();
  });
});

describe('la corrección', () => {
  const practica = { pregunta: '¿Qué hace una máscara de subred?', ideas: ['Separa la parte de red de la parte de host', 'La última dirección es la de broadcast'], respuesta: 'Separa la red del host de una IP.' };

  it('pide una marca por idea y un error, sin notas', () => {
    expect(esquemaDeCorreccion(2)).toMatchObject({ required: ['idea1', 'idea2', 'error'] });
    expect(esquemaDeCorreccion(2).properties.idea1.enum).toEqual(['si', 'en-parte', 'no']);
    const [sistema, usuario] = pedidoDeCorreccion(practica, trozo);
    expect(sistema.content).toMatch(/No pongas notas ni puntajes/);
    expect(usuario.content).toContain('Respuesta del alumno: Separa la red del host de una IP.');
  });

  it('toma lo que dice el modelo, y su error si es uno', () => {
    expect(leerCorreccion(JSON.stringify({ idea1: 'si', idea2: 'no', error: 'La máscara no asigna direcciones.' }), practica)).toEqual({ ideas: ['si', 'no'], error: 'La máscara no asigna direcciones.' });
    expect(leerCorreccion(JSON.stringify({ idea1: 'si', idea2: 'no', error: 'Ninguno.' }), practica).error).toBe('');
    expect(leerCorreccion(JSON.stringify({ idea1: 'si', idea2: 'no', error: 'El fragmento dice otra cosa.' }), practica).error).toBe('');
  });

  it('si el modelo falla, deciden las palabras en común', () => {
    expect(leerCorreccion(null, practica).ideas).toEqual(['si', 'no']);
    expect(leerCorreccion(JSON.stringify({ idea1: 'quizás' }), practica).ideas).toEqual(['si', 'no']);
    expect(porPalabras('Separa la parte de red de la parte de host', 'la red')).toBe('en-parte');
  });

  it('«no sé» no se corrige', () => {
    expect(sinRespuesta('')).toBe(true);
    expect(sinRespuesta('No sé')).toBe(true);
    expect(sinRespuesta('no me acuerdo')).toBe(true);
    expect(sinRespuesta('Separa red y host')).toBe(false);
  });
});
