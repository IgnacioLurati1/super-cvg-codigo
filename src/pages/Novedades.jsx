import { NOVEDADES } from '../data/novedades';
import { useSeo, tituloDe } from '../lib/seo';

const TIPOS = { nuevo: 'Nuevo', mejora: 'Mejora' };
// Noon, so the day never moves with the time zone.
const fechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

/** An update as the page shows it. The older ones (`cambios`, [kind, text]) read the same way: what's new and improved
 * first, the fixes apart. */
export function partesDe(n) {
  if (!n.cambios) return { funciones: n.funciones ?? [], arreglos: n.arreglos ?? [] };
  return {
    funciones: n.cambios.filter(([tipo]) => tipo !== 'arreglo').map(([tipo, texto]) => ({ tipo, texto })),
    arreglos: n.cambios.filter(([tipo]) => tipo === 'arreglo').map(([, texto]) => texto),
  };
}

function Funcion({ f }) {
  return (
    <li className="parche__funcion">
      <span className={`parche__tipo parche__tipo--${f.tipo}`}>
        {TIPOS[f.tipo]}
        <span className="solo-lectores">:</span>
      </span>
      <div>
        <p>
          {f.nombre && <strong>{f.nombre}: </strong>}
          {f.texto}
        </p>
        {f.puntos?.length > 0 && (
          <ul className="parche__puntos">
            {f.puntos.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function Novedades() {
  useSeo({ titulo: tituloDe('Notas del parche'), descripcion: 'Qué cambió en Super CVG, fecha por fecha.' });
  return (
    <article className="contenedor pagina texto-largo parche" aria-labelledby="parche-titulo">
      <h1 id="parche-titulo">Notas del parche</h1>
      {NOVEDADES.map((n) => {
        const { funciones, arreglos } = partesDe(n);
        return (
          <section key={n.fecha} className="parche__version" aria-labelledby={`parche-${n.fecha}`}>
            <h2 id={`parche-${n.fecha}`}>{n.titulo}</h2>
            <p className="parche__fecha">
              <time dateTime={n.fecha}>{fechaLarga(n.fecha)}</time>
            </p>
            {funciones.length > 0 && (
              <ul className="parche__lista">
                {funciones.map((f, i) => <Funcion key={i} f={f} />)}
              </ul>
            )}
            {arreglos.length > 0 && (
              <>
                <h3 className="parche__sub">Arreglos</h3>
                <ul className="parche__arreglos">
                  {arreglos.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </article>
  );
}
