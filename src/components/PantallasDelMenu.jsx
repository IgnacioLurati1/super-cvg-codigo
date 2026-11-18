import { useId, useState } from 'react';
import { EN_EL_MENU, ordenarMenu, ponerEnElMenu, useAjustes } from '../lib/ajustes';
import { pantallasConAtajo } from '../lib/atajos';
import { useArrastreDeSecciones } from '../lib/useArrastreDeSecciones';
import { useMoverConManija } from '../lib/useSecciones';
import { IconoMenu, PANTALLAS_DEL_MENU } from '../layouts/Menu';
import './pantallasDelMenu.css';

const LUGARES = [
  { valor: 'vista', nombre: 'A la vista' },
  { valor: 'mas', nombre: 'En «Más»' },
  { valor: 'oculta', nombre: 'Oculta' },
];

const idDeFila = (clave) => `lugar-menu-${clave}`;
const idDeManija = (clave) => `manija-menu-${clave}`;

const Manija = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="9" cy="6" r="2" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /><circle cx="15" cy="18" r="2" />
  </svg>
);

/** One screen of the menu: its handle to move it, and where it goes. Configuración is never hidden: it's the way back. */
function Pantalla({ m, lugar, numero, agarrada, moviendo, puesto, total, manija, alElegir, alMover }) {
  const id = useId();
  const opciones = m.clave === 'configuracion' ? LUGARES.slice(0, 2) : LUGARES;
  return (
    <li id={idDeFila(m.clave)} className="lugar-menu" data-agarrada={agarrada || undefined}>
      <span className="lugar-menu__agarre">
        <button id={idDeManija(m.clave)} type="button" className="lugar-menu__manija" aria-label={`Mover ${m.texto}`} aria-describedby="mover-pantalla-ayuda" aria-expanded={moviendo} {...manija}>
          <Manija />
        </button>
        {moviendo && (
          <span className="seccion__mover lugar-menu__mover" role="group" aria-label={`Mover ${m.texto}`}>
            {[['subir', 'Subir', -1], ['bajar', 'Bajar', 1]].map(([clave, texto, salto]) => {
              const fuera = puesto + salto < 0 || puesto + salto >= total;
              return (
                <button
                  key={clave}
                  id={`mover-${clave}-${m.clave}`}
                  type="button"
                  className="boton boton--secundario boton--chico"
                  aria-disabled={fuera ? 'true' : undefined}
                  onClick={() => !fuera && alMover(`mover-${clave}-${m.clave}`, puesto + salto)}
                >
                  {texto}
                </button>
              );
            })}
          </span>
        )}
      </span>
      <span id={id} className="lugar-menu__nombre">
        <IconoMenu nombre={m.clave} />
        {m.texto}
        {/* Teclado lists them for everyone: here, a reminder for whoever has a keyboard at hand. */}
        {numero && <kbd className="lugar-menu__atajo" aria-hidden="true">Alt {numero}</kbd>}
      </span>
      <span className="lugar-menu__opciones" role="radiogroup" aria-labelledby={id}>
        {opciones.map((o) => (
          <label key={o.valor} className="lugar-menu__opcion">
            <input type="radio" name={`menu-${m.clave}`} value={o.valor} checked={lugar === o.valor} onChange={() => alElegir(o.valor)} />
            {o.nombre}
          </label>
        ))}
      </span>
    </li>
  );
}

/**
 * The screens of the menu, in its order: where each one goes, and the order itself, dragged by the handle (or with the
 * arrows on it, or with «Subir» and «Bajar» from a tap). The order is also the one of Alt and a number: each row says
 * its number. `alFallar`: the browser didn't save the change.
 */
export default function PantallasDelMenu({ alFallar }) {
  const { menu } = useAjustes();
  const pantallas = menu.orden.map((c) => PANTALLAS_DEL_MENU.find((m) => m.clave === c)).filter(Boolean);
  const ids = pantallas.map((m) => m.clave);
  const numeros = Object.fromEntries(pantallasConAtajo(menu.orden).map((p) => [p.clave, p.numero]));
  const comoVino = ids.join() === EN_EL_MENU.join();
  const [anuncio, setAnuncio] = useState('');
  const { moviendo, setMoviendo, enfocarMover } = useMoverConManija(idDeManija);

  const mover = (clave, lugar) => {
    const desde = ids.indexOf(clave);
    if (lugar < 0 || lugar >= ids.length || lugar === desde) return;
    const nuevo = ids.filter((c) => c !== clave);
    nuevo.splice(lugar, 0, clave);
    if (!ordenarMenu(nuevo)) alFallar();
    setAnuncio(`${pantallas[desde].texto} quedó en el lugar ${lugar + 1} de ${ids.length}`);
  };
  const { arrastrada, manija } = useArrastreDeSecciones({
    ids,
    elDe: (clave) => document.getElementById(idDeFila(clave)),
    manijaDe: (clave) => document.getElementById(idDeManija(clave)),
    alMover: mover,
    alTocar: (clave) => setMoviendo((m) => (m === clave ? null : clave)),
  });

  const volverAlOrden = () => {
    if (!ordenarMenu(EN_EL_MENU)) alFallar();
    setMoviendo(null);
    setAnuncio('Volvió el orden de siempre');
  };

  return (
    <div className="ajustes__grupo">
      <h3 className="ajustes__leyenda">Qué pantallas aparecen</h3>
      <p className="ajustes__ayuda">Arrastralas para ordenarlas. Alt y un número siguen este orden. Las que van en «Más» quedan a un toque. Las ocultas, en la compu, se abren igual con Alt y su número.</p>
      <p id="mover-pantalla-ayuda" hidden>Arrastrala, movela con las flechas arriba y abajo, o tocala para subirla o bajarla.</p>
      <p role="status" className="solo-lectores">{anuncio}</p>
      <ul className="lugares-menu" data-arrastrando={arrastrada !== null || undefined}>
        {pantallas.map((m, i) => (
          <Pantalla
            key={m.clave}
            m={m}
            lugar={menu.lugares[m.clave] ?? 'vista'}
            numero={numeros[m.clave]}
            agarrada={arrastrada === m.clave}
            moviendo={moviendo === m.clave && arrastrada === null}
            puesto={i}
            total={ids.length}
            manija={manija(m.clave)}
            alElegir={(lugar) => {
              if (!ponerEnElMenu(m.clave, lugar)) alFallar();
            }}
            alMover={(boton, lugar) => {
              enfocarMover.current = boton;
              mover(m.clave, lugar);
            }}
          />
        ))}
      </ul>
      {!comoVino && (
        <div className="ajustes__botones">
          <button type="button" className="boton boton--secundario" onClick={volverAlOrden}>Volver al orden de siempre</button>
        </div>
      )}
    </div>
  );
}
