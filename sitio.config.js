import { CALCULADORAS } from './src/lib/calculadoras/lista.js';

// Los datos del sitio que usan la build (cabeceras, sitemap, robots) y `npm run check`.
// `publicas`: cada pantalla pública con su título y descripción, los que se ven al pegar el link y en Google.
// `dinamicas`: las páginas que salen de la base, como un producto. Sin esto, GitHub Pages las responde con 404 y Google no
// las indexa, aunque se vean bien. Lee con la clave pública, así que solo ve lo que ve un visitante. Por ejemplo:
//   dinamicas: async (consultar) => (await consultar('productos?select=slug,nombre,resumen&publicado=eq.true')).map((p) => (
//     { ruta: `productos/${p.slug}`, titulo: `${p.nombre} | Super CVG`, descripcion: p.resumen })),
// `privadas`: las que no van a buscadores (panel, cuentas). No se nombran en ningún Disallow.
export const SITIO = {
  nombre: 'Super CVG',
  descripcion: 'Tus entregas, archivos y notas del campus de UTN FRRO en una sola pantalla. Herramienta no oficial.',
  // La dirección pública, sin barra final. Sin ella no sale el sitemap y el deploy frena.
  url: 'https://supercvg.lutastudios.com',
  // La imagen de cuando se pega el link (1200×630, en public/).
  imagen: 'og.png',
  idioma: 'es-AR',
  // El cliente OAuth de Super CVG en Google Cloud, para Classroom (es público). Vacío: Classroom no aparece en ningún lado.
  // `npm run test:flujos` compila con uno de prueba (.env.flujos).
  google: '683844331658-7b9btu8ce1bhnlc7ffcka2htdq57e3b1.apps.googleusercontent.com',
  publicas: [
    { ruta: '', titulo: 'Super CVG', descripcion: 'Tus entregas, archivos y notas del campus de UTN FRRO en una sola pantalla. Herramienta no oficial.' },
    { ruta: 'privacidad', titulo: 'Tu privacidad | Super CVG', descripcion: 'Qué pasa con tu contraseña y tus datos del campus cuando usás este sitio.' },
    { ruta: 'novedades', titulo: 'Notas del parche | Super CVG', descripcion: 'Qué cambió en Super CVG, fecha por fecha.' },
    { ruta: 'opinar', titulo: 'Opinar | Super CVG', descripcion: 'Contanos qué le falta a Super CVG, qué no anda o qué te gusta.' },
    { ruta: 'entrada', titulo: 'La facu en 3D | Super CVG', descripcion: 'La entrada de UTN FRRO en 3D, para mirarla desde donde quieras.' },
  ],
  privadas: ['calendario', 'horario', 'horario/compartido', 'materias', 'inscripcion', 'buscar', 'notas', 'sysacad', 'carrera', 'resumenes', 'configuracion', 'mensajes', 'compartido', 'archivo', 'propias', 'laboratorio', 'calculadoras', 'repaso', 'en-vivo', ...CALCULADORAS.map((c) => `calculadoras/${c.slug}`)],
};
