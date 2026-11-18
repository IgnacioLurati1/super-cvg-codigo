// A second invented case: a language school. A hierarchy passed to its superclass with a subclass in a 1 a N, weak
// entities (one of them in two N a M with its composite key) and an aggregation that gets a CF from a 1 a N.

const ats = (de, ...nombres) =>
  nombres.map((n) => ({ id: `${de}-${n.replace('*', '')}`, nombre: n.replace('*', ''), clave: n.endsWith('*'), multivaluado: false, derivado: false, partes: [] }));
const entidad = (id, atributos = [], debil = false, nombre = id) => ({ id, nombre, debil, x: 0, y: 0, atributos });
const punta = (a, card) => ({ a, card, rol: '' });
const vinculo = (id, puntas, atributos = [], identificador = false) => ({ id, nombre: identificador ? '' : id, identificador, x: 0, y: 0, atributos, puntas });

export const IDIOMAS = {
  v: 1,
  entidades: [
    entidad('tipo_curso', ats('tipo_curso', 'id*', 'nombre', 'descripcion', 'requisitos')),
    entidad('curso', ats('curso', 'id*', 'nombre', 'duracion_semanas', 'temario')),
    entidad('comision', ats('comision', 'fecha_comienzo*', 'arancel', 'recargo_alumno', 'cupo'), true),
    entidad('tipo_aula', ats('tipo_aula', 'id*', 'nombre')),
    entidad('espacio', ats('espacio', 'id*', 'capacidad', 'accesible', 'piso', 'nro')),
    entidad('salon', ats('salon', 'cant_mesas'), false, 'salón'),
    entidad('aula', ats('aula', 'metros_cuadrados')),
    entidad('tarifa_espacio', ats('tarifa_espacio', 'fecha_desde*', 'valor_hora'), true),
    entidad('arreglo', ats('arreglo', 'fecha_inicio*', 'fecha_fin_planificada', 'fecha_fin_real', 'motivo'), true),
    entidad('alumno', ats('alumno', 'id*', 'tipo_doc', 'nro_doc', 'fecha_nac', 'nombre', 'apellido', 'telefono')),
    entidad('empresa', ats('empresa', 'id*', 'nombre', 'email', 'condicion_iva', 'cuit')),
    entidad('inscripcion', ats('inscripcion', 'id*', 'fecha_inicio', 'fecha_fin', 'importe', 'fecha_pago')),
  ],
  vinculos: [
    vinculo('curso_tipo_curso', [punta('tipo_curso', '1:1'), punta('curso', '0:N')]),
    vinculo('comision_curso', [punta('curso', '1:1'), punta('comision', '0:N')], [], true),
    vinculo('aula_tipo', [punta('aula', '0:N'), punta('tipo_aula', '1:1')]),
    vinculo('tarifa_de_espacio', [punta('espacio', '1:1'), punta('tarifa_espacio', '0:N')], [], true),
    vinculo('arreglo_de_espacio', [punta('arreglo', '0:N'), punta('espacio', '1:1')], [], true),
    vinculo('contrata', [punta('empresa', '1:1'), punta('inscripcion', '0:N')]),
    vinculo('comision_inscripcion', [punta('comision', '0:N'), punta('inscripcion', '0:N')]),
    vinculo('inscripcion_alumno', [punta('inscripcion', '1:M'), punta('alumno', '1:N')]),
    vinculo('ubicacion', [punta('inscripciones_alumnos', '0:N'), punta('espacio', '1:1')]),
    vinculo('comision_inscripcion_alumno', [punta('comision', '0:M'), punta('inscripciones_alumnos', '0:N')], ats('cia', 'fecha_reserva', 'importe')),
  ],
  jerarquias: [{ id: 'espacios', x: 0, y: 0, superclase: 'espacio', subclases: ['salon', 'aula'], tipo: 'D', total: true, pasaje: 'superclase' }],
  agregaciones: [{ id: 'inscripciones_alumnos', nombre: '', vinculo: 'inscripcion_alumno' }],
  decisiones: { cp: { comision_inscripcion_alumno: ['id_curso', 'fecha_comienzo', 'id_inscripcion', 'id_alumno'] }, lado11: {}, tipos: {} },
};

export const HOJA_IDIOMAS = `tipo_curso(id, nombre, descripcion, requisitos)
CP -> id

curso(id, nombre, duracion_semanas, temario, id_tipo_curso)
CP -> id
CF(id_tipo_curso) -> tipo_curso(id) NN

comision(id_curso, fecha_comienzo, arancel, recargo_alumno, cupo)
CP -> id_curso, fecha_comienzo
CF(id_curso) -> curso(id) NN

tipo_aula(id, nombre)
CP -> id

espacio(id, capacidad, accesible, piso, nro, cant_mesas, metros_cuadrados, id_tipo_aula)
CP -> id
CF(id_tipo_aula) -> tipo_aula(id) NULL

tarifa_espacio(id_espacio, fecha_desde, valor_hora)
CP -> id_espacio, fecha_desde
CF(id_espacio) -> espacio(id) NN

arreglo(id_espacio, fecha_inicio, fecha_fin_planificada, fecha_fin_real, motivo)
CP -> id_espacio, fecha_inicio
CF(id_espacio) -> espacio(id) NN

alumno(id, tipo_doc, nro_doc, fecha_nac, nombre, apellido, telefono)
CP -> id

empresa(id, nombre, email, condicion_iva, cuit)
CP -> id

inscripcion(id, fecha_inicio, fecha_fin, importe, fecha_pago, id_empresa)
CP -> id
CF(id_empresa) -> empresa(id) NN

comision_inscripcion(id_curso, fecha_comienzo, id_inscripcion)
CP -> id_curso, fecha_comienzo, id_inscripcion
CF(id_curso, fecha_comienzo) -> comision(id_curso, fecha_comienzo) NN
CF(id_inscripcion) -> inscripcion(id) NN

inscripcion_alumno(id_inscripcion, id_alumno, id_espacio)
CP -> id_inscripcion, id_alumno
CF(id_inscripcion) -> inscripcion(id) NN
CF(id_alumno) -> alumno(id) NN
CF(id_espacio) -> espacio(id) NN

comision_inscripcion_alumno(id_curso, fecha_comienzo, id_inscripcion, id_alumno, fecha_reserva, importe)
CP -> id_curso, fecha_comienzo, id_inscripcion, id_alumno
CF(id_curso, fecha_comienzo) -> comision(id_curso, fecha_comienzo) NN
CF(id_inscripcion, id_alumno) -> inscripcion_alumno(id_inscripcion, id_alumno) NN
`;
