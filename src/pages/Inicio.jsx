import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SITIO } from '../../sitio.config.js';
import { tomarDestino } from '../components/ConSesion';
import { TOKEN_DEMO } from '../lib/modoDemo';
import { useSeo } from '../lib/seo';
import { iniciarSesion, useToken } from '../lib/sesion';
import Entrar from './Entrar';
import Hoy from './Hoy';
import './panel.css';

export default function Inicio() {
  useSeo({ titulo: SITIO.nombre, descripcion: SITIO.descripcion });
  const token = useToken();
  const navegar = useNavigate();

  useEffect(() => {
    if (!token) return;
    const destino = tomarDestino();
    if (destino) navegar(destino, { replace: true });
  }, [token, navegar]);

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) iniciarSesion(TOKEN_DEMO);
  }, []);

  return token ? <Hoy /> : <Entrar />;
}
