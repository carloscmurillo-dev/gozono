import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type Access = 'any' | 'staff' | 'admin';

export function RequireAuth({ children, access = 'any' }: { children: ReactNode; access?: Access }) {
  const { status, profile, isStaff, isAdmin } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <div className="page-loading">Cargando…</div>;
  if (status === 'not-authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile) return <div className="page-loading">Cargando perfil…</div>;
  if (!profile.active) {
    return (
      <div className="page-loading">
        <p>Su cuenta está desactivada. Contacte al administrador de soporte.</p>
      </div>
    );
  }
  if (access === 'staff' && !isStaff) return <Navigate to="/tiquetes" replace />;
  if (access === 'admin' && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
