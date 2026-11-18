import { useMemo, useRef } from 'react';
import Campo from '../../Campo';
import { NOTACIONES, parsear, tablaVerdad, texto } from '../../../lib/calculadoras/proposiciones';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { Teclas } from './_log-trazos';
import './tabla-verdad.css';

// The truth table of Lógica y Estructuras Discretas and of Inteligencia Artificial: the formula on the board, in the
// symbols of either subject, and on the sheet the table column by column, from the inside out, with the last one marked.
// The parser and the table are El Santo Resumen's core (lib/calculadoras/proposiciones.js).

const NOTACION = [
  { valor: 'logica', texto: 'Lógica' },
  { valor: 'ia', texto: 'Inteligencia Artificial' },
];

const NOMBRES = {
  logica: { no: 'negación', y: 'conjunción', o: 'disyunción', xor: 'diferencia simétrica', imp: 'condicional', ssi: 'bicondicional' },
  ia: { no: 'negación', y: 'conjunción', o: 'disyunción', imp: 'implicación material', ssi: 'equivalencia material' },
};

const tecla = (notacion, k) => ({ texto: NOTACIONES[notacion][k], nombre: NOMBRES[notacion][k], espacio: k !== 'no' });
const TECLAS = Object.fromEntries(
  Object.keys(NOMBRES).map((n) => [n, [...Object.keys(NOMBRES[n]).map((k) => tecla(n, k)), { texto: '(', nombre: 'abre paréntesis' }, { texto: ')', nombre: 'cierra paréntesis' }]]),
);

// The notes' own formulas: the modus ponens and the hypothetical syllogism of Rojo (parcial-1.md of Lógica), and the
// affirmation of the consequent, De Morgan and the contradiction of the notes of IA (ad.md).
export const EJEMPLOS = [
  { nombre: 'Modus ponens', notacion: 'logica', formula: '((p ⇒ q) ∧ p) ⇒ q' },
  { nombre: 'Silogismo hipotético', notacion: 'logica', formula: '((p ⇒ q) ∧ (q ⇒ r)) ⇒ (p ⇒ r)' },
  { nombre: 'Afirmación del consecuente', notacion: 'ia', formula: '[(p ⊃ q) ⋅ q] ⊃ p' },
  { nombre: 'De Morgan', notacion: 'ia', formula: '∼(p ∨ q) ≡ (∼p ⋅ ∼q)' },
  { nombre: 'Contradicción', notacion: 'ia', formula: 'p ⋅ ∼p' },
];

const INICIAL = { notacion: 'logica', formula: EJEMPLOS[0].formula };

const CLASE = {
  tautologia: 'una tautología',
  contradiccion: 'una contradicción',
  contingente: 'contingente',
};

// Past this many characters a column heading may break, only outside its brackets.
const LARGA = 9;
const partible = (t) => {
  let hondo = 0;
  return [...t]
    .map((c) => {
      if (c === '(') hondo += 1;
      if (c === ')') hondo -= 1;
      return c === ' ' && hondo > 0 ? ' ' : c;
    })
    .join('');
};

const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' };

function Valor({ v, s }) {
  return <span data-verdadero={v || undefined}>{v ? s.V : s.F}</span>;
}

