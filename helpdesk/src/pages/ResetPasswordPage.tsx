import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// Destino de los enlaces de invitación y de recuperación: supabase-js toma
// la sesión del enlace (detectSessionInUrl) y aquí se define la contraseña.
export function ResetPasswordPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError('Use al menos 10 caracteres, con mayúsculas, minúsculas y números.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else navigate('/', { replace: true });
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="logo-plate large">
          <img src="/logo-gozono.png" alt="Grupo Ozono" />
        </span>
        <h1>Defina su contraseña</h1>
        {status === 'checking' && <p className="muted">Validando enlace…</p>}
        {status === 'not-authenticated' && (
          <p className="alert error" role="alert">
            El enlace no es válido o ya expiró. Solicite uno nuevo desde «¿Olvidó su contraseña?».
          </p>
        )}
        {status === 'authenticated' && (
          <form onSubmit={onSubmit} className="form">
            <label>
              Nueva contraseña
              <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label>
              Confirmar contraseña
              <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <p className="hint">Mínimo 10 caracteres, con mayúsculas, minúsculas y números.</p>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
