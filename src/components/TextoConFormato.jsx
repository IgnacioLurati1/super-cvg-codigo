import { Fragment } from 'react';
import { dominioDe } from '../lib/datos';
import { leerFormato } from '../lib/formato';

function Partes({ partes }) {
  return partes.map((p, i) => {
    if (p.tipo === 'negrita') return <strong key={i}>{p.texto}</strong>;
    if (p.tipo === 'cursiva') return <em key={i}>{p.texto}</em>;
    // The text of a link does not say where it goes: its site shows on hover.
    if (p.tipo === 'enlace') return <a key={i} href={p.url} title={dominioDe(p.url) || undefined} target="_blank" rel="noreferrer">{p.texto}<span className="solo-lectores">, se abre en otra pestaña</span></a>;
    return <Fragment key={i}>{p.texto}</Fragment>;
  });
}

/** Headings, lists and paragraphs drawn as elements: from a text of one's own (lib/formato.js) or from a campus text
 * area (lib/bloquesCampus.js). A heading of level 2 is one inside a unit. */
export function Bloques({ bloques }) {
  return (
    <div className="texto-propio">
      {bloques.map((b, i) => {
        if (b.tipo === 'titulo') return b.nivel === 2 ? <h4 key={i}><Partes partes={b.partes} /></h4> : <h3 key={i}><Partes partes={b.partes} /></h3>;
        if (b.tipo === 'lista') return <ul key={i}>{b.items.map((partes, j) => <li key={j}><Partes partes={partes} /></li>)}</ul>;
        return <p key={i}>{b.lineas.map((partes, j) => <Fragment key={j}>{j > 0 && <br />}<Partes partes={partes} /></Fragment>)}</p>;
      })}
    </div>
  );
}

/** A text written by hand in a course of one's own, drawn as elements (lib/formato.js). */
export default function TextoConFormato({ texto }) {
  return <Bloques bloques={leerFormato(texto)} />;
}
