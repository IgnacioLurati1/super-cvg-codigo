import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Campo from './Campo';
import './ui.css';

// Confirmaciones simples («¿Seguro?») y avisos cortos.
//   const { confirmar, avisar } = useUI();
//   if (await confirmar({ titulo: '¿Cancelar el pedido?', boton: 'Cancelar pedido', peligro: true })) …
//   const contrasena = await confirmar({ titulo: '…', contrasena: 'Tu contraseña' });  // the field's value, or false
//   const cual = await confirmar({ titulo: '…', elegir: { titulo: 'En cuál', opciones: [{ valor, nombre }], valor } });
//     // the chosen `valor`, or false
//   avisar('Pedido cancelado');            avisar('No se pudo guardar', 'error');
const Contexto = createContext(null);

function Dialogo({ pedido, responder }) {
  const ref = useRef(null);
  const volver = useRef(null);
  const aceptar = useRef(null);
  const campo = useRef(null);

  // showModal puts the focus on the first button, so it goes to the right one afterwards (React's autoFocus runs
  // while the dialog is still closed).
  useEffect(() => {
    const d = ref.current;
    if (!d.open) d.showModal();
    (pedido.contrasena ? campo : pedido.peligro ? volver : aceptar).current?.focus();
  }, [pedido.peligro, pedido.contrasena]);

  const cerrar = (valor) => {
    ref.current?.close();
    responder(valor);
  };

  return (
    <dialog
      ref={ref}
      className="dialogo"
      aria-labelledby="dialogo-titulo"
      onCancel={(e) => {
        e.preventDefault();
        cerrar(false);
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (pedido.contrasena && !campo.current?.value) {
            campo.current?.focus();
            return;
          }
          if (pedido.elegir) {
            cerrar(new FormData(e.currentTarget).get('dialogo-elegir') ?? pedido.elegir.valor);
            return;
          }
          cerrar(pedido.contrasena ? campo.current.value : true);
        }}
      >
        <h2 id="dialogo-titulo" className="dialogo__titulo">{pedido.titulo}</h2>
        {pedido.texto && <p className="dialogo__texto">{pedido.texto}</p>}
        {pedido.contrasena && (
          <div className="dialogo__campo">
            <Campo etiqueta={pedido.contrasena}>
              <input ref={campo} className="campo__control" type="password" autoComplete="current-password" required />
            </Campo>
          </div>
        )}
        {pedido.elegir && (
          <fieldset className="dialogo__elegir">
            <legend className="dialogo__elegir-titulo">{pedido.elegir.titulo}</legend>
            {pedido.elegir.opciones.map((o) => (
              <label key={o.valor} className="dialogo__opcion">
                <input type="radio" name="dialogo-elegir" value={o.valor} defaultChecked={o.valor === pedido.elegir.valor} />
                {o.nombre}
              </label>
            ))}
          </fieldset>
        )}
        <div className="dialogo__botones">
          {/* En una acción peligrosa el foco arranca en «Volver»: un Enter de más no borra nada. */}
          <button type="button" className="boton boton--secundario" onClick={() => cerrar(false)} ref={volver}>
            {pedido.volver || 'Volver'}
          </button>
          <button type="submit" className={`boton${pedido.peligro ? ' boton--peligro' : ''}`} ref={aceptar}>
            {pedido.boton || 'Confirmar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function UIProvider({ children }) {
  const [pedido, setPedido] = useState(null);
  const [avisos, setAvisos] = useState([]);
  const [completa, setCompleta] = useState(null);
  useEffect(() => {
    const cambio = () => setCompleta(document.fullscreenElement);
    document.addEventListener('fullscreenchange', cambio);
    return () => document.removeEventListener('fullscreenchange', cambio);
  }, []);

  const confirmar = useCallback((opciones) => new Promise((resolver) => setPedido({ ...opciones, resolver })), []);

  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Date.now() + Math.random();
    // At most three at a time: a pile would cover what the student is touching.
    setAvisos((a) => [...a.slice(-2), { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'error' ? 7000 : 4000);
  }, []);

  return (
    <Contexto.Provider value={{ confirmar, avisar }}>
      {children}
      {pedido && (
        <Dialogo
          key={pedido.titulo}
          pedido={pedido}
          responder={(valor) => {
            pedido.resolver(valor);
            setPedido(null);
          }}
        />
      )}
      {(() => {
        const lista = (
          <div className="avisos" role="status" aria-live="polite">
            {avisos.map((a) => (
              <p key={a.id} className={`aviso aviso--${a.tipo}`}>{a.texto}</p>
            ))}
          </div>
        );
        return completa ? createPortal(lista, completa) : lista;
      })()}
    </Contexto.Provider>
  );
}

export function useUI() {
  const v = useContext(Contexto);
  if (!v) throw new Error('useUI fuera de UIProvider');
  return v;
}
