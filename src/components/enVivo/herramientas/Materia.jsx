import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { esDeTipo, FilaItem, FiltroDeMateria } from '../../Filas';
import IndiceSecciones from '../../IndiceSecciones';
import ListaConMas from '../../ListaConMas';
import { TituloDeSeccion } from '../../Secciones';
import Simbolo from '../../Simbolo';
import { useContenido, useVista } from '../../../lib/ajustes';
import { buscar } from '../../../lib/datos';
import { leerMateria, leerPedido, materiaEnTexto, pedirArchivo } from '../../../lib/enVivo/materiaMesa';
import { pestanas } from '../../../lib/enVivo/mesa';
import { useCambios } from './useCambios';
import '../../../pages/panel.css';
import '../../../pages/propias.css';
import '../../../pages/secciones.css';
import './materia/materia.css';

// A course on the table (contract in src/lib/enVivo/herramientas.js; the rules in materiaMesa.js), drawn with the
// pieces of the course page (Materia.jsx): its index, its search and kinds, its sections that fold and their rows. A PDF
// or a picture opens for everyone as an Apunte, brought by whoever brought the course. Links open in another tab. Only
// names and kinds travel: «Sin ver» and «Para el parcial» of the course page are the student's own, so they stay there.

const dominio = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** A thing of the course as a row of the course page takes it (Filas.jsx `FilaItem`): only its name and its kind
 * travel, so its drawing and its description come from them. */
function comoFila(i) {
  const base = { id: i.id, nombre: i.nombre, tipo: i.tipo, clase: i.clase };
  if (i.tipo === 'archivo') return { ...base, detalle: i.clase, ...(i.clase === 'Foto' ? { mime: 'image/jpeg' } : { archivo: `.${i.clase.toLowerCase()}` }) };
  if (i.tipo === 'enlace') return i.url ? { ...base, destino: i.url, dominio: dominio(i.url), video: i.clase === 'Video' } : { ...base, detalle: i.clase };
  return base;
}

// For the kinds of the course page: what is not a file, a link or a text is an activity of the campus.
const deTipo = (i) => ({ tipo: i.tipo === 'otro' ? 'actividad' : i.tipo });

const idDeSeccion = (pestana, n) => `${pestana}-seccion-${n}`;
const idDeCuerpo = (pestana, n) => `${pestana}-cuerpo-${n}`;

