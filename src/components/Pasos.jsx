import './Pasos.css';

// La barra de un formulario por pasos. Los pasos ya hechos se pueden tocar para volver; los que siguen, no.
//   <Pasos pasos={['Tus datos', 'Tu pedido', 'Revisar']} actual={paso} alElegir={setPaso} />
export default function Pasos({ pasos, actual, alElegir }) {
  return (
    <nav aria-label="Pasos">
      <ol className="pasos-guia">
        {pasos.map((nombre, i) => (
          <li key={nombre} className="pasos-guia__paso" data-estado={i < actual ? 'hecho' : i === actual ? 'actual' : 'falta'}>
            {i < actual ? (
              <button type="button" className="pasos-guia__boton" onClick={() => alElegir(i)}>
                {nombre}
              </button>
            ) : (
              <span aria-current={i === actual ? 'step' : undefined}>{nombre}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