function Tabla({ r, notacion }) {
  const s = NOTACIONES[notacion];
  const ultima = r.columnas.length - 1;
  const titulo = texto(r.raiz, notacion);
  return (
    <Desborde etiqueta="La tabla de verdad">
      <table className="tabla-pasos tabla-verdad tv-tabla">
        <caption className="solo-lectores">{`Tabla de verdad de ${titulo}`}</caption>
        <thead>
          <tr>
            <th scope="col" className="tabla-verdad__numero">
              <span className="solo-lectores">Renglón</span>
            </th>
            {r.variables.map((v) => (
              <th key={v} scope="col" className="tabla-verdad__letra">{v}</th>
            ))}
            {r.columnas.map((c, i) => {
              const t = texto(c.nodo, notacion);
              const larga = t.length > LARGA;
              return (
                <th key={t} scope="col" className={[i === ultima && 'tabla-pasos__clave', larga && 'tabla-verdad__larga'].filter(Boolean).join(' ') || undefined}>
                  {larga ? partible(t) : t}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {r.asignaciones.map((a, fila) => (
            <tr key={fila} data-falsa={!r.final[fila] || undefined}>
              <th scope="row" className="tabla-verdad__numero">{fila + 1}</th>
              {r.variables.map((v) => (
                <td key={v} className="tabla-verdad__letra"><Valor v={a[v]} s={s} /></td>
              ))}
              {r.columnas.map((c, i) => (
                <td key={i} className={i === ultima ? 'tabla-pasos__clave' : undefined}><Valor v={c.vals[fila]} s={s} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Desborde>
  );
}

/** What the last column gives, in words, with the rows that break it. */
function UltimaColumna({ r, notacion }) {
  const s = NOTACIONES[notacion];
  const total = r.final.length;
  const falsas = r.final.map((v, i) => (v ? null : i + 1)).filter(Boolean);
  const y = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : String(xs[0]));
  if (r.clase === 'tautologia') return <p>{`Da ${s.V} en los ${total} renglones. Es una tautología.`}</p>;
  if (r.clase === 'contradiccion') return <p>{`Da ${s.F} en los ${total} renglones. Es una contradicción.`}</p>;
  return (
    <>
      <p>{`Da ${s.V} en ${r.verdaderas} ${r.verdaderas === 1 ? 'renglón' : 'renglones'} y ${s.F} en ${falsas.length === 1 ? `el ${falsas[0]}` : `los ${y(falsas)}`}. Es contingente.`}</p>
    </>
  );
}

export default function TablaDeVerdad() {
  const [estado, setEstado] = useRecordado('calc:tabla-verdad', INICIAL);
  const { notacion, formula } = estado;
  const campo = useRef(null);
  const leida = useMemo(() => {
    try {
      return { r: tablaVerdad(formula) };
    } catch (e) {
      return { error: e.message };
    }
  }, [formula]);
  const r = leida.r;
  const s = NOTACIONES[notacion];

  // Changing the subject rewrites the formula with its symbols, when it can be read.
  const cambiarNotacion = (n) => {
    setEstado((e) => {
      try {
        return { notacion: n, formula: texto(parsear(e.formula), n) };
      } catch {
        return { ...e, notacion: n };
      }
    });
  };

  const n = r?.variables.length ?? 0;
  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="Notación" nombre="notacion" opciones={NOTACION} valor={notacion} alCambiar={cambiarNotacion} />
          <Campo etiqueta="Fórmula" ayuda="Variables de una letra, como p y q. Valen no, y, o, -> y <->." error={leida.error}>
            <input
              ref={campo}
              className="campo__control trz-escrito"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
              maxLength={200}
              value={formula}
              onChange={(e) => setEstado((x) => ({ ...x, formula: e.target.value }))}
            />
          </Campo>
          <Teclas teclas={TECLAS[notacion]} campo={campo} valor={formula} alCambiar={(f) => setEstado((x) => ({ ...x, formula: f }))} etiqueta="Escribir un conectivo" />
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {r && (
        <Hoja>
          <Resultado dicho={`Es ${CLASE[r.clase]}.`} nota={r.clase === 'tautologia' && notacion === 'logica' ? 'Es una ley lógica.' : undefined}>
            <span>Es</span>
            <span className="resaltado">{CLASE[r.clase]}</span>
          </Resultado>
          <Pasos>
            <Paso titulo="La fórmula">
              <p className="calc-hoja__cuenta tv-formula">{texto(r.raiz, notacion)}</p>
              <p className="calc-hoja__nota">
                {`Con ${n} ${n === 1 ? 'variable' : 'variables'} hay 2`}
                <span aria-hidden="true">{SUPER[n]}</span>
                <span className="solo-lectores">{` a la ${n}`}</span>
                {` = ${r.asignaciones.length} renglones. El primero tiene todo ${s.V}.`}
              </p>
            </Paso>
            <Paso titulo="La tabla">
              <p className="calc-hoja__nota">Una columna por cada parte, de adentro hacia afuera. La última es la fórmula entera.</p>
              <Tabla r={r} notacion={notacion} />
            </Paso>
            <Paso titulo="La última columna">
              <UltimaColumna r={r} notacion={notacion} />
            </Paso>
          </Pasos>
        </Hoja>
      )}
    </>
  );
}
