// An invented case for the tests: an instrument rental. A hierarchy passed to its superclass, an aggregation over an
// N a M with attributes that gets a CF and joins another N a M, weak entities, a ternary and N a M with and without
// attributes. Its DER with the student's decisions, and the pasaje it has to give.

// Attributes: a name with `*` is the key.
const ats = (de, ...nombres) =>
  nombres.map((n) => ({ id: `${de}-${n.replace('*', '')}`, nombre: n.replace('*', ''), clave: n.endsWith('*'), multivaluado: false, derivado: false, partes: [] }));
const entidad = (id, x, y, atributos = [], debil = false) => ({ id, nombre: id, debil, x, y, atributos });
const punta = (a, card, rol = '') => ({ a, card, rol });
const vinculo = (id, x, y, puntas, atributos = [], identificador = false, nombre = id) => ({ id, nombre, identificador, x, y, atributos, puntas });

export const INSTRUMENTOS = {
  v: 1,
  entidades: [
    entidad('tipo_reparacion', 1030, 440, ats('tipo_reparacion', 'id*', 'nombre')),
    entidad('tipo_aval', 60, 175, ats('tipo_aval', 'id*', 'nombre')),
    entidad('especificacion', 775, 265, ats('especificacion', 'id*', 'nombre', 'categoria')),
    entidad('persona', 535, 55, ats('persona', 'id*', 'tipo_doc', 'nro_doc', 'nombre', 'apellido', 'direccion_postal', 'telefono', 'email')),
    entidad('musico', 290, 275),
    entidad('vendedor', 535, 525, ats('vendedor', 'cuit', 'legajo')),
    entidad('consignatario', 910, 230),
    entidad('avalista', 295, 175),
    entidad('instrumento', 845, 525, ats('instrumento', 'id*', 'marca', 'numero_serie', 'anio_fabricacion', 'categoria', 'deposito', 'condicion')),
    entidad('tarifa', 680, 640, ats('tarifa', 'fecha_hora_desde*', 'precio_diario'), true),
    entidad('alquiler', 240, 530, ats('alquiler', 'id*', 'fecha_pedido', 'importe_semanal', 'path_archivo_recibo', 'estado', 'nro', 'fecha_retiro')),
    entidad('cuota', 65, 460, ats('cuota', 'fecha_hora_cobro*', 'monto', 'medio'), true),
  ],
  vinculos: [
    vinculo('vendedor_a_cargo', 670, 525, [punta('vendedor', '0:M'), punta('instrumento', '0:N')], ats('vendedor_a_cargo', 'fecha_hora_desde', 'fecha_hora_hasta')),
    vinculo('reparacion', 1025, 510, [punta('instrumento', '0:N'), punta('tipo_reparacion', '0:M')], ats('reparacion', 'cantidad', 'costo'), false, 'reparación'),
    vinculo('alquiler_ofrecido', 385, 510, [punta('alquiler', '0:N'), punta('a_cargo', '1:1')]),
    vinculo('musico_alquiler', 240, 385, [punta('musico', '1:1'), punta('alquiler', '0:N')]),
    vinculo('cuota_alquiler', 65, 525, [punta('cuota', '0:N'), punta('alquiler', '1:1')], [], true, ''),
    // The sheet doesn't write the cardinality next to instrumento: a weak entity's owner is always 1:1.
    vinculo('tarifa_instrumento', 775, 635, [punta('tarifa', '0:N'), punta('instrumento', '1:1')], [], true, ''),
    vinculo('prueba', 335, 345, [punta('musico', '0:M'), punta('a_cargo', '0:N')], ats('prueba', 'fecha_hora_prueba')),
    vinculo('especificacion_instrumento', 775, 320, [punta('especificacion', '1:N'), punta('instrumento', '0:M')], ats('especificacion_instrumento', 'dato')),
    vinculo('consignatario_instrumento', 910, 290, [punta('consignatario', '1:M'), punta('instrumento', '0:N')]),
    vinculo('aval', 175, 175, [punta('tipo_aval', '1:1'), punta('avalista', '1:N'), punta('alquiler', '1:L')], ats('aval', 'fecha_alta', 'fecha_baja', 'estado')),
  ],
  jerarquias: [{ id: 'personas', x: 535, y: 125, superclase: 'persona', subclases: ['musico', 'vendedor', 'consignatario', 'avalista'], tipo: 'S', total: true, pasaje: 'superclase' }],
  agregaciones: [{ id: 'a_cargo', nombre: '', vinculo: 'vendedor_a_cargo' }],
  decisiones: {
    cp: {
      vendedor_a_cargo: ['id_vendedor', 'id_instrumento', 'fecha_hora_desde'],
      prueba: ['id_musico', 'fecha_hora_prueba'],
      especificacion_instrumento: ['id_especificacion', 'id_instrumento'],
      reparacion: ['id_instrumento', 'id_tipo_reparacion'],
      aval: ['id_avalista', 'id_alquiler'],
    },
    lado11: {},
    tipos: {},
  },
};

