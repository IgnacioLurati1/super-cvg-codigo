import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Campo from '../components/Campo';
import { nombreDelAnio } from '../lib/carrera';
import { normalizar } from '../lib/datos';
import { ENTRE_LINEAS, filasQueCoinciden } from '../lib/sysacadPestanas';
import { aniosDe, decimal, esTotal, filtrosDe, notaComoTexto, ordenar, sinMayusculas } from '../lib/sysacadVistas';

// How each copy of Sysacad is drawn, after Sysacad Lindo: what matters first, filters that say how many they leave,
// the subjects by year and each state in words (and in color, never only in color). Everything in the site's own
// pieces (filters, year bands, cards), so it takes the style the student chose.

// From this many rows, a table gets a search, as in Sysacad Lindo.
const FILAS_PARA_BUSCAR = 6;
// «Lo que más te frena» shows this many; the rest, behind «Ver más».
const FRENOS_A_LA_VISTA = 3;

const cantidad = (n, una, varias) => `${n} ${n === 1 ? una : varias}`;
const coincide = (texto, busqueda) => {
  const buscadas = normalizar(busqueda).split(/\s+/).filter(Boolean);
  const n = normalizar(texto);
  return buscadas.every((p) => n.includes(p));
};

/** Lines inside a cell or a paragraph come joined: each goes on its own line. */
export function Lineas({ texto }) {
  const partes = texto.split(ENTRE_LINEAS);
  return partes.length === 1 ? texto : partes.map((p, i) => <span key={i} className="sysacad-linea">{p}</span>);
}

