// Sample Classroom for `/?demo=1` in `npm run dev`. Only loaded in development: production never ships it.
const hace = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();
const drive = (id, title) => ({ driveFile: { driveFile: { id, title, alternateLink: `https://drive.google.com/file/d/${id}/view` } } });
const carpeta = (id, title) => ({ driveFile: { driveFile: { id, title, alternateLink: `https://drive.google.com/drive/folders/${id}` } } });

const CURSOS = [
  { id: '700000000001', name: 'Análisis Matemático II', section: '2K3', alternateLink: 'https://classroom.google.com/c/NzAw1', courseState: 'ACTIVE' },
  { id: '700000000002', name: 'Sistemas Operativos 2026', section: 'Comisión 3K2', alternateLink: 'https://classroom.google.com/c/NzAw2', courseState: 'ACTIVE' },
];

const CONTENIDO = {
  topic: [
    { topicId: '800000000001', name: 'Unidad 1: funciones de varias variables' },
    { topicId: '800000000002', name: 'Unidad 2: derivadas parciales' },
  ],
  courseWorkMaterial: [
    { id: '1', title: 'Apuntes de la unidad 1', topicId: '800000000001', state: 'PUBLISHED', updateTime: hace(20), alternateLink: 'https://classroom.google.com/c/NzAw1/m/1', materials: [drive('a1', 'Teoría U1.pdf'), drive('a2', 'Práctica U1.pdf')] },
    { id: '2', title: 'Clase grabada', topicId: '800000000002', state: 'PUBLISHED', updateTime: hace(6), alternateLink: 'https://classroom.google.com/c/NzAw1/m/2', materials: [{ youtubeVideo: { id: 'x', title: 'Derivadas parciales, clase 4', alternateLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }] },
    { id: '3', title: 'Programa de la materia', state: 'PUBLISHED', updateTime: hace(40), alternateLink: 'https://classroom.google.com/c/NzAw1/m/3', materials: [] },
    { id: '6', title: 'Bibliografía', topicId: '800000000001', state: 'PUBLISHED', updateTime: hace(25), alternateLink: 'https://classroom.google.com/c/NzAw1/m/6', materials: [carpeta('c1', 'Bibliografía de la unidad 1')] },
  ],
  courseWork: [
    { id: '4', title: 'TP 2: derivadas', topicId: '800000000002', state: 'PUBLISHED', updateTime: hace(3), alternateLink: 'https://classroom.google.com/c/NzAw1/a/4', dueDate: { year: 2026, month: 11, day: 20 }, dueTime: { hours: 23, minutes: 59 }, materials: [drive('a3', 'Consigna TP 2.pdf')] },
  ],
  announcements: [
    { id: '5', text: 'Les dejo el cronograma', state: 'PUBLISHED', updateTime: hace(1), alternateLink: 'https://classroom.google.com/c/NzAw1/p/5', materials: [{ link: { url: 'https://docs.google.com/spreadsheets/d/cronograma', title: 'Cronograma 2026' } }] },
    { id: '7', text: 'Subí las resoluciones de la práctica 1 a esta carpeta.\nSi encuentran un error, avísenme por acá.', state: 'PUBLISHED', updateTime: hace(4), alternateLink: 'https://classroom.google.com/c/NzAw1/p/7', materials: [carpeta('c2', 'Resoluciones de la práctica 1'), { form: { formUrl: 'https://docs.google.com/forms/d/e/encuesta/viewform', title: 'Encuesta de mitad de cuatrimestre' } }] },
    { id: '8', text: 'El jueves 12 no hay clase por el congreso. Recuperamos el sábado a las 9 en el aula 305.', state: 'PUBLISHED', updateTime: hace(9), alternateLink: 'https://classroom.google.com/c/NzAw1/p/8' },
    // A long stream, to see how it shows only the first messages.
    ...Array.from({ length: 12 }, (_, k) => ({ id: String(20 + k), text: `Aviso ${k + 1} de ejemplo`, state: 'PUBLISHED', updateTime: hace(12 + k), alternateLink: `https://classroom.google.com/c/NzAw1/p/${20 + k}` })),
  ],
};

export function responderClassroom(ruta) {
  if (ruta === 'courses') return { courses: CURSOS };
  const [, , parte] = ruta.split('/');
  const campo = { topics: 'topic', courseWorkMaterials: 'courseWorkMaterial', courseWork: 'courseWork', announcements: 'announcements' }[parte];
  return { [campo]: CONTENIDO[campo] ?? [] };
}