export default function Materia({ mesa }) {
  useCambios(mesa.datos);
  const m = leerMateria(mesa.datos);
  // Folded here only: each one folds the sections on their own screen.
  const [plegadas, setPlegadas] = useState(() => new Set());
  // Searched and shown here only, as on the course page.
  const [filtro, setFiltro] = useState('');
  const [tipo, setTipo] = useState('');
  const vista = useVista('materia');
  const contenido = useContenido();

  const texto = useRef('');
  useLayoutEffect(() => {
    texto.current = m ? materiaEnTexto(m) : '';
  });
  const registrar = mesa.paraConsultron;
  useEffect(() => registrar(() => texto.current), [registrar]);

  // What this browser asked for, to take it there once it's on the table.
  const pedidos = useRef(new Set());
  const abiertas = m ? m.secciones.flatMap((s) => s.items).filter((i) => i.abre).map((i) => [i.id, leerPedido(mesa.datos, i.id)]) : [];
  const listos = abiertas.filter(([, p]) => p?.estado === 'listo' && p.pestana).map(([id, p]) => `${id}:${p.pestana}`).join(',');
  const irA = mesa.irA;
  useEffect(() => {
    for (const par of listos.split(',').filter(Boolean)) {
      const [item, pestana] = par.split(':');
      if (pedidos.current.delete(item)) irA(pestana);
    }
  }, [listos, irA]);

  if (!m) return <p className="apunte-vivo__aviso" role="alert">Esta materia no se puede mostrar.</p>;
  // Whoever brought it, while here or on their way back from a reload (null once they left, or in a session from before
  // `presente`).
  const quien = typeof mesa.presente === 'function' ? mesa.presente(m.de) : null;
  const mia = m.de === mesa.yo.id;
  const tabs = pestanas(mesa.doc);
  const todas = m.secciones.map((s, n) => ({ ...s, n })).filter((s) => s.items.length);
  const hayFiltro = Boolean(filtro.trim() || tipo);
  // With a search, the rows that match, the best first in each section (Buscar of the course page).
  const halladas = filtro.trim() ? new Map(buscar(todas.flatMap((s) => s.items.map((i) => ({ ...comoFila(i), seccion: s.nombre }))), filtro, 1000).map((f, k) => [f.id, k])) : null;
  const secciones = hayFiltro
    ? todas
      .map((s) => ({ ...s, items: s.items.filter((i) => esDeTipo(deTipo(i), tipo) && (!halladas || halladas.has(i.id))).sort((a, b) => (halladas ? halladas.get(a.id) - halladas.get(b.id) : 0)) }))
      .filter((s) => s.items.length)
    : todas;
  const indice = secciones.map((s) => ({ clave: `s${s.n}`, nombre: s.nombre, destino: idDeSeccion(mesa.id, s.n), n: s.n }));
  // What is on its way, said once for screen readers.
  const yendo = abiertas.some(([, p]) => p?.estado === 'pedido' || p?.estado === 'trayendo');

  const abrir = (item) => {
    const p = leerPedido(mesa.datos, item.id);
    if (p?.estado === 'listo' && tabs.some((t) => t.id === p.pestana)) {
      irA(p.pestana);
      return;
    }
    pedidos.current.add(item.id);
    pedirArchivo(mesa.doc, mesa.datos, mesa.yo, item.id);
  };
  const alternar = (n) => setPlegadas((antes) => {
    const nuevas = new Set(antes);
    if (!nuevas.delete(n)) nuevas.add(n);
    return nuevas;
  });

  const fila = (i) => {
    if (!i.abre) return <FilaItem key={i.id} item={comoFila(i)} enlace={i.url || null} onAbrir={i.url ? null : () => {}} deshabilitado={!i.url} conTono />;
    const pedido = leerPedido(mesa.datos, i.id);
    const enMesa = pedido?.estado === 'listo' && tabs.some((t) => t.id === pedido.pestana);
    const trayendo = pedido?.estado === 'pedido' || pedido?.estado === 'trayendo';
    const marca = enMesa ? 'En la mesa' : trayendo ? (pedido.estado === 'pedido' ? 'Pidiéndolo…' : 'Trayéndolo del campus…') : null;
    return (
      <FilaItem key={i.id} item={comoFila(i)} marca={marca} onAbrir={() => abrir(i)} deshabilitado={(!quien && !enMesa) || trayendo} conTono>
        {pedido?.estado === 'falla' && <p className="materia-vivo__error" role="alert">{pedido.error || 'No se pudo abrir.'}</p>}
      </FilaItem>
    );
  };

  return (
    // The look the student chose for their courses (Configuración), as on the course page.
    <div className="materia materia-vivo" data-vista={vista} data-contenido={contenido}>
      <div className="materia__titulo">
        <Simbolo nombre={m.nombre} tamano="enorme" />
        <div className="materia-vivo__cabeza">
          <h2 className="materia-vivo__titulo">{m.nombre}</h2>
          <p className="materia-vivo__dato">
            {mia ? 'La trajiste vos, como la ves en tu campus.' : !quien ? 'Quien la trajo se fue de la sesión. Sus archivos ya no se pueden abrir.' : quien.nombre ? `La trajo ${quien.nombre}, como la ve en su campus.` : 'La trajo alguien de la sesión, como la ve en su campus.'}
          </p>
        </div>
      </div>
      <p className="solo-lectores" role="status">{yendo ? 'Trayendo un archivo a la mesa.' : ''}</p>
      {todas.length > 1 && <IndiceSecciones secciones={indice} onIr={(e) => plegadas.has(e.n) && alternar(e.n)} />}
      <FiltroDeMateria filtro={filtro} onFiltro={setFiltro} tipo={tipo} onTipo={setTipo} />
      <p role="status" className="materia__sin-nada">{secciones.length ? '' : 'No hay nada para mostrar acá. Probá con otro filtro.'}</p>
      {secciones.map((s) => (
        <section key={s.n} className="bloque" aria-labelledby={idDeSeccion(mesa.id, s.n)}>
          <div className="seccion__cabeza">
            <div className="seccion__titular">
              <TituloDeSeccion id={idDeSeccion(mesa.id, s.n)} cuerpo={idDeCuerpo(mesa.id, s.n)} nombre={s.nombre} plegada={!hayFiltro && plegadas.has(s.n)} cuantos={s.items.length} onAlternar={() => alternar(s.n)} sinPliegue={hayFiltro} Nivel="h3" />
            </div>
          </div>
          <div id={idDeCuerpo(mesa.id, s.n)} className="seccion__cuerpo" hidden={!hayFiltro && plegadas.has(s.n)}>
            <ListaConMas items={s.items} nombre={s.nombre} render={fila} />
          </div>
        </section>
      ))}
    </div>
  );
}
