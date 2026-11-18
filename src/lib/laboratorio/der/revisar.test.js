import { describe, expect, it } from 'vitest';
import { INSTRUMENTOS } from './instrumentos.fixture';
import { IDIOMAS } from './idiomas.fixture';
import { revisarDer } from './revisar';

const at = (id, nombre, o = {}) => ({ id, nombre, clave: false, multivaluado: false, derivado: false, partes: [], ...o });
const entidad = (id, atributos = [], debil = false) => ({ id, nombre: id, debil, x: 0, y: 0, atributos });
const vinculo = (id, puntas, o = {}) => ({ id, nombre: id, identificador: false, x: 0, y: 0, atributos: [], puntas: puntas.map(([a, card]) => ({ a, card, rol: '' })), ...o });
const der = (o) => ({ v: 1, entidades: [], vinculos: [], jerarquias: [], agregaciones: [], decisiones: { cp: {}, lado11: {}, tipos: {} }, ...o });
const ids = (d) => revisarDer(d).map((x) => x.id);

describe('lo que la cátedra corrige en el DER', () => {
  it('los casos de las pruebas no tienen nada que corregir', () => {
    expect(revisarDer(INSTRUMENTOS)).toEqual([]);
    expect(revisarDer(IDIOMAS)).toEqual([]);
  });

  it('cada error, con su texto y dónde está', () => {
    const r = revisarDer(
      der({
        entidades: [
          entidad('cliente', [at('c1', 'nombre')]),
          entidad('pago', [at('p1', 'importe')], true),
          entidad('cuota', [at('q1', 'nro', { clave: true })], true),
          entidad('persona', [at('pe1', 'id', { clave: true, multivaluado: true })]),
          entidad('agente', [at('a1', 'legajo', { clave: true })]),
          entidad('venta', [at('v1', 'id', { clave: true }), at('v2', 'id_cliente')]),
        ],
        vinculos: [
          vinculo('compra', [['cliente', '1:1'], ['venta', '']], { atributos: [at('k1', 'fecha', { clave: true })] }),
          vinculo('solo', [['venta', '1:1']]),
          vinculo('de', [['cuota', '0:N'], ['venta', '0:1']], { identificador: true }),
          vinculo('raro', [['cliente', '1:1'], ['venta', '0:N']], { identificador: true }),
        ],
        jerarquias: [{ id: 'j', x: 0, y: 0, superclase: 'persona', subclases: ['agente'], tipo: 'D', total: false, pasaje: 'superclase' }],
        agregaciones: [{ id: 'g', nombre: '', vinculo: 'compra' }, { id: 'h', nombre: '', vinculo: 'raro' }],
      }),
    );
    const por = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(Object.keys(por).sort()).toEqual([
      'agregacion-no-nm:h',
      'cf-en-der:v2',
      'clave-en-vinculo:compra',
      'clave-multivaluada:pe1',
      'debil-participacion:de:venta',
      'debil-sin-discriminante:pago',
      'debil-sin-identificador:pago',
      'fuerte-sin-clave:cliente',
      'identificador-sin-debil:raro',
      'jerarquia-con-clave:agente',
      'jerarquia-sin-subclases:j',
      'sin-cardinalidad:compra:venta',
      'vinculo-suelto:solo',
    ]);
    expect(por['sin-cardinalidad:compra:venta']).toEqual({ id: 'sin-cardinalidad:compra:venta', donde: 'compra', texto: 'A «compra» le falta la cardinalidad del lado de «venta».' });
    expect(por['fuerte-sin-clave:cliente'].texto).toBe('«cliente» no tiene identificador. Subrayá el atributo que la identifica.');
    expect(por['jerarquia-con-clave:agente'].texto).toBe('«agente» tiene clave propia. En una jerarquía, las subclases usan la de «persona».');
    expect(por['cf-en-der:v2'].donde).toBe('venta');
    expect(por['jerarquia-sin-subclases:j']).toMatchObject({ donde: 'j', texto: 'La jerarquía de «persona» necesita dos subclases o más.' });
    // `compra` has a missing cardinality: whether it's an N a M can't be told yet, so the aggregation waits.
    expect(por['agregacion-no-nm:g']).toBeUndefined();
  });

  it('una agregación sobre un 1 a N', () => {
    const d = der({
      entidades: [entidad('a', [at('a1', 'id', { clave: true })]), entidad('b', [at('b1', 'id', { clave: true })])],
      vinculos: [vinculo('ab', [['a', '1:1'], ['b', '0:N']])],
      agregaciones: [{ id: 'g', nombre: '', vinculo: 'ab' }],
    });
    expect(ids(d)).toEqual(['agregacion-no-nm:g']);
    expect(ids({ ...d, vinculos: [vinculo('ab', [['a', '0:M'], ['b', '0:N']])] })).toEqual([]);
  });

  it('nunca tira', () => {
    expect(revisarDer(null)).toEqual([]);
    expect(revisarDer({ v: 1, entidades: 'x' })).toEqual([]);
  });
});
