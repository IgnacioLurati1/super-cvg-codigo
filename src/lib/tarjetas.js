// How a course looks in Materias (Materias.jsx, materias.css): the symbol in its box next to the name (as it came), the
// whole card in its color, a stripe of color on its side, the symbol big on top, the symbol as a stamp behind the
// name, or the name alone. One for every course on this device (ajustes.js, `tarjeta`), and one of its own for a course
// that wants it (mio.js, `tarjeta`, travels with the student's data).
export const ESTILOS_DE_TARJETA = ['simbolo', 'tenida', 'franja', 'portada', 'sello', 'minima'];

export const NOMBRES_DE_TARJETA = {
  simbolo: 'Con símbolo',
  tenida: 'Teñida',
  franja: 'Franja',
  portada: 'Portada',
  sello: 'Sello',
  minima: 'Mínima',
};

export const esEstiloDeTarjeta = (estilo) => ESTILOS_DE_TARJETA.includes(estilo);

// Where a course is in Materias: up with the pinned ones, or away with the archived ones. Neither, in its group.
export const LUGARES_EN_MATERIAS = ['fijada', 'archivada'];
