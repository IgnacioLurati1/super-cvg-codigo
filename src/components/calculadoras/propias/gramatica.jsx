import { Fragment, useMemo, useRef } from 'react';
import Campo from '../../Campo';
import { arbolDerivacion, clasificar, derivar, esNT, leerGramatica, lenguaje, MAQUINA, NOMBRE_TIPO, produccion, ver, yLista } from '../../../lib/calculadoras/gramaticas';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { DibujoArbol, Teclas } from './_log-trazos';
import './gramatica.css';

// Formal grammars of Sintaxis y Semántica de los Lenguajes (parcial-2.md, «Gramáticas formales», «Derivaciones» and
// «Jerarquía de Chomsky y máquinas»): the productions and a word on the board, and on the sheet G = {VT, VN, P, S}, the
// type of each production, the words it generates, the derivation of the word and its syntax tree (parcial-1.md). The
// method is El Santo Resumen's (lib/calculadoras/gramaticas.js).

// The four are examples of the apunte «4. Gramáticas», págs. 3 a 12, as parcial-2.md copies them.
export const EJEMPLOS = [
  { nombre: 'Regular por la izquierda', producciones: 'A -> B1 | 1\nB -> A0', palabra: '10101', lado: 'izquierda' },
  { nombre: 'Por la izquierda y por la derecha', producciones: 'S -> aABAa\nA -> ε | aA\nB -> ε | bB', palabra: 'aa', lado: 'derecha' },
  { nombre: 'Regular por la derecha', producciones: 'S -> bbS | aaA\nA -> aaA | bb', palabra: 'bbaabb', lado: 'izquierda' },
  { nombre: 'G1 de tipo 0', producciones: 'S -> 000S111\n0S1 -> 01', palabra: '000111', lado: 'izquierda' },
];

const INICIAL = { producciones: EJEMPLOS[0].producciones, palabra: EJEMPLOS[0].palabra, lado: 'izquierda' };
const LADOS = [
  { valor: 'izquierda', texto: 'Por la izquierda' },
  { valor: 'derecha', texto: 'Por la derecha' },
];
const TECLAS = [
  { texto: '->', nombre: 'flecha', espacio: true },
  { texto: '|', nombre: 'barra, o', espacio: true },
  { texto: 'ε', nombre: 'épsilon' },
];
const PASOS = 20;

const tipoTexto = (c) => `${NOMBRE_TIPO[c.tipo]}${c.lado ? ` ${c.lado}` : ''}`;
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Producción por producción: the highest type each one meets, and why it does not reach the next. */
function Tipos({ g, c, conEps }) {
  const peor = g.prods[c.peor];
  let quien;
  if (c.mezcla) quien = 'Mezcla producciones regulares por la derecha y por la izquierda. No llega a tipo 3.';
  else if (c.tipo < 3) quien = `${produccion(peor)} no llega a tipo ${c.tipo + 1}. ${c.tipos[c.peor].por}`;
  else quien = 'Todas las producciones tienen la forma regular.';
  return (
    <>
      <ul className="grm-prods">
        {g.prods.map((p, i) => (
          <li key={produccion(p)} className="grm-prod" data-peor={(c.tipo < 3 && !c.mezcla && i === c.peor) || undefined}>
            <span className="grm-prod__nombre">{produccion(p)}</span>
            <span className="grm-prod__tipo">{`tipo ${c.tipos[i].tipo}`}</span>
            <span className="grm-prod__por">{c.tipos[i].por}</span>
          </li>
        ))}
      </ul>
      <p>{quien}</p>
      {conEps && conEps.tipo !== c.tipo && <p className="calc-hoja__nota">{`Si tu cátedra acepta ε en cualquier no terminal, es de tipo ${conEps.tipo}, ${tipoTexto(conEps)}.`}</p>}
    </>
  );
}

