import { useMemo, useState } from 'react';
import Campo from '../../Campo';
import { leerArbol, recorrer, RECORRIDOS } from '../../../lib/calculadoras/arboles';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { DibujoArbol } from './_log-trazos';
import './recorrido.css';

// Traversals of binary trees of Lógica y Estructuras Discretas: an expression or a tree written as A(B, C) on the
// board, and on the sheet the tree as drawn in class, with the order of each visit written next to each vertex, the
// visit one by one and the three traversals. The parsers are El Santo Resumen's (lib/calculadoras/arboles.js).

const FORMAS = [
  { valor: 'expresion', texto: 'De una expresión' },
  { valor: 'anidado', texto: 'Escrito como A(B, C)' },
];

const ORDENES = Object.entries(RECORRIDOS).map(([valor, r]) => ({ valor, texto: r.nombre }));

// (a − b) × (c + d ÷ e) and y + 2 are the expressions of Árboles.pdf (parcial-3.md of Lógica). A(B, C(, D)) is the way
// El Santo Resumen writes a tree by its vertices.
export const EJEMPLOS = [
  { nombre: '(a − b) × (c + d ÷ e)', forma: 'expresion', arbol: '(a − b) × (c + d ÷ e)', orden: 'preorden' },
  { nombre: 'y + 2', forma: 'expresion', arbol: 'y + 2', orden: 'postorden' },
  { nombre: 'A(B(D, E), C(, F))', forma: 'anidado', arbol: 'A(B(D, E), C(, F))', orden: 'entreorden' },
];

const INICIAL = { forma: 'expresion', arbol: EJEMPLOS[0].arbol, orden: 'preorden' };

const AYUDA = {
  expresion: 'Con + − × ÷ ^ y paréntesis. También van * y /.',
  anidado: 'Cada vértice y, entre paréntesis, su hijo izquierdo y su hijo derecho. Si falta uno, su lugar queda vacío, como en A(B, C(, D)).',
};

const y = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0]);

/** The visit, one vertex at a time: the vertices visited, with the highlighter, and the order written next to them. */
function Visita({ t, orden, forma }) {
  const lista = useMemo(() => recorrer(t.raiz, orden), [t, orden]);
  const total = lista.length;
  const [vistos, setVistos] = useState(total);
  const marcas = {};
  const numeros = {};
  lista.forEach((v, i) => {
    if (i >= vistos) return;
    numeros[v.id] = i + 1;
    marcas[v.id] = i === vistos - 1 && vistos < total ? 'ahora' : 'visto';
  });
  const r = RECORRIDOS[orden];
  const raiz = t.raiz;
  return (
    <>
      <Paso titulo="El árbol">
        <DibujoArbol
          vertices={t.vertices}
          aristas={t.aristas}
          columnas={t.columnas}
          altura={t.altura}
          marcas={marcas}
          numeros={numeros}
          pasoX={t.columnas > 7 ? 42 : 48}
          r={16}
          etiqueta={`Árbol binario con raíz ${raiz.e}. ${t.aristas.map((a) => `${a.a.e} es hijo ${a.lado === 'i' ? 'izquierdo' : 'derecho'} de ${a.de.e}`).join('. ')}.`}
        />
        <p className="calc-hoja__nota">
          {forma === 'expresion' && raiz.i ? `La raíz es el operador central, ${raiz.e}. ` : `La raíz es ${raiz.e}. `}
          {`Altura ${t.altura}. ${t.hojas.length === 1 ? 'La hoja es' : 'Las hojas son'} ${y(t.hojas.map((v) => v.e))}.`}
        </p>
      </Paso>
      <Paso titulo={`${r.nombre}, ${r.regla}`}>
        <div className="arb-controles" role="group" aria-label="La visita, de a un vértice">
          <button type="button" className="boton boton--secundario boton--chico" aria-disabled={vistos === 0} onClick={vistos === 0 ? undefined : () => setVistos(0)}>Desde el principio</button>
          <button type="button" className="boton boton--secundario boton--chico" aria-disabled={vistos === 0} onClick={vistos === 0 ? undefined : () => setVistos((v) => v - 1)}>Anterior</button>
          <button type="button" className="boton boton--chico" aria-disabled={vistos === total} onClick={vistos === total ? undefined : () => setVistos((v) => v + 1)}>Siguiente</button>
        </div>
        <ol className="arb-orden" aria-label={`El ${r.nombre.toLowerCase()} escrito hasta acá`}>
          {lista.map((v, i) => (
            <li key={v.id} className="arb-orden__casilla" data-vista={i < vistos || undefined} data-ahora={(i === vistos - 1 && vistos < total) || undefined} aria-hidden={i >= vistos || undefined}>
              <span className="arb-orden__numero">{i + 1}</span>
              <span className="arb-orden__nombre">{i < vistos ? v.e : ''}</span>
            </li>
          ))}
        </ol>
        <p className="solo-lectores" aria-live="polite">
          {vistos === 0 ? 'Sin visitas todavía.' : vistos === total ? `Completo. ${lista.map((v) => v.e).join(' ')}` : `Visita ${vistos} de ${total}, ${lista[vistos - 1].e}.`}
        </p>
      </Paso>
    </>
  );
}

export default function Recorrido() {
  const [estado, setEstado] = useRecordado('calc:recorrido', INICIAL);
  const { forma, arbol, orden } = estado;
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const t = useMemo(() => leerArbol(arbol, forma), [arbol, forma]);
  const listo = !t.error;
  const elegido = listo ? recorrer(t.raiz, orden).map((v) => v.e).join(' ') : '';

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="El árbol" nombre="forma" opciones={FORMAS} valor={forma} alCambiar={(f) => cambiar({ forma: f })} />
          <Campo etiqueta={forma === 'expresion' ? 'La expresión' : 'Los vértices'} ayuda={AYUDA[forma]} error={t.error}>
            <input className="campo__control trz-escrito" type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={300} value={arbol} onChange={(e) => cambiar({ arbol: e.target.value })} />
          </Campo>
          <Opciones leyenda="Recorrido" nombre="orden" opciones={ORDENES} valor={orden} alCambiar={(o) => cambiar({ orden: o })} />
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {listo && (
        <Hoja>
          <Resultado dicho={`${RECORRIDOS[orden].nombre}, ${elegido}.`} nota={RECORRIDOS[orden].da}>
            <span className="resaltado arb-resultado">{elegido}</span>
          </Resultado>
          <Pasos>
            <Visita key={`${forma}|${arbol}|${orden}`} t={t} orden={orden} forma={forma} />
            <Paso titulo="Los tres recorridos">
              <ul className="arb-tres">
                {Object.entries(RECORRIDOS).map(([k, r]) => (
                  <li key={k} className="arb-tres__uno" data-elegido={k === orden || undefined}>
                    <span className="arb-tres__nombre">{r.nombre}</span>
                    <span className="arb-tres__regla">{r.regla}</span>
                    <span className="arb-tres__orden">{recorrer(t.raiz, k).map((v) => v.e).join(' ')}</span>
                    <span className="arb-tres__da">{`${r.da} ${k === 'entreorden' ? 'No permite reconstruir el árbol.' : 'Permite reconstruir el árbol.'}`}</span>
                  </li>
                ))}
              </ul>
            </Paso>
          </Pasos>
        </Hoja>
      )}
    </>
  );
}
