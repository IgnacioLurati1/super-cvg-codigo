import { leerLista } from '../../../lib/calculadoras/cifras';
import { desplegar } from '../../../lib/calculadoras/estadistica';
import { Opciones } from '../Hoja';
import { Dato, leerFilas, TablaTiza } from './_est-tiza';

// The data of a sample, written on the board one by one or as a frequency table (value and absolute frequency), as
// the notes of Probabilidad y Estadística give them (Tratamiento de datos, pág. 8 to 12). Shared by Medidas de datos
// and Diagrama de caja.

const COLUMNAS = [
  { clave: 'x', titulo: 'Valor', dicho: 'Valor', falta: 'el valor' },
  { clave: 'n', titulo: 'Frecuencia', dicho: 'Frecuencia absoluta', falta: 'la frecuencia', modo: 'numeric' },
];

const FORMAS = [
  { valor: 'sueltos', texto: 'Sueltos' },
  { valor: 'tabla', texto: 'En una tabla' },
];

/** What a sample looks like in memory: the list as typed and the table rows. */
export const muestra = ({ forma = 'sueltos', lista = '', filas = [{ x: '', n: '' }] }) => ({ forma, lista, filas });

/** A table of the notes as the board writes it: value and frequency, as text. */
export const filasDe = (valores, frecuencias) => valores.map((x, i) => ({ x: String(x).replace('.', ','), n: String(frecuencias[i]) }));

/**
 * Reads the sample. { datos } with every datum, or { error } with what failed and, for the table, the cell
 * ({ fila, columna }).
 */
export function leerMuestra(m, { minimo = 2 } = {}) {
  let datos;
  if (m.forma === 'tabla') {
    const r = leerFilas(m.filas, COLUMNAS, { lugar: 'columna' });
    if (r.error) return { error: r.error.mensaje, celda: r.error };
    const mala = r.valores.findIndex((f) => !Number.isInteger(f.n) || f.n < 0);
    if (mala >= 0) return { error: `La frecuencia de la columna ${mala + 1} tiene que ser un entero, 0 o más.`, celda: { fila: mala, columna: 1 } };
    datos = desplegar(r.valores);
  } else {
    const r = leerLista(m.lista, 2000);
    if (r.error) return { error: r.vacia ? 'Faltan los datos.' : r.error };
    datos = r.numeros;
  }
  if (datos.length < minimo) return { error: `Hacen falta por lo menos ${minimo} datos.` };
  return { datos };
}

/** The choice of how the data come and the data themselves, with the error next to them. */
export function DatosMuestra({ valor, alCambiar, leida }) {
  const cambiar = (cambio) => alCambiar({ ...valor, ...cambio });
  return (
    <>
      <Opciones leyenda="Los datos" nombre="forma" opciones={FORMAS} valor={valor.forma} alCambiar={(forma) => cambiar({ forma })} chica />
      {valor.forma === 'tabla' ? (
        <>
          <TablaTiza etiqueta="La tabla de frecuencias" columnas={COLUMNAS} filas={valor.filas} error={leida.celda} alCambiar={(filas) => cambiar({ filas })} vacia={{ x: '', n: '' }} max={60} horizontal nombreFilas="valores" singular="valor" articulo="Un" />
          {leida.error && <p className="campo__error" role="alert">{leida.error}</p>}
        </>
      ) : (
        <Dato nombre="Datos, separados por espacios o punto y coma" valor={valor.lista} alCambiar={(lista) => cambiar({ lista })} error={leida.error} ancho area modo="text" ayuda="Se puede escribir 3,5 o 3.5." />
      )}
    </>
  );
}
