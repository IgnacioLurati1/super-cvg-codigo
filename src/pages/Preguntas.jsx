import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { CLIENTE_GOOGLE } from '../lib/google';
import { CAMPUS } from '../lib/moodle';
import { SITIO } from '../../sitio.config.js';
import { useDatosEstructurados, useSeo } from '../lib/seo';

// Each answer is plain text: it is also what Google reads (FAQPage). `enlace` adds a closing link on the page only.
const PREGUNTAS = [
  {
    pregunta: '¿Qué es Super CVG?',
    respuesta: 'Un panel para el CVG, el campus virtual de UTN FRRO. Junta en una pantalla las entregas, los archivos y las notas de todas tus materias.',
  },
  {
    pregunta: '¿Es oficial?',
    respuesta: 'No. Lo hace Luta Studios, sin relación con UTN. El campus sigue en frro.cvg.utn.edu.ar.',
    enlace: { a: CAMPUS, texto: 'Ir al campus' },
  },
  { pregunta: '¿Cuánto cuesta?', respuesta: 'Es gratis.' },
  {
    pregunta: '¿Cómo entro?',
    respuesta: `Con el mismo usuario y contraseña del campus.${CLIENTE_GOOGLE ? ' Si lo vinculaste con Google en Configuración, también con tu cuenta de Google.' : ''}`,
  },
  {
    pregunta: '¿Qué pasa con mi contraseña?',
    respuesta: 'Tu navegador la manda directo al campus y no se guarda en ningún lado.',
    enlace: { a: '/privacidad', texto: 'Tu privacidad' },
  },
  { pregunta: '¿Sirve para mi carrera?', respuesta: 'Sí, si tenés cuenta en el CVG de UTN FRRO. Los horarios están para todas las carreras.' },
  {
    pregunta: '¿Puedo entregar tareas desde acá?',
    respuesta: 'Sí. También inscribirte a una materia, mandar mensajes y responder en los foros. Antes de entregar o inscribirte, te pregunta. Los cuestionarios se hacen en el campus.',
  },
  {
    pregunta: '¿Qué más trae?',
    respuesta: `Tu horario, el calendario académico${CLIENTE_GOOGLE ? ' y tus cursos de Google Classroom' : ''}. Un laboratorio para programar en Python, C, SQL y JavaScript. Consultron, un asistente que responde con tus apuntes.`,
  },
  { pregunta: '¿Anda en el celu?', respuesta: 'Sí. Lo instalás desde el navegador como una app.' },
  { pregunta: '¿Anda sin internet?', respuesta: 'Si al entrar marcás «Seguir conectado», ves tus materias y los archivos que ya abriste.' },
];

// Title and description come from sitio.config.js, the same ones the build puts in the HTML.
const PAGINA = SITIO.publicas.find((p) => p.ruta === 'preguntas');

const FAQ = {
  '@type': 'FAQPage',
  mainEntity: PREGUNTAS.map((p) => ({
    '@type': 'Question',
    name: p.pregunta,
    acceptedAnswer: { '@type': 'Answer', text: p.respuesta },
  })),
};

function Enlace({ a, texto }) {
  if (a.startsWith('/')) return <Link to={a}>{texto}</Link>;
  return (
    <a href={a} target="_blank" rel="noreferrer">
      {texto}
      <span className="solo-lectores"> Se abre en otra pestaña.</span>
    </a>
  );
}

export default function Preguntas() {
  useSeo(PAGINA);
  useDatosEstructurados(FAQ);
  return (
    <article className="contenedor pagina texto-largo" aria-labelledby="preguntas-titulo">
      <h1 id="preguntas-titulo">Preguntas frecuentes</h1>
      {PREGUNTAS.map((p) => (
        <Fragment key={p.pregunta}>
          <h2>{p.pregunta}</h2>
          <p>
            {p.respuesta}
            {p.enlace && (
              <>
                {' '}
                <Enlace {...p.enlace} />
              </>
            )}
          </p>
        </Fragment>
      ))}
    </article>
  );
}