export const HOJA_INSTRUMENTOS = `tipo_reparacion(id, nombre)
CP -> id

tipo_aval(id, nombre)
CP -> id

especificacion(id, nombre, categoria)
CP -> id

persona(id, tipo_doc, nro_doc, nombre, apellido, direccion_postal, telefono, email, cuit, legajo)
CP -> id

instrumento(id, marca, numero_serie, anio_fabricacion, categoria, deposito, condicion)
CP -> id

tarifa(id_instrumento, fecha_hora_desde, precio_diario)
CP -> id_instrumento, fecha_hora_desde
CF(id_instrumento) -> instrumento(id) NN

vendedor_a_cargo(id_vendedor, id_instrumento, fecha_hora_desde, fecha_hora_hasta)
CP -> id_vendedor, id_instrumento, fecha_hora_desde
CF(id_instrumento) -> instrumento(id) NN
CF(id_vendedor) -> persona(id) NN

reparación(id_instrumento, id_tipo_reparacion, cantidad, costo)
CP -> id_instrumento, id_tipo_reparacion
CF(id_instrumento) -> instrumento(id) NN
CF(id_tipo_reparacion) -> tipo_reparacion(id) NN

alquiler(id, fecha_pedido, importe_semanal, path_archivo_recibo, estado, nro, fecha_retiro, id_vendedor, id_instrumento, fecha_hora_desde, id_musico)
CP -> id
CF(id_vendedor, id_instrumento, fecha_hora_desde) -> vendedor_a_cargo(id_vendedor, id_instrumento, fecha_hora_desde) NN
CF(id_musico) -> persona(id) NN

cuota(id_alquiler, fecha_hora_cobro, monto, medio)
CP -> id_alquiler, fecha_hora_cobro
CF(id_alquiler) -> alquiler(id) NN

prueba(id_musico, id_vendedor, id_instrumento, fecha_hora_desde, fecha_hora_prueba)
CP -> id_musico, fecha_hora_prueba
CF(id_musico) -> persona(id) NN
CF(id_vendedor, id_instrumento, fecha_hora_desde) -> vendedor_a_cargo(id_vendedor, id_instrumento, fecha_hora_desde) NN

especificacion_instrumento(id_especificacion, id_instrumento, dato)
CP -> id_especificacion, id_instrumento
CF(id_especificacion) -> especificacion(id) NN
CF(id_instrumento) -> instrumento(id) NN

consignatario_instrumento(id_consignatario, id_instrumento)
CP -> id_consignatario, id_instrumento
CF(id_instrumento) -> instrumento(id) NN
CF(id_consignatario) -> persona(id) NN

aval(id_tipo_aval, id_avalista, id_alquiler, fecha_alta, fecha_baja, estado)
CP -> id_avalista, id_alquiler
CF(id_avalista) -> persona(id) NN
CF(id_tipo_aval) -> tipo_aval(id) NN
CF(id_alquiler) -> alquiler(id) NN
`;
