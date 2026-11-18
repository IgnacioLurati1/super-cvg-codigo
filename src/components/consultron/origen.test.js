import { describe, expect, it } from 'vitest';
import { documentoDeTexto } from '../../lib/consultron/adjuntar';
import { origenDe } from './Charla';

describe('origenDe', () => {
  it('lo que pide la pregunta manda sobre lo elegido', () => {
    expect(origenDe('Según los resúmenes, ¿qué es un proceso?', 'todo')).toBe('santo');
    expect(origenDe('Buscá solo en El Santo Resumen qué es TCP', 'campus')).toBe('santo');
    expect(origenDe('Explicame paginación solo con los PDF', 'todo')).toBe('campus');
    expect(origenDe('¿Qué es un resumen ejecutivo?', 'todo')).toBe('todo');
    expect(origenDe('¿Qué es la paginación?', 'santo')).toBe('santo');
  });
});

describe('documentoDeTexto', () => {
  it('un resumen abierto, cortado como un archivo de texto y con su fuente', () => {
    const fuente = { tipo: 'resumen', nombre: 'Redes', abierta: true };
    const d = documentoDeTexto('resumen:1', fuente, 'TCP es confiable.\nUDP no.');
    expect(d.doc).toBe('resumen:1');
    expect(d.fuente).toBe(fuente);
    expect(d.trozos[0]).toMatchObject({ doc: 'resumen:1', pagina: 1, texto: 'TCP es confiable.\nUDP no.' });
  });
});

describe('pedidos de otra explicación y de humor', async () => {
  const { pideOtraVez, preguntaOtraVez } = await import('../../lib/consultron/pedido');
  const { pideHumor } = await import('./Charla');
  it('«no lo entendí» pide lo anterior de otra forma', () => {
    for (const q of ['No lo entendi', 'no entiendo', '¿Me lo explicás más fácil?'.replace('¿Me lo explicás', 'explicamelo'), 'Con un ejemplo', 'más simple']) expect(pideOtraVez(q), q).toBe(true);
    for (const q of ['¿Qué es la fibra óptica?', 'No hay clases mañana?', 'Ejemplos de colas']) expect(pideOtraVez(q), q).toBe(false);
    expect(preguntaOtraVez('¿Qué es la fibra?', 'No lo entendí')).toMatch(/^¿Qué es la fibra\?\n\(El alumno no entendió/);
  });
  it('un chiste no se busca en los apuntes', () => {
    expect(pideHumor('Contate un chiste sobre medios de acceso')).toBe(true);
    expect(pideHumor('¿Qué es un medio de acceso?')).toBe(false);
  });
});
