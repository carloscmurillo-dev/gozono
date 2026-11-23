import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABEL } from '../lib/labels';
import { initials } from '../lib/format';
import { supabase } from '../lib/supabase';

export function Layout() {
  const { profile, isStaff, isAdmin, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingMessages, setPendingMessages] = useState(0);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!isStaff) return;
    supabase
      .from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('handled', false)
      .then(({ count }) => setPendingMessages(count ?? 0));
  }, [isStaff, location.pathname]);

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link');

  return (
    <div className="shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-top">
          <NavLink to="/" className="brand">
            <span className="logo-plate">
              <img src="/logo-gozono.png" alt="Grupo Ozono" />
            </span>
            <span>Soporte</span>
          </NavLink>
          <button
            type="button"
            className="menu-btn"
            aria-expanded={menuOpen}
            aria-controls="nav"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuOpen((o) => !o)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>

        <nav id="nav" aria-label="Menú del help desk" className="nav">
          {isStaff && (
            <NavLink to="/" end className={link}>
              Dashboard
            </NavLink>
          )}
          <NavLink
            to="/tiquetes"
            end
            className={({ isActive }) => link({ isActive: isActive && !location.search.includes('asignado=yo') })}>
            {isStaff ? 'Tiquetes' : 'Mis tiquetes'}
          </NavLink>
          {isStaff && (
            <NavLink to="/tiquetes?asignado=yo" className={() => (location.search.includes('asignado=yo') ? 'nav-link active' : 'nav-link')}>
              Mis asignados
            </NavLink>
          )}
          <NavLink to="/tiquetes/nuevo" className={link}>
            Nuevo tiquete
          </NavLink>
          {isStaff && (
            <>
              <span className="nav-section">Gestión</span>
              <NavLink to="/clientes" className={link}>
                Clientes
              </NavLink>
              <NavLink to="/mensajes" className={link}>
                <span>Mensajes del sitio</span>
                {pendingMessages > 0 && <span className="nav-count">{pendingMessages}</span>}
              </NavLink>
            </>
          )}
          {isAdmin && (
            <NavLink to="/usuarios" className={link}>
              Usuarios
            </NavLink>
          )}

          <div className="me">
            <span className="avatar" aria-hidden="true">
              {initials(profile?.full_name || profile?.email || '')}
            </span>
            <span className="me-text">
              <span className="me-name">{profile?.full_name || profile?.email}</span>
              <span className="me-role">{profile ? ROLE_LABEL[profile.role] : ''}</span>
            </span>
            <button type="button" className="link-btn" onClick={signOut}>
              Salir
            </button>
          </div>
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
