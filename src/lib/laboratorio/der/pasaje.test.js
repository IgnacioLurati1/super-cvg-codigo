import { describe, expect, it } from 'vitest';
import { HOJA_IDIOMAS, IDIOMAS } from './idiomas.fixture';
import { HOJA_INSTRUMENTOS, INSTRUMENTOS } from './instrumentos.fixture';
import { pasarATablas, tablasEnTexto } from './pasaje';
import { porTabla } from './porTabla';

const sinDecisiones = (der) => ({ ...der, decisiones: { cp: {}, lado11: {}, tipos: {} } });
const ats = (de, ...nombres) => nombres.map((n) => ({ id: `${de}-${n.replace(/[*+]/g, '')}`, nombre: n.replace(/[*+]/g, ''), clave: n.endsWith('*'), multivaluado: n.endsWith('+'), derivado: false, partes: [] }));
const entidad = (id, atributos = [], debil = false) => ({ id, nombre: id, debil, x: 0, y: 0, atributos });
const vinculo = (id, puntas, atributos = [], identificador = false) => ({ id, nombre: id, identificador, x: 0, y: 0, atributos, puntas: puntas.map(([a, card, rol = '']) => ({ a, card, rol })) });
const der = (o) => ({ v: 1, entidades: [], vinculos: [], jerarquias: [], agregaciones: [], decisiones: { cp: {}, lado11: {}, tipos: {} }, ...o });

