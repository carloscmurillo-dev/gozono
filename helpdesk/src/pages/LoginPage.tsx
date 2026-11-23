import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    if (mode === 'login') {
      const err = await signIn(email.trim(), password);
      if (err) setError(err);
    } else {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/restablecer`,
      });
      if (err) setError(err.message);
      else setInfo('Si el correo está registrado, recibirá un enlace para definir una nueva contraseña.');
    }
    setBusy(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="logo-plate large">
          <img src="/logo-gozono.png" alt="Grupo Ozono" />
        </span>
        <h1>{mode === 'login' ? 'Portal de soporte' : 'Recuperar contraseña'}</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Ingrese con el correo y la contraseña que le asignó Grupo Ozono.'
            : 'Le enviaremos un enlace para definir una nueva contraseña.'}
        </p>
        <form onSubmit={onSubmit} className="form">
          <label>
            Correo electrónico
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode === 'login' && (
            <label>
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="alert ok" role="status">
              {info}
            </p>
          )}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Iniciar sesión' : 'Enviar enlace'}
          </button>
        </form>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'forgot' : 'login');
            setError('');
            setInfo('');
          }}>
          {mode === 'login' ? '¿Olvidó su contraseña?' : 'Volver a iniciar sesión'}
        </button>
        <p className="auth-foot muted">
          ¿No tiene cuenta? Escriba a <a href="mailto:info@gozono.com">info@gozono.com</a> o llame al +506 2297-4585.
        </p>
      </div>
    </div>
  );
}
