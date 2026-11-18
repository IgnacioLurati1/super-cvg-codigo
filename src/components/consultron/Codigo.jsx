import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUI } from '../ui';
import { frenarAgente, mandar, seguirPropuestas, sincronizar, useAgente, useCodigo, usePropuestas } from '../../lib/consultron/agente';
import { enLinea, POR_DIA, ponerAplicarSolo, quedanHoy, TOPE_PEDIDO, textoDelMotivo, vuelven } from '../../lib/consultron/codigo';
import { cuentas, diferencia, tramos } from '../../lib/consultron/diferencia';
import { ideAhora } from '../../lib/consultron/pantalla';
import { aplicar, aplicarTodo, descartar, descartarTodo, deshacer } from '../../lib/consultron/propuestas';
import './codigo.css';

// Consultron in «Código», in its corner over the lab: the student asks, the agent reads, proposes and runs (codigo.js),
// and here they see what it did and each change, to apply it or not. The change is also marked in the editor
// (enEditor.js). Nothing is applied without being seen, unless «Aplicar solo» is on: then it can be undone.

const cambios = ({ suma, quita }) => `+${suma} −${quita}`;

function textoDelPaso(p) {
  if (p.tipo === 'lista') return 'Miró los archivos.';
  if (p.tipo === 'lee') return `Leyó ${p.nombre}.`;
  if (p.tipo === 'edita') return `${p.aplicado ? 'Cambió' : 'Propuso cambios en'} ${p.nombre} (${cambios(p)}).`;
  if (p.tipo === 'crea') return `${p.aplicado ? 'Creó' : 'Propuso crear'} ${p.nombre}.`;
  if (p.tipo === 'corre') {
    if (p.ocupado) return 'No corrió porque ya estabas corriendo el programa.';
    if (p.bien) return 'Corrió el programa y anduvo.';
    if (p.cortado === 'entrada') return 'Corrió y se quedó esperando que escribas algo.';
    if (p.cortado === 'tiempo') return 'Corrió y no terminó a tiempo.';
    if (p.cortado === 'parado') return 'Corrió y lo paraste.';
    return p.linea > 0 ? `Corrió y falló en la línea ${p.linea}${p.archivo ? ` de ${p.archivo}` : ''}.` : 'Corrió y falló.';
  }
  if (p.tipo === 'casos') return p.hay ? `Corrió los casos de prueba. Fallan ${p.fallan} de ${p.total}.` : 'Buscó casos de prueba y no hay.';
  return p.texto ?? '';
}