function Palabras({ g, len }) {
  const lineas = [];
  if (!Number.isFinite(len.m)) lineas.push(`No genera ninguna palabra, porque ${g.axioma} nunca termina en terminales.`);
  else {
    lineas.push(len.ciclo ? `Es infinito. Con ${yLista(len.ciclo.map(produccion))}, ${len.ciclo[0].izq} vuelve a aparecer y suma terminales. Se repite sin límite.` : 'Es finito, porque ninguna recursión suma terminales.');
    const mas = (ws) => (ws.length > 10 ? `${ws.slice(0, 10).map(ver).join(', ')} y más` : yLista(ws.map(ver)));
    lineas.push(len.cortas.length === 1 ? `La palabra más corta es ${ver(len.cortas[0])}, de longitud ${len.m}.` : `Las más cortas, de longitud ${len.m}, son ${mas(len.cortas)}.`);
    if (len.siguientes.length) {
      const n = len.siguientes[0].length;
      lineas.push(len.siguientes.length === 1 ? `La que sigue es ${ver(len.siguientes[0])}, de longitud ${n}.` : `Las que siguen, de longitud ${n}, son ${mas(len.siguientes)}.`);
    }
  }
  if (len.sinUso.length) lineas.push(`${yLista(len.sinUso)} nunca ${len.sinUso.length > 1 ? 'terminan' : 'termina'} en terminales. No ${len.sinUso.length > 1 ? 'aportan' : 'aporta'} palabras.`);
  return (
    <>
      <div className="grm-lineas">
        {lineas.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
      {len.completo && len.palabras.length <= 40 && <p className="calc-hoja__cuenta">{`L(G) = {${len.palabras.map(ver).join(', ')}}`}</p>}
    </>
  );
}

/** One sentential form, with what the last production put in it highlighted. */
function Forma({ f, en, largo }) {
  if (en === undefined || !largo) return <span>{ver(f)}</span>;
  return (
    <span>
      {f.slice(0, en)}
      <span className="grm-nuevo">{f.slice(en, en + largo)}</span>
      {f.slice(en + largo)}
    </span>
  );
}

function Derivacion({ g, d, objetivo }) {
  if (!d.camino) {
    return <p>{d.cortado ? `No aparece entre ${d.revisadas} formas sentenciales. Puede que la gramática no la genere.` : `La gramática no genera ${ver(objetivo)}. Ninguna derivación desde ${g.axioma} llega a ella.`}</p>;
  }
  const pasos = d.camino.slice(1);
  const medio = d.camino.slice(1, -1).map((x) => ver(x.f));
  const esForma = [...objetivo].some(esNT);
  let cierre = esForma ? `${ver(objetivo)} es una forma sentencial, porque sale del axioma y todavía tiene no terminales.` : `${ver(objetivo)} es una sentencia, porque sale del axioma y tiene solo terminales.`;
  if (!esForma && medio.length) cierre += medio.length > 6 ? ' Las del medio son formas sentenciales.' : medio.length > 1 ? ` Las del medio, ${yLista(medio)}, son formas sentenciales.` : ` ${medio[0]} es una forma sentencial.`;
  return (
    <>
      <p className="calc-hoja__cuenta grm-cadena">
        {d.camino.map((x, i) => (
          <Fragment key={x.f}>
            {i > 0 && <span className="grm-cadena__da">{' ⇒ '}</span>}
            <span className="grm-cadena__forma">{ver(x.f)}</span>
          </Fragment>
        ))}
      </p>
      <ol className="grm-pasos">
        {pasos.slice(0, PASOS).map((x) => (
          <li key={x.f} className="grm-paso">
            <span className="grm-paso__forma">
              <Forma f={x.f} en={x.en} largo={x.p.der.length} />
            </span>
            <span className="grm-paso__con">{`con ${produccion(x.p)}`}</span>
          </li>
        ))}
      </ol>
      {pasos.length > PASOS && <p className="calc-hoja__nota">{`Siguen ${pasos.length - PASOS} pasos más del mismo modo, hasta llegar a ${ver(objetivo)}.`}</p>}
      <p>{cierre}</p>
      {!d.libre && g.libre && <p className="calc-hoja__nota">Como tiene no terminales, se reemplaza el que haga falta y no siempre el de un lado.</p>}
      {!g.libre && <p className="calc-hoja__nota">Como no es libre del contexto, se reemplaza la parte de la izquierda donde aparezca.</p>}
    </>
  );
}

export default function Gramatica() {
  const [estado, setEstado] = useRecordado('calc:gramatica', INICIAL);
  const cambiar = (cambio) => setEstado((x) => ({ ...x, ...cambio }));
  const campoP = useRef(null);
  const g = useMemo(() => leerGramatica(estado.producciones), [estado.producciones]);
  const objetivo = estado.palabra.replace(/\s+/g, '').replace(/ε/g, '');
  const hay = estado.palabra.trim() !== '';
  const r = useMemo(() => {
    if (g.error) return null;
    const c = clasificar(g, false);
    const conEps = c.tipos.some((t) => t.eps) ? clasificar(g, true) : null;
    const len = g.libre ? lenguaje(g) : null;
    const d = hay ? derivar(g, objetivo, estado.lado, len ? len.largo : new Map()) : null;
    const arbol = d?.camino && d.libre ? arbolDerivacion(d.camino) : null;
    return { c, conEps, len, d, arbol };
  }, [g, hay, objetivo, estado.lado]);

  let hoja = null;
  if (r) {
    const { c, conEps, len, d, arbol } = r;
    const nombre = mayuscula(tipoTexto(c));
    hoja = (
      <Hoja>
        <Resultado dicho={`Es de tipo ${c.tipo}, ${tipoTexto(c)}.`} nota={`${nombre}. Lo reconoce ${MAQUINA[c.tipo]}.`}>
          <span>Es de tipo</span>
          <span className="resaltado">{c.tipo}</span>
        </Resultado>
        <Pasos>
          <Paso titulo="La gramática">
            <p className="calc-hoja__cuenta">G = {'{'}VT, VN, P, S{'}'}</p>
            <dl className="dato grm-dato">
              <dt>VT</dt>
              <dd>{`{${[...g.VT].sort().join(', ')}}`}</dd>
              <dt>VN</dt>
              <dd>{`{${g.VN.join(', ')}}`}</dd>
              <dt>P</dt>
              <dd>{`{${g.prods.map(produccion).join(', ')}}`}</dd>
              <dt>S</dt>
              <dd>{`${g.axioma}, el axioma`}</dd>
            </dl>
          </Paso>
          <Paso titulo="Producción por producción">
            <Tipos g={g} c={c} conEps={conEps} />
          </Paso>
          {len && (
            <Paso titulo="Las palabras que genera">
              <Palabras g={g} len={len} />
            </Paso>
          )}
          {d && (
            <Paso titulo={`Derivación de ${ver(objetivo)}${d.libre ? ` por la ${estado.lado}` : ''}`}>
              <Derivacion g={g} d={d} objetivo={objetivo} />
            </Paso>
          )}
          {arbol && (
            <Paso titulo="El árbol sintáctico">
              <DibujoArbol
                vertices={arbol.vertices}
                aristas={arbol.aristas}
                columnas={arbol.columnas}
                altura={arbol.altura}
                marcas={Object.fromEntries(arbol.vertices.filter((v) => !v.hijos.length && !v.vacia).map((v) => [v.id, 'visto']))}
                pasoX={arbol.columnas > 7 ? 40 : 46}
                pasoY={56}
                r={15}
                etiqueta={`Árbol sintáctico de ${ver(objetivo)}, con ${g.axioma} en la raíz. ${arbol.aristas.length ? `${arbol.vertices.filter((v) => v.hijos.length).map((v) => `${v.e} tiene por hijos ${yLista(v.hijos.map((h) => h.e))}`).join('. ')}.` : ''}`}
              />
              <p className="calc-hoja__nota">{`En la raíz, el axioma ${g.axioma}. Las hojas, leídas en orden, dan ${ver(objetivo)}.`}</p>
            </Paso>
          )}
        </Pasos>
      </Hoja>
    );
  }

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Campo etiqueta="Producciones" ayuda="Una por renglón, como S -> aS | b. Los no terminales van en mayúscula." error={g.error}>
            <textarea ref={campoP} className="campo__control trz-renglones trz-escrito" rows={3} autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={800} value={estado.producciones} onChange={(ev) => cambiar({ producciones: ev.target.value })} />
          </Campo>
          <Teclas teclas={TECLAS} campo={campoP} valor={estado.producciones} alCambiar={(producciones) => cambiar({ producciones })} etiqueta="Escribir en las producciones" />
          <Campo etiqueta="Palabra para derivar" ayuda="Como 10101.">
            <input className="campo__control trz-escrito" type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={40} value={estado.palabra} onChange={(ev) => cambiar({ palabra: ev.target.value })} />
          </Campo>
          {!g.error && g.libre && <Opciones leyenda="Derivación" nombre="lado" opciones={LADOS} valor={estado.lado} alCambiar={(lado) => cambiar({ lado })} />}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...ej }) => setEstado(ej)} />
      </section>
      {hoja}
    </>
  );
}
