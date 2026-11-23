import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, errorMessage } from '../lib/supabase';
import type { ContactMessage } from '../lib/types';
import { formatDateTime } from '../lib/format';

// Mensajes del formulario de contacto de gozono.com.
export function MessagesPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [showHandled, setShowHandled] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    let q = supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
    if (!showHandled) q = q.eq('handled', false);
    q.then(({ data, error: err }) => {
      if (err) setError(errorMessage(err));
      else setMessages((data as ContactMessage[]) ?? []);
    });
  };

  useEffect(load, [showHandled]);

  const toggle = async (m: ContactMessage) => {
    const { error: err } = await supabase
      .from('contact_messages')
      .update({ handled: !m.handled, handled_by: m.handled ? null : profile?.id })
      .eq('id', m.id);
    if (err) setError(errorMessage(err));
    load();
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Mensajes del sitio</h1>
          <p className="muted">Lo que llega por el formulario de contacto de gozono.com.</p>
        </div>
        <label className="check">
          <input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} />
          Mostrar atendidos
        </label>
      </header>

      {error && <p className="alert error">{error}</p>}

      <div className="message-list">
        {messages.map((m) => (
          <article key={m.id} className={m.handled ? 'panel contact handled' : 'panel contact'}>
            <header className="contact-head">
              <div>
                <strong>{m.name}</strong>
                <span className="muted">
                  {' '}
                  · <a href={`mailto:${m.email}`}>{m.email}</a>
                  {m.phone && <> · {m.phone}</>}
                </span>
              </div>
              <time className="muted" dateTime={m.created_at}>
                {formatDateTime(m.created_at)}
              </time>
            </header>
            <p className="contact-body">{m.message}</p>
            <div className="contact-actions">
              <a className="btn ghost small" href={`mailto:${m.email}?subject=${encodeURIComponent('Re: su consulta a Grupo Ozono')}`}>
                Responder por correo
              </a>
              <button type="button" className="btn ghost small" onClick={() => toggle(m)}>
                {m.handled ? 'Marcar pendiente' : 'Marcar atendido'}
              </button>
            </div>
          </article>
        ))}
        {messages.length === 0 && <p className="muted">No hay mensajes {showHandled ? '' : 'pendientes'}.</p>}
      </div>
    </div>
  );
}
