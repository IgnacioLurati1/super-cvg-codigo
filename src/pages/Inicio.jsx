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
  const token = useToken();
  // Signed out it's the landing Google shows, with the long title; signed in, Hoy in a tab.
  useSeo({ titulo: token ? SITIO.nombre : SITIO.publicas[0].titulo, descripcion: SITIO.descripcion });
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