/** A row of filters: its name, then one button per option with how many it leaves. */
function Filtro({ nombre, opciones, valor, cambiar }) {
  return (
    <div className="sysacad-filtro">
      <span className="sysacad-filtro__nombre" aria-hidden="true">{nombre}</span>
      <div className="tipos" role="group" aria-label={nombre}>
        {opciones.map((o, i) => (
          <button key={i} type="button" className="tipos__opcion" aria-pressed={valor === o.valor} onClick={() => cambiar(o.valor)}>
            {o.texto}
            {o.cuantas !== undefined && <span className="sysacad-filtro__cuenta">{o.cuantas}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Buscador({ etiqueta, valor, cambiar }) {
  return (
    <div className="sysacad-buscar">
      <Campo etiqueta={etiqueta}>
        <input className="campo__control" type="search" enterKeyHint="search" autoComplete="off" spellCheck="false" maxLength={200} value={valor} onChange={(e) => cambiar(e.target.value)} />
      </Campo>
    </div>
  );
}

/** What the filters left: said to a screen reader, and on screen when it is nothing, with the way back to all. */
function Cuenta({ hay, de, que, busqueda, filtrando, limpiar }) {
  const texto = !filtrando ? '' : hay ? `${hay} de ${de} ${que}` : busqueda.trim() ? `Ninguna tiene «${busqueda.trim()}» con estos filtros` : 'Ninguna con estos filtros';
  return (
    <div className="sysacad-cuenta-fila">
      <p className={`sysacad-cuenta${hay ? ' solo-lectores' : ''}`} role="status">{texto}</p>
      {filtrando && !hay && <button type="button" className="boton boton--secundario boton--chico" onClick={limpiar}>Ver todas</button>}
    </div>
  );
}

/** A band per year, like Tu carrera: the number big and quiet, the name and how far along it is. `desplazable`: its
 * table can be wider than the sheet, so it scrolls and takes the keyboard. */
function Anio({ anio, cuenta, desplazable = false, children }) {
  return (
    <section className="sysacad-anio">
      <div className="sysacad-anio__cabeza">
        {anio !== null && <span className="sysacad-anio__numero" aria-hidden="true">{anio}</span>}
        <h3 className="sysacad-anio__titulo">{nombreDelAnio(anio)}</h3>
        {cuenta && <p className="sysacad-anio__cuenta">{cuenta}</p>}
      </div>
      {desplazable ? (
        <div className="sysacad-tabla" role="region" aria-label={`Tabla de ${nombreDelAnio(anio).toLocaleLowerCase('es-AR')}`} tabIndex={0}>
          {children}
        </div>
      ) : (
        <div className="sysacad-tabla">{children}</div>
      )}
    </section>
  );
}

// ---------- Estado académico ----------

// As in Sysacad Lindo, each state counts the subjects of the career, and the electives have their own filter.
const ESTADOS = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'aprobada', texto: 'Aprobadas' },
  { valor: 'regular', texto: 'Regulares' },
  { valor: 'cursando', texto: 'Cursando' },
  { valor: 'pendiente', texto: 'Sin cursar' },
  { valor: 'otro', texto: 'Otras' },
  { valor: 'electivas', texto: 'Electivas' },
];

function Resumen({ datos }) {
  const { promedio, notas, total, aprobadas, regulares, cursando, sinCursar, electivas } = datos;
  const parte = (n) => `${total ? (n / total) * 100 : 0}%`;
  const otras = [
    regulares && cantidad(regulares, 'regular', 'regulares'),
    cursando && `${cursando} cursando`,
    sinCursar && `${sinCursar} sin cursar`,
  ].filter(Boolean);
  return (
    <div className="sysacad-cifras">
      {promedio !== null && (
        <div className="sysacad-cifra sysacad-cifra--promedio">
          <p className="sysacad-cifra__numero">{decimal(promedio)}</p>
          <p className="sysacad-cifra__texto">Promedio de {cantidad(notas, 'nota', 'notas')}</p>
        </div>
      )}
      {total > 0 && (
        <div className="sysacad-cifra sysacad-cifra--avance">
          <p className="sysacad-cifra__titulo">{aprobadas} de {cantidad(total, 'materia aprobada', 'materias aprobadas')}</p>
          <div className="sysacad-barra" role="img" aria-label={`${aprobadas} aprobadas, ${regulares} regulares y ${cursando} cursando, de ${total}`}>
            <span className="sysacad-barra__parte sysacad-barra__parte--aprobada" style={{ width: parte(aprobadas) }} />
            <span className="sysacad-barra__parte sysacad-barra__parte--regular" style={{ width: parte(regulares) }} />
            <span className="sysacad-barra__parte sysacad-barra__parte--cursando" style={{ width: parte(cursando) }} />
          </div>
          {otras.length > 0 && (
            <p className="sysacad-cifra__pie">
              {otras.map((o) => <span key={o}>{o}</span>)}
            </p>
          )}
        </div>
      )}
      {electivas.total > 0 && (
        <div className="sysacad-cifra sysacad-cifra--electivas">
          <p className="sysacad-cifra__titulo">Electivas</p>
          <p className="sysacad-cifra__texto">
            Van aparte del avance y entran en el promedio. Tenés {cantidad(electivas.aprobadas, 'aprobada', 'aprobadas')}
            {electivas.horas ? ` (${electivas.horas} hs)` : ''} y {cantidad(electivas.regulares, 'regular', 'regulares')}.
          </p>
        </div>
      )}
    </div>
  );
}

export function EstadoAcademico({ datos }) {
  const [busqueda, setBusqueda] = useState('');
  const [anio, setAnio] = useState('todos');
  const [estado, setEstado] = useState('todas');
  const { materias } = datos;
  const anios = useMemo(() => aniosDe(materias), [materias]);
  const cuantas = {
    otro: materias.filter((m) => m.deLaCarrera && m.tipo === 'otro').length,
    aprobada: datos.aprobadas,
    regular: datos.regulares,
    cursando: datos.cursando,
    pendiente: datos.sinCursar,
    electivas: datos.electivas.total,
  };
  const pasa = (m) => (anio === 'todos' || m.anio === anio)
    && (estado === 'todas' || (estado === 'electivas' ? m.electiva : m.deLaCarrera && m.tipo === estado))
    && coincide(m.nombre, busqueda);
  const visibles = materias.filter(pasa);
  const conRegistro = materias.some((m) => m.registro);
  const conHoras = materias.some((m) => m.horas);
  const filtrando = anio !== 'todos' || estado !== 'todas' || busqueda.trim() !== '';

  return (
    <>
      <Resumen datos={datos} />
      <div className="sysacad-filtros">
        <Buscador etiqueta="Buscar materia" valor={busqueda} cambiar={setBusqueda} />
        {anios.length > 1 && (
          <Filtro
            nombre="Año"
            valor={anio}
            cambiar={setAnio}
            opciones={[{ valor: 'todos', texto: 'Todos' }, ...anios.map((a) => ({ valor: a, texto: a === 0 ? 'Ingreso' : a === null ? 'Sin año' : `${a}°` }))]}
          />
        )}
        <Filtro nombre="Estado" valor={estado} cambiar={setEstado} opciones={ESTADOS.filter((e) => e.valor === 'todas' || cuantas[e.valor]).map((e) => (e.valor === 'todas' ? e : { ...e, cuantas: cuantas[e.valor] }))} />
      </div>
      <Cuenta hay={visibles.length} de={materias.length} que="materias" busqueda={busqueda} filtrando={filtrando} limpiar={() => { setBusqueda(''); setAnio('todos'); setEstado('todas'); }} />
      {aniosDe(visibles).map((a) => {
        const delAnio = materias.filter((m) => m.anio === a);
        const deLaCarrera = delAnio.filter((m) => m.deLaCarrera);
        const aprobadas = deLaCarrera.filter((m) => m.tipo === 'aprobada').length;
        // The subjects of the plan first, then the electives, each in Sysacad's order.
        const filas = visibles.filter((m) => m.anio === a).sort((x, y) => x.electiva - y.electiva);
        return (
          <Anio key={a ?? 'sin'} anio={a} cuenta={deLaCarrera.length ? `${aprobadas} de ${deLaCarrera.length} aprobadas` : cantidad(delAnio.length, 'electiva', 'electivas')}>
            {/* On a phone the rows become cards: the roles keep it a table for a screen reader. */}
            <table className="sysacad-tabla__tabla sysacad-tabla__tabla--tarjetas" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">Materia</th>
                  <th scope="col" role="columnheader" className="sysacad-col-estado">Estado</th>
                  {conRegistro && <th scope="col" role="columnheader" className="sysacad-col-registro">Registro</th>}
                  {conHoras && <th scope="col" role="columnheader" className="sysacad-num sysacad-col-horas">Horas</th>}
                  <th scope="col" role="columnheader" className="sysacad-num sysacad-col-nota">Nota</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {filas.map((m, i) => (
                  <tr key={`${m.nombre}-${i}`} role="row">
                    <td role="cell" className="sysacad-materia">{m.nombre}</td>
                    <td role="cell"><span className={`sysacad-estado-de sysacad-estado-de--${m.tipo}`}>{m.dice}</span></td>
                    {conRegistro && <td role="cell" className="sysacad-suave sysacad-col-registro">{m.registro}</td>}
                    {conHoras && <td role="cell" className="sysacad-num sysacad-suave">{m.horas ? `${m.horas} hs` : ''}</td>}
                    <td role="cell" className="sysacad-num sysacad-nota">{m.nota !== null ? notaComoTexto(m.nota) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Anio>
        );
      })}
    </>
  );
}

// ---------- Correlatividad para cursar / para rendir ----------

function Frenos({ frenos, verbo }) {
  const fila = (f) => (
    <li key={f.nombre} className="sysacad-freno">
      <span className="sysacad-freno__nombre">{f.nombre}</span>
      <span className="sysacad-freno__cuantas">frena {f.cuantas} materias</span>
    </li>
  );
  const resto = frenos.slice(FRENOS_A_LA_VISTA);
  return (
    <div className="sysacad-cifra sysacad-cifra--frenos">
      <p className="sysacad-cifra__titulo">Lo que más te frena</p>
      <ul className="sysacad-frenos">{frenos.slice(0, FRENOS_A_LA_VISTA).map(fila)}</ul>
      {resto.length > 0 && (
        <details className="sysacad-frenos__mas">
          <summary>Ver {resto.length} más</summary>
          <ul className="sysacad-frenos">{resto.map(fila)}</ul>
        </details>
      )}
      <p className="sysacad-cifra__nota">
        En <Link to="/carrera">Tu carrera</Link> podés suponer que la sacás y ver qué te queda para {verbo}.
      </p>
    </div>
  );
}

export function Correlativas({ datos, para }) {
  const [busqueda, setBusqueda] = useState('');
  const [anio, setAnio] = useState('todos');
  const [situacion, setSituacion] = useState('todas');
  const [tipo, setTipo] = useState('todas');
  const { materias, pueden, total, frenos } = datos;
  const verbo = para === 'rendir' ? 'rendir' : 'cursar';
  const anios = useMemo(() => aniosDe(materias), [materias]);
  const electivas = materias.filter((m) => m.electiva).length;
  const pasa = (m) => (anio === 'todos' || m.anio === anio)
    && (situacion === 'todas' || (situacion === 'puede') === m.puede)
    && (tipo === 'todas' || (tipo === 'electivas') === m.electiva)
    && coincide(m.nombre, busqueda);
  const visibles = materias.filter(pasa);
  const filtrando = anio !== 'todos' || situacion !== 'todas' || tipo !== 'todas' || busqueda.trim() !== '';

  return (
    <>
      <div className="sysacad-cifras">
        <div className="sysacad-cifra sysacad-cifra--promedio">
          <p className="sysacad-cifra__numero">{pueden}</p>
          <p className="sysacad-cifra__texto">de {total} podés {verbo}</p>
        </div>
        {frenos.length > 0 && <Frenos frenos={frenos} verbo={verbo} />}
      </div>
      <div className="sysacad-filtros">
        <Buscador etiqueta="Buscar materia" valor={busqueda} cambiar={setBusqueda} />
        {anios.length > 1 && (
          <Filtro
            nombre="Año"
            valor={anio}
            cambiar={setAnio}
            opciones={[{ valor: 'todos', texto: 'Todos' }, ...anios.map((a) => ({ valor: a, texto: a === 0 ? 'Ingreso' : a === null ? 'Sin año' : `${a}°` }))]}
          />
        )}
        <Filtro
          nombre="Situación"
          valor={situacion}
          cambiar={setSituacion}
          opciones={[
            { valor: 'todas', texto: 'Todas' },
            { valor: 'puede', texto: `Podés ${verbo}`, cuantas: pueden },
            { valor: 'falta', texto: 'Te falta algo', cuantas: total - pueden },
          ]}
        />
        {electivas > 0 && electivas < total && (
          <Filtro
            nombre="Tipo"
            valor={tipo}
            cambiar={setTipo}
            opciones={[
              { valor: 'todas', texto: 'Todas' },
              { valor: 'obligatorias', texto: 'Obligatorias', cuantas: total - electivas },
              { valor: 'electivas', texto: 'Electivas', cuantas: electivas },
            ]}
          />
        )}
      </div>
      <Cuenta hay={visibles.length} de={total} que="materias" busqueda={busqueda} filtrando={filtrando} limpiar={() => { setBusqueda(''); setAnio('todos'); setSituacion('todas'); setTipo('todas'); }} />
      {aniosDe(visibles).map((a) => {
        const delAnio = materias.filter((m) => m.anio === a);
        const filas = visibles.filter((m) => m.anio === a).sort((x, y) => x.electiva - y.electiva);
        return (
          <Anio key={a ?? 'sin'} anio={a} cuenta={`${delAnio.filter((m) => m.puede).length} de ${delAnio.length} podés ${verbo}`}>
            <table className="sysacad-tabla__tabla sysacad-tabla__tabla--tarjetas" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">Materia</th>
                  <th scope="col" role="columnheader" className="sysacad-col-falta">Qué te falta</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {filas.map((m, i) => (
                  <tr key={`${m.nombre}-${i}`} role="row">
                    <td role="cell" className="sysacad-materia">{m.nombre}</td>
                    <td role="cell">
                      {m.puede ? (
                        <span className="sysacad-estado-de sysacad-estado-de--aprobada">Podés {verbo}</span>
                      ) : (
                        m.faltan.map((f, j) => <span key={j} className="sysacad-linea">{f}</span>)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Anio>
        );
      })}
    </>
  );
}

// ---------- Certificados ----------

// The student's name on top of the page: it says nothing here.
const esNombre = (texto) => /^[^,\d]{2,80},\s*[^,\d]{2,100}$/.test(texto.trim());

export function Certificados({ bloques }) {
  const avisos = [];
  const certificados = [];
  const otros = [];
  for (const b of bloques) {
    if (b.t === 'titulo' && esNombre(b.texto)) continue;
    if (b.t === 'texto' && /^descarga/i.test(b.texto.trim())) continue;
    if (b.t === 'texto' && /importante|al generar/i.test(b.texto)) avisos.push(sinMayusculas(b.texto));
    else if (b.t === 'texto') certificados.push(b.texto);
    else otros.push(b);
  }
  if (!certificados.length) return <Bloques bloques={bloques} de="Certificados" />;
  return (
    <>
      <p className="sysacad-copia__parrafo">Se bajan desde Sysacad.</p>
      <ul className="sysacad-certificados">
        {certificados.map((c, i) => (
          <li key={i} className="sysacad-certificado">{c}</li>
        ))}
      </ul>
      {avisos.map((a, i) => <p key={i} className="sysacad-nota-al-pie">{a}</p>)}
      <Bloques bloques={otros} de="Certificados" />
    </>
  );
}

// ---------- Any other table, and the rest of a copy ----------

const anioDeCelda = (texto) => {
  const n = Number.parseInt(texto ?? '', 10);
  return Number.isSafeInteger(n) && n >= 0 && n <= 9 ? n : null;
};

/** The share of the width each shown column takes, by its longest line (a long one wraps), the same in every band so
 * they line up; and the least the table can measure before it scrolls sideways, so no title runs into the next. */
function anchosDe(columnas, filas, mostrar) {
  const largo = (t) => Math.max(...String(t ?? '').split(ENTRE_LINEAS).map((l) => l.length));
  // A few characters more for the room between columns.
  const anchos = mostrar.map((j) => 3 + Math.max(largo(columnas[j]), Math.min(24, Math.max(4, ...filas.map((f) => largo(f[j]))))));
  const total = anchos.reduce((x, y) => x + y, 0);
  return { partes: anchos.map((x) => `${(x / total) * 100}%`), minimo: `${Math.round(total * 0.78)}ch` };
}

/** The table itself: its titles, sortable when `setOrden` comes, and the rows, only the columns in `mostrar`. */
function Grilla({ columnas, mostrar, filas, orden, setOrden, anchos, materia }) {
  return (
    <table className="sysacad-tabla__tabla" style={anchos ? { minWidth: anchos.minimo } : undefined}>
      {anchos && (
        <colgroup>
          {anchos.partes.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
      )}
      {columnas.length > 0 && (
        <thead>
          <tr>
            {mostrar.map((i) => {
              const c = columnas[i];
              const actual = orden?.indice === i;
              return (
                <th key={i} scope="col" aria-sort={actual ? (orden.sube ? 'ascending' : 'descending') : undefined}>
                  {setOrden && c ? (
                    <button type="button" className="sysacad-orden" onClick={() => setOrden(actual ? { indice: i, sube: !orden.sube } : { indice: i, sube: true })}>
                      {c}
                      <span className="sysacad-orden__flecha" aria-hidden="true" data-sube={actual ? String(orden.sube) : undefined} />
                    </button>
                  ) : c}
                </th>
              );
            })}
          </tr>
        </thead>
      )}
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            {(columnas.length ? mostrar : f.map((_, j) => j)).map((j) => (
              <td key={j} className={j === materia ? 'sysacad-materia' : undefined}><Lineas texto={f[j] ?? ''} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A table of Sysacad the Sysacad Lindo way: from six rows a search, filters by the columns that repeat, and sorting
 * by any column. Sysacad's total rows go under it, apart. */
export function Tabla({ tabla, de }) {
  const id = useId();
  const { columnas } = tabla;
  const lista = useMemo(() => tabla.filas.filter((f) => !esTotal(f, columnas)), [tabla, columnas]);
  const totales = tabla.filas.filter((f) => esTotal(f, columnas));
  const filtros = useMemo(() => filtrosDe(columnas, lista), [columnas, lista]);
  const [busqueda, setBusqueda] = useState('');
  const [elegidos, setElegidos] = useState({});
  const [orden, setOrden] = useState(null);
  const conBuscar = lista.length >= FILAS_PARA_BUSCAR;
  const pasa = (f) => filtros.every((x) => elegidos[x.indice] === undefined || (f[x.indice] ?? '').trim() === elegidos[x.indice]);
  const filtradas = filasQueCoinciden(lista.filter(pasa), conBuscar ? busqueda : '');
  const visibles = orden ? ordenar(filtradas, orden.indice, orden.sube) : filtradas;
  const filtrando = Object.keys(elegidos).length > 0 || (conBuscar && busqueda.trim() !== '');
  const nombre = tabla.titulo ?? `Tabla de ${de}`;
  const ordenable = columnas.length > 1 && lista.length > 1;
  // With a year for each subject, a band per year, like the rest of the career; the year leaves the columns.
  const nombres = columnas.map((c) => normalizar(c).trim());
  const colAnio = nombres.indexOf('ano');
  const colMateria = nombres.indexOf('materia');
  const porAnio = colAnio >= 0 && colMateria >= 0 && new Set(lista.map((f) => anioDeCelda(f[colAnio]))).size > 1;
  const mostrar = columnas.map((_, i) => i).filter((i) => !porAnio || i !== colAnio);
  const anchos = useMemo(() => (porAnio ? anchosDe(columnas, lista, columnas.map((_, i) => i).filter((i) => i !== colAnio)) : null), [porAnio, colAnio, columnas, lista]);

  if (!lista.length && !totales.length) {
    return tabla.titulo ? <h3 className="sysacad-copia__subtitulo">{tabla.titulo}</h3> : null;
  }
  return (
    <div className="sysacad-bloque-tabla">
      {tabla.titulo && <h3 id={`${id}-titulo`} className="sysacad-copia__subtitulo">{tabla.titulo}</h3>}
      {(conBuscar || filtros.length > 0) && (
        <div className="sysacad-filtros">
          {conBuscar && <Buscador etiqueta={tabla.titulo ? `Buscar en ${tabla.titulo}` : `Buscar en ${de}`} valor={busqueda} cambiar={setBusqueda} />}
          {filtros.map((x) => (
            <Filtro
              key={x.indice}
              nombre={x.nombre}
              valor={elegidos[x.indice] ?? null}
              cambiar={(v) => setElegidos(({ [x.indice]: _, ...resto }) => (v === null ? resto : { ...resto, [x.indice]: v }))}
              opciones={[{ valor: null, texto: 'Todos' }, ...x.valores.map((v) => ({ valor: v.valor, texto: v.valor, cuantas: v.cuantas }))]}
            />
          ))}
        </div>
      )}
      <Cuenta hay={visibles.length} de={lista.length} que="filas" busqueda={busqueda} filtrando={filtrando} limpiar={() => { setBusqueda(''); setElegidos({}); }} />
      {visibles.length > 0 && porAnio && (
        aniosDe(visibles.map((f) => ({ anio: anioDeCelda(f[colAnio]) }))).map((a) => {
          const delAnio = visibles.filter((f) => anioDeCelda(f[colAnio]) === a);
          return (
            <Anio key={a ?? 'sin'} anio={a} desplazable cuenta={cantidad(lista.filter((f) => anioDeCelda(f[colAnio]) === a).length, 'materia', 'materias')}>
              <Grilla columnas={columnas} mostrar={mostrar} filas={delAnio} orden={orden} setOrden={ordenable ? setOrden : null} anchos={anchos} materia={colMateria} />
            </Anio>
          );
        })
      )}
      {visibles.length > 0 && !porAnio && (
        <div className="sysacad-tabla" role="region" aria-labelledby={tabla.titulo ? `${id}-titulo` : undefined} aria-label={tabla.titulo ? undefined : nombre} tabIndex={0}>
          <Grilla columnas={columnas} mostrar={mostrar} filas={visibles} orden={orden} setOrden={ordenable ? setOrden : null} materia={colMateria} />
        </div>
      )}
      {totales.map((f, i) => <p key={i} className="sysacad-total">{f.filter(Boolean).join(' ')}</p>)}
    </div>
  );
}

/** Titles, paragraphs and tables of a copy, in their order. */
export function Bloques({ bloques, de }) {
  return bloques.map((b, i) => {
    if (b.t === 'titulo') return <h3 key={i} className="sysacad-copia__subtitulo">{b.texto}</h3>;
    if (b.t === 'texto') return <p key={i} className="sysacad-copia__parrafo"><Lineas texto={sinMayusculas(b.texto)} /></p>;
    return <Tabla key={i} tabla={b} de={de} />;
  });
}