describe('el pasaje a tablas', () => {
  it('el alquiler de instrumentos con sus decisiones da su pasaje', () => {
    const r = pasarATablas(INSTRUMENTOS);
    expect(r.pendientes).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(porTabla(tablasEnTexto(r))).toEqual(porTabla(HOJA_INSTRUMENTOS));
    expect(r.tablas.every((t) => t.espera.length === 0)).toBe(true);
    // Each table comes after the ones it references.
    const vistas = new Set();
    for (const t of r.tablas) {
      for (const f of t.cfs) if (f.tabla !== t.nombre) expect(vistas.has(f.tabla)).toBe(true);
      vistas.add(t.nombre);
    }
  });

  it('las columnas de la CP y de las CF NN no admiten nulos; las de la subclase en la superclase, sí', () => {
    const { tablas } = pasarATablas(INSTRUMENTOS);
    const persona = tablas.find((t) => t.nombre === 'persona');
    expect(persona.columnas.filter((c) => !c.nula).map((c) => c.nombre)).toEqual(['id']);
    const solicitud = tablas.find((t) => t.nombre === 'alquiler');
    expect(solicitud.columnas.filter((c) => !c.nula).map((c) => c.nombre)).toEqual(['id', 'id_vendedor', 'id_instrumento', 'fecha_hora_desde', 'id_musico']);
    expect(solicitud.origen).toEqual({ tipo: 'entidad', id: 'alquiler' });
  });

  it('la escuela de idiomas: jerarquía a superclase, débiles en un N a M y una agregación que recibe una CF', () => {
    const r = pasarATablas(IDIOMAS);
    expect(r.pendientes).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(porTabla(tablasEnTexto(r))).toEqual(porTabla(HOJA_IDIOMAS));
  });

  it('sin decisiones, la CP de cada N a M y ternario con atributos queda para el alumno, sin opción por defecto', () => {
    const r = pasarATablas(sinDecisiones(INSTRUMENTOS));
    expect(r.pendientes.map((p) => [p.clave, p.tipo, p.tabla])).toEqual([
      ['cp:vendedor_a_cargo', 'cp', 'vendedor_a_cargo'],
      ['cp:reparacion', 'cp', 'reparación'],
      ['cp:especificacion_instrumento', 'cp', 'especificacion_instrumento'],
      ['cp:aval', 'cp', 'aval'],
    ]);
    // Any of the columns, the attributes too.
    expect(r.pendientes[0].opciones).toEqual(['id_vendedor', 'id_instrumento', 'fecha_hora_desde', 'fecha_hora_hasta']);
    expect(r.pendientes[3].opciones).toEqual(['id_tipo_aval', 'id_avalista', 'id_alquiler', 'fecha_alta', 'fecha_baja', 'estado']);
    expect(r.pendientes[0].vinculo).toBe('vendedor_a_cargo');
    // What references the aggregation waits for that CP; prueba's own CP comes once its columns are known.
    const espera = Object.fromEntries(r.tablas.filter((t) => t.espera.length).map((t) => [t.nombre, t.espera]));
    expect(espera).toEqual({ alquiler: ['cp:vendedor_a_cargo'], prueba: ['cp:vendedor_a_cargo'] });
    expect(r.tablas.find((t) => t.nombre === 'prueba').cfs[1]).toEqual({ columnas: null, tabla: 'vendedor_a_cargo', referidas: null, nn: true });
    expect(tablasEnTexto(r)).toContain('prueba(id_musico, fecha_hora_prueba)\nCP -> ?\nCF(id_musico) -> persona(id) NN\nCF(?) -> vendedor_a_cargo(?)');
    // Without attributes the CP is the keys, no question asked.
    expect(r.tablas.find((t) => t.nombre === 'consignatario_instrumento').cp).toEqual(['id_consignatario', 'id_instrumento']);

    const conAsignado = pasarATablas({ ...sinDecisiones(INSTRUMENTOS), decisiones: { cp: { vendedor_a_cargo: INSTRUMENTOS.decisiones.cp.vendedor_a_cargo }, lado11: {}, tipos: {} } });
    const prueba = conAsignado.pendientes.find((p) => p.clave === 'cp:prueba');
    expect(prueba.opciones).toEqual(['id_musico', 'id_vendedor', 'id_instrumento', 'fecha_hora_desde', 'fecha_hora_prueba']);
    expect(conAsignado.tablas.find((t) => t.nombre === 'alquiler').espera).toEqual([]);
  });

  it('una decisión con una columna que ya no está no cuenta', () => {
    const viejo = { ...INSTRUMENTOS, decisiones: { ...INSTRUMENTOS.decisiones, cp: { ...INSTRUMENTOS.decisiones.cp, aval: ['id_avalista', 'nro'] } } };
    expect(pasarATablas(viejo).pendientes.map((p) => p.clave)).toEqual(['cp:aval']);
  });

  it('1 a 1: el alumno elige el lado que actúa como N; la CF admite nulos si del otro lado el mínimo es 0', () => {
    const base = der({
      entidades: [entidad('empleado', ats('empleado', 'id*', 'nombre')), entidad('auto', ats('auto', 'patente*'))],
      vinculos: [vinculo('maneja', [['empleado', '0:1'], ['auto', '1:1']])],
    });
    const r = pasarATablas(base);
    expect(r.pendientes).toEqual([
      { clave: 'lado11:maneja', tipo: 'lado11', vinculo: 'maneja', nombre: 'maneja', tabla: null, opciones: [{ id: 'empleado', nombre: 'empleado' }, { id: 'auto', nombre: 'auto' }], texto: expect.any(String) },
    ]);
    expect(r.tablas.map((t) => t.espera)).toEqual([['lado11:maneja'], ['lado11:maneja']]);
    const enAuto = pasarATablas({ ...base, decisiones: { cp: {}, lado11: { maneja: 'auto' }, tipos: {} } });
    expect(tablasEnTexto(enAuto)).toBe('empleado(id, nombre)\nCP -> id\n\nauto(patente, id_empleado)\nCP -> patente\nCF(id_empleado) -> empleado(id) NULL\n');
    const enEmpleado = pasarATablas({ ...base, decisiones: { cp: {}, lado11: { maneja: 'empleado' }, tipos: {} } });
    expect(tablasEnTexto(enEmpleado)).toContain('empleado(id, nombre, patente)\nCP -> id\nCF(patente) -> auto(patente) NN');
  });

  // The TP of a user test: «Cada alquiler lo gestiona un empleado». As the course's sheets write it (in the invented
  // cases, musico_alquiler and aula_tipo), the cardinality next to an entity says how many of it go with one
  // of the other: `1:1` next to empleado, `0:N` next to the aggregation, and the CF goes to the N side, alquila.
  const inmobiliaria = (gestiona, decisiones = { cp: { alquila: ['dni', 'codigo', 'fecha_inicio'] }, lado11: {}, tipos: {} }) => der({
    entidades: [
      entidad('propiedad', ats('propiedad', 'codigo*', 'direccion', 'ambientes')),
      entidad('cliente', ats('cliente', 'dni*', 'nombre', 'telefonos+')),
      entidad('empleado', ats('empleado', 'legajo*', 'nombre')),
      entidad('casa', ats('casa', 'patio')),
      entidad('departamento', ats('departamento', 'piso')),
    ],
    vinculos: [vinculo('alquila', [['cliente', '0:M'], ['propiedad', '0:N']], ats('alquila', 'fecha_inicio', 'precio')), vinculo('gestiona', gestiona)],
    agregaciones: [{ id: 'alquiler', nombre: 'alquiler', vinculo: 'alquila' }],
    jerarquias: [{ id: 'j', x: 0, y: 0, superclase: 'propiedad', subclases: ['casa', 'departamento'], tipo: 'D', total: true, pasaje: 'superclase' }],
    decisiones,
  });

  it('el TP de la inmobiliaria: la CF del empleado va en alquila, como en la hoja de la cátedra', () => {
    const r = pasarATablas(inmobiliaria([['empleado', '1:1'], ['alquiler', '0:N']]));
    expect(r.pendientes).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(tablasEnTexto(r)).toBe(
      'propiedad(codigo, direccion, ambientes, patio, piso)\nCP -> codigo\n\n' +
        'cliente(dni, nombre)\nCP -> dni\n\n' +
        'cliente_telefonos(dni, telefonos)\nCP -> dni, telefonos\nCF(dni) -> cliente(dni) NN\n\n' +
        'empleado(legajo, nombre)\nCP -> legajo\n\n' +
        'alquila(dni, codigo, fecha_inicio, precio, legajo)\nCP -> dni, codigo, fecha_inicio\nCF(dni) -> cliente(dni) NN\nCF(codigo) -> propiedad(codigo) NN\nCF(legajo) -> empleado(legajo) NN\n',
    );
    // Before the CP of alquila is chosen, it is the one thing missing, and empleado doesn't wait for it.
    const sinCp = pasarATablas(inmobiliaria([['empleado', '1:1'], ['alquiler', '0:N']], { cp: {}, lado11: {}, tipos: {} }));
    expect(sinCp.pendientes.map((p) => p.clave)).toEqual(['cp:alquila']);
    expect(sinCp.tablas.find((t) => t.nombre === 'empleado').espera).toEqual([]);
  });

  it('la misma regla con una entidad y con una agregación: la cardinalidad leída al revés lleva la CF al empleado', () => {
    // What the student drew first, `0:N` next to empleado and `1:1` next to the aggregation, says «each alquiler goes
    // with none or many empleados»: the CF goes to empleado. The panel reads it back to him (lecturaDePunta).
    const alReves = tablasEnTexto(pasarATablas(inmobiliaria([['empleado', '0:N'], ['alquiler', '1:1']])));
    expect(alReves).toContain('empleado(legajo, nombre, dni, codigo, fecha_inicio)\nCP -> legajo\nCF(dni, codigo, fecha_inicio) -> alquila(dni, codigo, fecha_inicio) NN');
    expect(alReves).toContain('alquila(dni, codigo, fecha_inicio, precio)\n');
    // An entity in place of the aggregation goes the same way.
    const conEntidad = (puntas) => tablasEnTexto(pasarATablas(der({ entidades: [entidad('empleado', ats('empleado', 'legajo*')), entidad('contrato', ats('contrato', 'nro*'))], vinculos: [vinculo('gestiona', puntas)] })));
    expect(conEntidad([['empleado', '1:1'], ['contrato', '0:N']])).toBe('empleado(legajo)\nCP -> legajo\n\ncontrato(nro, legajo)\nCP -> nro\nCF(legajo) -> empleado(legajo) NN\n');
    expect(conEntidad([['empleado', '0:N'], ['contrato', '1:1']])).toBe('contrato(nro)\nCP -> nro\n\nempleado(legajo, nro)\nCP -> legajo\nCF(nro) -> contrato(nro) NN\n');
  });

  it('recursivo 1 a N: CF a la misma tabla con el nombre del rol; N a M: tabla con dos CF', () => {
    const r = pasarATablas(der({ entidades: [entidad('empleado', ats('empleado', 'id*', 'nombre'))], vinculos: [vinculo('jefe_de', [['empleado', '0:1', 'jefe'], ['empleado', '0:N', 'empleado']])] }));
    expect(tablasEnTexto(r)).toBe('empleado(id, nombre, id_jefe)\nCP -> id\nCF(id_jefe) -> empleado(id) NULL\n');
    const nm = pasarATablas(der({ entidades: [entidad('materia', ats('materia', 'id*'))], vinculos: [vinculo('correlativa', [['materia', '0:N'], ['materia', '0:M']])] }));
    expect(tablasEnTexto(nm)).toContain('correlativa(id_materia, id_materia_2)\nCP -> id_materia, id_materia_2');
    expect(nm.avisos.map((a) => a.id)).toEqual(['repetida:correlativa:id_materia']);
  });

  it('una jerarquía completa o a subclases', () => {
    const jerarquia = (pasaje) =>
      der({
        entidades: [entidad('persona', ats('persona', 'id*', 'nombre')), entidad('agente', ats('agente', 'matricula')), entidad('cliente'), entidad('propiedad', ats('propiedad', 'id*'))],
        vinculos: [vinculo('asignada', [['agente', '1:1'], ['propiedad', '0:N']])],
        jerarquias: [{ id: 'j', x: 0, y: 0, superclase: 'persona', subclases: ['agente', 'cliente'], tipo: 'S', total: false, pasaje }],
      });
    expect(tablasEnTexto(pasarATablas(jerarquia('completa')))).toBe(
      'persona(id, nombre)\nCP -> id\n\nagente(id, matricula)\nCP -> id\nCF(id) -> persona(id) NN\n\ncliente(id)\nCP -> id\nCF(id) -> persona(id) NN\n\npropiedad(id, id_agente)\nCP -> id\nCF(id_agente) -> agente(id) NN\n',
    );
    const subclases = pasarATablas(jerarquia('subclases'));
    expect(tablasEnTexto(subclases)).toBe('agente(id, nombre, matricula)\nCP -> id\n\ncliente(id, nombre)\nCP -> id\n\npropiedad(id, id_agente)\nCP -> id\nCF(id_agente) -> agente(id) NN\n');
    expect(subclases.avisos).toEqual([]);
  });

  it('a subclases, un vínculo con la superclase no tiene a qué tabla ir', () => {
    const r = pasarATablas(
      der({
        entidades: [entidad('persona', ats('persona', 'id*')), entidad('agente'), entidad('nota', ats('nota', 'id*'))],
        vinculos: [vinculo('escribe', [['persona', '1:1'], ['nota', '0:N']])],
        jerarquias: [{ id: 'j', x: 0, y: 0, superclase: 'persona', subclases: ['agente'], tipo: 'D', total: true, pasaje: 'subclases' }],
      }),
    );
    expect(r.avisos.map((a) => a.id)).toEqual(['sin-tabla:persona']);
    expect(r.tablas.map((t) => t.nombre)).toEqual(['agente', 'nota']);
  });

  it('un atributo multivaluado es una tabla con la clave de la entidad y el atributo', () => {
    const r = pasarATablas(der({ entidades: [entidad('persona', ats('persona', 'id*', 'nombre', 'telefono+'))] }));
    expect(tablasEnTexto(r)).toBe('persona(id, nombre)\nCP -> id\n\npersona_telefono(id_persona, telefono)\nCP -> id_persona, telefono\nCF(id_persona) -> persona(id) NN\n');
    expect(r.tablas[1].origen).toEqual({ tipo: 'multivaluado', id: 'persona-telefono' });
  });

  it('un atributo compuesto pasa como sus partes', () => {
    const domicilio = { id: 'dom', nombre: 'domicilio', clave: false, multivaluado: false, derivado: false, partes: ats('dom', 'calle', 'numero') };
    const r = pasarATablas(der({ entidades: [entidad('cliente', [...ats('cliente', 'dni*'), domicilio])] }));
    expect(tablasEnTexto(r)).toBe('cliente(dni, calle, numero)\nCP -> dni\n');
  });

  it('lo que no se puede pasar queda en avisos, sin romper el resto', () => {
    const r = pasarATablas(
      der({
        entidades: [entidad('sinclave', ats('sinclave', 'nombre')), entidad('otra', ats('otra', 'id*')), entidad('suelta', ats('suelta', 'nro*'), true)],
        vinculos: [vinculo('tiene', [['sinclave', '1:1'], ['otra', '0:N']]), vinculo('sincard', [['otra', ''], ['sinclave', '1:1']]), vinculo('solo', [['otra', '1:1']])],
        agregaciones: [{ id: 'g', nombre: 'mala', vinculo: 'tiene' }],
      }),
    );
    expect(r.avisos.map((a) => a.id).sort()).toEqual(['debil-suelta:suelta', 'sin-clave:e:sinclave', 'sincard:sincard', 'suelto:solo']);
    expect(r.tablas.map((t) => [t.nombre, t.cp])).toEqual([['sinclave', null], ['otra', ['id']], ['suelta', null]]);
    // An aggregation over a 1 a N has no table: what points to it says so.
    const g = pasarATablas(der({ ...r, entidades: [entidad('a', ats('a', 'id*')), entidad('b', ats('b', 'id*')), entidad('c', ats('c', 'id*'))], vinculos: [vinculo('ab', [['a', '1:1'], ['b', '0:N']]), vinculo('gc', [['g', '0:N'], ['c', '1:1']])], agregaciones: [{ id: 'g', nombre: '', vinculo: 'ab' }] }));
    expect(g.avisos.map((a) => a.id)).toEqual(['sin-tabla:g']);
  });

  it('nunca tira, con cualquier cosa', () => {
    expect(pasarATablas(null)).toEqual({ tablas: [], pendientes: [], avisos: [], faltan: [] });
    expect(tablasEnTexto(null)).toBe('\n');
    // Hierarchies in a circle.
    const circulo = der({
      entidades: [entidad('a', ats('a', 'id*')), entidad('b', ats('b', 'id*'))],
      jerarquias: [{ id: 'j1', x: 0, y: 0, superclase: 'a', subclases: ['b'], tipo: 'D', total: false, pasaje: 'superclase' }, { id: 'j2', x: 0, y: 0, superclase: 'b', subclases: ['a'], tipo: 'D', total: false, pasaje: 'superclase' }],
    });
    expect(() => pasarATablas(circulo)).not.toThrow();
    // Random DERs: entities, vínculos, aggregations, hierarchies and decisions pointing anywhere.
    let semilla = 7;
    const azar = (n) => {
      semilla = (semilla * 16807) % 2147483647;
      return semilla % n;
    };
    const cards = ['0:N', '1:1', '0:1', '1:M', '', '1:N'];
    for (let vuelta = 0; vuelta < 300; vuelta++) {
      const ne = 1 + azar(6);
      const ids = [...Array(ne)].map((_, i) => `e${i}`);
      const vs = [...Array(azar(7))].map((_, i) => vinculo(`v${i}`, [...Array(1 + azar(3))].map(() => [azar(4) ? ids[azar(ne)] : `g${azar(2)}`, cards[azar(cards.length)], azar(3) ? '' : 'rol']), azar(2) ? ats(`v${i}`, 'dato') : [], !azar(4)));
      const d = der({
        entidades: ids.map((id) => entidad(id, azar(4) ? ats(id, 'id*', 'x') : ats(id, 'x'), !azar(4))),
        vinculos: vs,
        agregaciones: vs.length ? [{ id: 'g0', nombre: '', vinculo: `v${azar(vs.length)}` }, { id: 'g1', nombre: 'g', vinculo: `v${azar(vs.length)}` }] : [],
        jerarquias: [{ id: 'j', x: 0, y: 0, superclase: ids[azar(ne)], subclases: [ids[azar(ne)], ids[azar(ne)]], tipo: 'S', total: false, pasaje: ['superclase', 'completa', 'subclases'][azar(3)] }],
        decisiones: { cp: { v0: ['id_e0', 'dato'] }, lado11: { v1: 'e1' }, tipos: {} },
      });
      const r = pasarATablas(d);
      expect(typeof tablasEnTexto(r)).toBe('string');
    }
  });
});