// What the agent answered: paragraphs, with their bold and code, and the code between ```.
function Texto({ texto }) {
  const partes = texto.split(/```[\w+-]*\n?/);
  return partes.map((p, i) =>
    i % 2 ? (
      <pre key={i} className="cvg-agente__bloque"><code>{p.replace(/\n$/, '')}</code></pre>
    ) : (
      p.split(/\n{2,}/).filter((x) => x.trim()).map((x, k) => (
        <p key={`${i}-${k}`}>{enLinea(x.trim()).map((t, n) => (t.fuerte ? <strong key={n}>{t.texto}</strong> : t.codigo ? <code key={n}>{t.texto}</code> : t.texto))}</p>
      ))
    ),
  );
}

// The change of one file, by pieces, each line with its number and its sign.
function Diferencia({ antes, despues }) {
  const piezas = tramos(diferencia(antes, despues));
  return (
    <div className="cvg-agente__dif">
      {piezas.map((lineas, i) => (
        <div key={i} className="cvg-agente__tramo">
          {lineas.map((l, k) => {
            const Linea = l.tipo === 'suma' ? 'ins' : l.tipo === 'quita' ? 'del' : 'span';
            return (
              <Linea key={k} className={`cvg-agente__linea cvg-agente__linea--${l.tipo}`}>
                <span className="cvg-agente__num" aria-hidden="true">{l.a ?? l.en}</span>
                <span className="cvg-agente__signo" aria-hidden="true">{l.tipo === 'suma' ? '+' : l.tipo === 'quita' ? '−' : ' '}</span>
                <span className="cvg-agente__codigo">{l.texto || ' '}</span>
              </Linea>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function Codigo({ nivel = 3 }) {
  const id = useId();
  const Titulo = `h${nivel}`;
  const { avisar } = useUI();
  const config = useCodigo();
  const { turnos, trabajando } = useAgente();
  const propuestas = usePropuestas();
  const [texto, setTexto] = useState('');
  const campo = useRef(null);
  const final = useRef(null);
  const ide = ideAhora();

  useEffect(() => {
    seguirPropuestas();
    sincronizar();
    // Loaded after the panel opened: the focus comes to the box if it was nowhere or in the panel, but for the mode just
    // chosen.
    const donde = document.activeElement;
    if (!donde || donde === document.body || (donde.closest('.flotante') && !donde.closest('.cvg-modos'))) campo.current?.focus();
  }, []);
  // What it does goes on at the bottom, in view.
  const ultimo = turnos.at(-1);
  useEffect(() => {
    final.current?.scrollIntoView?.({ block: 'end' });
  }, [ultimo?.pasos.length, ultimo?.respuesta, propuestas.archivos.length]);

  const quedan = quedanHoy(config);
  const usos =
    quedan === 0
      ? `Por hoy no te quedan pedidos. Vuelven a las ${vuelven()}.`
      : quedan === null
        ? `Tenés ${POR_DIA} pedidos por día.`
        : `Te ${quedan === 1 ? 'queda 1 pedido' : `quedan ${quedan} pedidos`} hoy.`;
  const conError = /^Error|error/.test(ide?.final ?? '');

  const pedir = (t = texto) => {
    if (!t.trim() || trabajando || quedan === 0 || !ide) return;
    setTexto('');
    mandar(t, { solo: config.aplicarSolo });
  };
  const alEnviar = (e) => {
    e.preventDefault();
    pedir();
  };
  const alTeclear = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      pedir();
    }
  };

  const contenidoActual = (n) => ide?.archivos().find((a) => a.nombre === n)?.contenido ?? '';
  const aplicarUno = (n) => {
    if (!ide || !aplicar(ide, n)) avisar(`No se pudo aplicar en ${n}.`, 'error');
  };
  const aplicarTodos = () => {
    const fallan = ide ? aplicarTodo(ide) : propuestas.archivos.map((p) => p.nombre);
    if (fallan.length) avisar(`No se pudo aplicar en ${fallan.join(', ')}.`, 'error');
  };

  return (
    <div className="cvg-agente">
      <div className="cvg-agente__hilo">
        <p className="cvg-agente__usos" id={`${id}-usos`}>{usos}</p>
        {!turnos.length && (
          <div className="cvg-agente__vacio">
            <p>Arregla errores, explica y escribe código en tu proyecto. Los cambios los aplicás vos.</p>
            {ide && quedan !== 0 && (
              <div className="cvg-agente__ideas">
                {conError && <button type="button" className="boton boton--secundario boton--chico" onClick={() => pedir('Arreglá el error de la consola.')}>Arreglá el error</button>}
                <button type="button" className="boton boton--secundario boton--chico" onClick={() => pedir('Explicame qué hace este código.')}>Explicame el código</button>
              </div>
            )}
          </div>
        )}
        {!ide && <p className="cvg-agente__aviso">Abrí el Laboratorio para usarlo.</p>}

        <ol className="cvg-agente__turnos">
          {turnos.map((t) => (
            <li key={t.id} className="cvg-agente__turno">
              <p className="cvg-agente__pedido">{t.pedido}</p>
              {t.pasos.length > 0 && (
                <ul className="cvg-agente__pasos" aria-label="Lo que hizo">
                  {t.pasos.map((p, i) => (
                    <li key={i} className={`cvg-agente__paso cvg-agente__paso--${p.tipo}`}>{textoDelPaso(p)}</li>
                  ))}
                </ul>
              )}
              {t.trabajando && <p className="cvg-agente__trabajando">Trabajando…</p>}
              {t.respuesta && <div className="cvg-agente__respuesta"><Texto texto={t.respuesta} /></div>}
              {t.motivo && <p className="cvg-agente__aviso">{textoDelMotivo(t.motivo)}</p>}
            </li>
          ))}
        </ol>
        <p className="solo-lectores" role="status">
          {ultimo ? (ultimo.trabajando ? textoDelPaso(ultimo.pasos.at(-1) ?? { texto: 'Trabajando.' }) : ultimo.motivo ? textoDelMotivo(ultimo.motivo) : 'Terminó.') : ''}
        </p>

        {propuestas.archivos.length > 0 && (
          <section className="cvg-agente__propuestas" aria-labelledby={`${id}-cambios`}>
            <Titulo id={`${id}-cambios`} className="cvg-agente__titulo">Cambios para revisar</Titulo>
            {propuestas.archivos.map((p) => {
              const antes = p.nuevo ? '' : contenidoActual(p.nombre);
              return (
                <div key={p.nombre} className="cvg-agente__archivo">
                  <div className="cvg-agente__archivo-cabeza">
                    <button type="button" className="cvg-agente__nombre" onClick={() => ide?.abrir(p.nombre)} title={`Abrir ${p.nombre}`}>
                      {p.nuevo ? `${p.nombre} (nuevo)` : p.nombre}
                    </button>
                    <span className="cvg-agente__cuenta">{cambios(cuentas(diferencia(antes, p.despues)))}</span>
                    <button type="button" className="boton boton--chico" aria-label={`Aplicar en ${p.nombre}`} onClick={() => aplicarUno(p.nombre)}>Aplicar</button>
                    <button type="button" className="boton boton--secundario boton--chico" aria-label={`Descartar en ${p.nombre}`} onClick={() => descartar(p.nombre)}>Descartar</button>
                  </div>
                  <Diferencia antes={antes} despues={p.despues} />
                </div>
              );
            })}
            {propuestas.archivos.length > 1 && (
              <div className="cvg-agente__todo">
                <button type="button" className="boton boton--chico" onClick={aplicarTodos}>Aplicar todo</button>
                <button type="button" className="boton boton--secundario boton--chico" onClick={descartarTodo}>Descartar todo</button>
              </div>
            )}
          </section>
        )}
        {propuestas.hecho.length > 0 && !trabajando && ide && (
          <button type="button" className="boton boton--secundario boton--chico cvg-agente__deshacer" onClick={() => deshacer(ide)}>Deshacer lo de Consultron</button>
        )}
        <div ref={final} />
      </div>

      <form className="cvg-agente__caja" onSubmit={alEnviar}>
        <textarea
          ref={campo}
          className="campo__control cvg-agente__campo"
          rows={2}
          aria-label="Qué hago con tu código"
          aria-describedby={`${id}-usos ${id}-va`}
          maxLength={TOPE_PEDIDO}
          placeholder="Arreglá el error de la línea 8"
          value={texto}
          disabled={!ide}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTeclear}
        />
        <div className="cvg-agente__fila">
          <label className="cvg-agente__solo">
            <input type="checkbox" role="switch" className="interruptor" checked={Boolean(config.aplicarSolo)} onChange={(e) => ponerAplicarSolo(e.target.checked)} />
            Aplicar solo
          </label>
          {trabajando ? (
            <button type="button" className="boton boton--secundario" onClick={frenarAgente}>Frenar</button>
          ) : (
            <button type="submit" className="boton" disabled={!ide || quedan === 0}>Pedir</button>
          )}
        </div>
        <p className="cvg-agente__va" id={`${id}-va`}>
          Tu pedido y los archivos de este proyecto van a Groq o a Gemini, de Google. Nada del campus. <Link to="/privacidad">Privacidad</Link>
        </p>
      </form>
    </div>
  );
}
