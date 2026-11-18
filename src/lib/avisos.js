// Which campus notifications the student sees, in the bell and in Avisos of Hoy: by kind, in their own words. What
// they hide stays in mio.js (`avisosOcultos`, the keys of the kinds), goes to their Drive with the rest and never
// reaches the campus: nothing is marked as read there, and the bell asks the campus the same as always (useSinLeer.js).
// The kinds come from notificaciones.js (`tipo`); one it doesn't know goes with «Otros».
// Pure: no storage here, so mio.js can check what it keeps against this list.

export const GRUPOS_DE_AVISOS = [
  { clave: 'foros', nombre: 'Foros', texto: 'Mensajes nuevos y resúmenes de los foros.', tipos: ['foro', 'resumen'] },
  { clave: 'notas', nombre: 'Notas y devoluciones', tipos: ['devolucion', 'nota'] },
  { clave: 'contenido', nombre: 'Archivos y contenido nuevo', tipos: ['contenido'] },
  { clave: 'tareas', nombre: 'Entregas y vencimientos', texto: 'Tu entrega llegó, lo que vence y lo que abre o cierra.', tipos: ['entrega', 'vence', 'fecha'] },
  { clave: 'cuestionarios', nombre: 'Cuestionarios', tipos: ['cuestionario', 'intento'] },
  { clave: 'contactos', nombre: 'Pedidos de contacto', tipos: ['contacto'] },
  { clave: 'otros', nombre: 'Otros avisos del campus', tipos: ['otro'] },
];

const CLAVES = GRUPOS_DE_AVISOS.map((g) => g.clave);

export const esGrupoDeAviso = (clave) => CLAVES.includes(clave);

/** The kind of a notification as the student chooses it: the key of its group. */
export const grupoDeAviso = (tipo) => (GRUPOS_DE_AVISOS.find((g) => g.tipos.includes(tipo)) ?? GRUPOS_DE_AVISOS.at(-1)).clave;

/** Whether a notification (with its `tipo` and `materia`) shows. `ocultos`: a Set of the keys of the hidden groups.
 * `materiasFuera`: the numbers of the courses taken out of Hoy (hoy.js), whose notifications don't show either. */
export const seVeAviso = (n, ocultos, materiasFuera) =>
  (!ocultos?.size || !ocultos.has(grupoDeAviso(n?.tipo))) && !(materiasFuera?.size && materiasFuera.has(Number(n?.materia?.id)));
