import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, errorMessage } from '../lib/supabase';
import { openAttachment, uploadAttachments } from '../lib/attachments';
import {
  TICKET_SELECT,
  type Attachment,
  type Category,
  type Comment,
  type Profile,
  type TicketEvent,
  type TicketPriority,
  type TicketRow,
  type TicketStatus,
} from '../lib/types';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../lib/labels';
import { formatBytes, formatDateTime, initials, timeAgo } from '../lib/format';
import { DueBadge, PriorityBadge, StatusBadge } from '../components/Badges';
import { FilePicker } from '../components/FilePicker';

type TimelineItem =
  | { kind: 'comment'; at: string; comment: Comment; files: Attachment[] }
  | { kind: 'event'; at: string; event: TicketEvent };

const EVENT_TEXT: Record<TicketEvent['event_type'], (e: TicketEvent) => string> = {
  creado: () => 'creó el tiquete',
  estado: (e) =>
    `cambió el estado de ${STATUS_LABEL[e.from_value as TicketStatus] ?? e.from_value} a ${STATUS_LABEL[e.to_value as TicketStatus] ?? e.to_value}`,
  prioridad: (e) =>
    `cambió la prioridad de ${PRIORITY_LABEL[e.from_value as TicketPriority] ?? e.from_value} a ${PRIORITY_LABEL[e.to_value as TicketPriority] ?? e.to_value}`,
  asignado: (e) => (e.to_value ? `asignó el tiquete a ${e.to_value}` : 'quitó la asignación'),
  categoria: (e) => `cambió la categoría a ${e.to_value ?? 'ninguna'}`,
};

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { profile, isStaff } = useAuth();

  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [replyStatus, setReplyStatus] = useState<TicketStatus | ''>('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const uploadFailed = (location.state as { uploadFailed?: string[] } | null)?.uploadFailed;

  const loadTicket = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase.from('tickets').select(TICKET_SELECT).eq('id', id).maybeSingle();
    if (err) setError(errorMessage(err));
    else if (!data) setNotFound(true);
    else setTicket(data as TicketRow);
  }, [id]);

  const loadThread = useCallback(async () => {
    if (!id) return;
    const [c, a, ev] = await Promise.all([
      supabase
        .from('ticket_comments')
        .select('*, author:profiles!ticket_comments_author_id_fkey(id, full_name, email, role)')
        .eq('ticket_id', id)
        .order('created_at'),
      supabase.from('ticket_attachments').select('*').eq('ticket_id', id).order('created_at'),
      supabase
        .from('ticket_events')
        .select('*, actor:profiles!ticket_events_actor_id_fkey(full_name, email)')
        .eq('ticket_id', id)
        .order('created_at'),
    ]);
    setComments((c.data as Comment[]) ?? []);
    setAttachments((a.data as Attachment[]) ?? []);
    setEvents((ev.data as TicketEvent[]) ?? []);
  }, [id]);

  useEffect(() => {
    loadTicket();
    loadThread();
  }, [loadTicket, loadThread]);

  useEffect(() => {
    if (!isStaff) return;
    supabase
      .from('profiles')
      .select('*')
      .in('role', ['admin', 'agent'])
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => setAgents((data as Profile[]) ?? []));
    supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, [isStaff]);

  // Tiempo real: otro agente o el cliente responde mientras la vista está abierta.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${id}` }, () => {
        loadThread();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `id=eq.${id}` }, () => {
        loadTicket();
        loadThread();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadThread, loadTicket]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const byComment = new Map<string, Attachment[]>();
    for (const a of attachments) {
      if (a.comment_id) byComment.set(a.comment_id, [...(byComment.get(a.comment_id) ?? []), a]);
    }
    const items: TimelineItem[] = comments.map((c) => ({ kind: 'comment', at: c.created_at, comment: c, files: byComment.get(c.id) ?? [] }));
    if (isStaff) {
      // El evento "creado" ya lo cuenta la cabecera.
      for (const e of events) if (e.event_type !== 'creado') items.push({ kind: 'event', at: e.created_at, event: e });
    }
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [comments, attachments, events, isStaff]);

  const ticketFiles = attachments.filter((a) => !a.comment_id);

  const updateTicket = async (patch: Partial<Pick<TicketRow, 'status' | 'priority' | 'assignee_id' | 'category_id'>>) => {
    if (!ticket) return;
    setError('');
    const { error: err } = await supabase.from('tickets').update(patch).eq('id', ticket.id);
    if (err) setError(errorMessage(err));
    await loadTicket();
    await loadThread();
  };

  const onReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticket || !profile || (!reply.trim() && files.length === 0)) return;
    setSending(true);
    setError('');
    setNotice('');

    const body = reply.trim() || '(Adjuntó archivos)';
    const { data, error: err } = await supabase
      .from('ticket_comments')
      .insert({ ticket_id: ticket.id, author_id: profile.id, body, is_internal: isStaff && internal })
      .select('id')
      .single();
    if (err || !data) {
      setSending(false);
      setError(errorMessage(err));
      return;
    }

    const failed = files.length ? await uploadAttachments(ticket.id, files, (data as { id: string }).id, profile.id) : [];
    if (failed.length) setNotice(`No se pudieron adjuntar: ${failed.join(', ')}`);
    if (isStaff && replyStatus) {
      await supabase.from('tickets').update({ status: replyStatus }).eq('id', ticket.id);
    }

    setReply('');
    setFiles([]);
    setInternal(false);
    setReplyStatus('');
    setSending(false);
    await loadTicket();
    await loadThread();
  };

  if (notFound) {
    return (
      <div className="page">
        <h1>Tiquete no encontrado</h1>
        <p className="muted">No existe o no tiene acceso a él.</p>
        <Link to="/tiquetes">← Volver a tiquetes</Link>
      </div>
    );
  }
  if (!ticket) return <div className="page-loading">Cargando tiquete…</div>;

  const closed = ticket.status === 'cerrado';

  return (
    <div className="page">
      <Link to="/tiquetes" className="back">
        ← Tiquetes
      </Link>
      <header className="ticket-head">
        <div>
          <p className="code-lg">{ticket.code}</p>
          <h1>{ticket.subject}</h1>
          <div className="badges">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {isStaff && <DueBadge dueAt={ticket.resolution_due_at} status={ticket.status} />}
          </div>
        </div>
      </header>

      {uploadFailed && uploadFailed.length > 0 && <p className="alert error">No se pudieron adjuntar: {uploadFailed.join(', ')}</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="alert error">{notice}</p>}

      <div className="ticket-layout">
        <section className="thread" aria-label="Conversación">
          <article className="message original">
            <MessageHead name={ticket.requester?.full_name || ticket.requester?.email || ''} at={ticket.created_at} />
            <div className="message-body">{ticket.description || <span className="muted">(Sin descripción)</span>}</div>
            {ticketFiles.length > 0 && <FileChips files={ticketFiles} />}
          </article>

          {timeline.map((item) =>
            item.kind === 'comment' ? (
              <article key={item.comment.id} className={item.comment.is_internal ? 'message internal' : item.comment.author?.role === 'client' ? 'message' : 'message staff'}>
                <MessageHead
                  name={item.comment.author?.full_name || item.comment.author?.email || ''}
                  at={item.comment.created_at}
                  tag={item.comment.is_internal ? 'Nota interna' : item.comment.author?.role !== 'client' ? 'Soporte' : undefined}
                />
                <div className="message-body">{item.comment.body}</div>
                {item.files.length > 0 && <FileChips files={item.files} />}
              </article>
            ) : (
              <p key={`e-${item.event.id}`} className="event">
                <strong>{item.event.actor?.full_name || item.event.actor?.email || 'Sistema'}</strong> {EVENT_TEXT[item.event.event_type](item.event)} ·{' '}
                <time dateTime={item.event.created_at}>{timeAgo(item.event.created_at)}</time>
              </p>
            ),
          )}

          {closed && !isStaff ? (
            <p className="alert">Este tiquete está cerrado. Si el problema vuelve a ocurrir, cree un tiquete nuevo.</p>
          ) : (
            <form className={internal ? 'reply internal' : 'reply'} onSubmit={onReply}>
              <label htmlFor="reply" className="sr-only">
                Respuesta
              </label>
              <textarea
                id="reply"
                rows={5}
                placeholder={internal ? 'Nota interna (el cliente no la ve)…' : 'Escriba su respuesta…'}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <FilePicker files={files} onChange={setFiles} compact />
              <div className="reply-actions">
                {isStaff && (
                  <>
                    <label className="check">
                      <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                      Nota interna
                    </label>
                    <label className="inline">
                      Luego cambiar a
                      <select value={replyStatus} onChange={(e) => setReplyStatus(e.target.value as TicketStatus | '')}>
                        <option value="">(mismo estado)</option>
                        {STATUSES.filter((s) => s !== ticket.status).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button className="btn primary" type="submit" disabled={sending || (!reply.trim() && files.length === 0)}>
                  {sending ? 'Enviando…' : internal ? 'Guardar nota' : 'Enviar respuesta'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="ticket-side">
          <div className="panel">
            <h2>Detalles</h2>
            {isStaff ? (
              <div className="props">
                <label>
                  Estado
                  <select value={ticket.status} onChange={(e) => updateTicket({ status: e.target.value as TicketStatus })}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prioridad
                  <select value={ticket.priority} onChange={(e) => updateTicket({ priority: e.target.value as TicketPriority })}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Asignado a
                  <select value={ticket.assignee_id ?? ''} onChange={(e) => updateTicket({ assignee_id: e.target.value || null })}>
                    <option value="">Sin asignar</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name || a.email}
                      </option>
                    ))}
                  </select>
                </label>
                {!ticket.assignee_id && profile && (
                  <button type="button" className="btn ghost small" onClick={() => updateTicket({ assignee_id: profile.id })}>
                    Asignármelo
                  </button>
                )}
                <label>
                  Categoría
                  <select value={ticket.category_id ?? ''} onChange={(e) => updateTicket({ category_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Sin categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <dl className="dl">
                <dt>Estado</dt>
                <dd>
                  <StatusBadge status={ticket.status} />
                </dd>
                <dt>Prioridad</dt>
                <dd>{PRIORITY_LABEL[ticket.priority]}</dd>
                <dt>Categoría</dt>
                <dd>{ticket.category?.name ?? '—'}</dd>
                <dt>Atendido por</dt>
                <dd>{ticket.assignee?.full_name || 'Pendiente de asignar'}</dd>
              </dl>
            )}
          </div>

          <div className="panel">
            <dl className="dl">
              <dt>Cliente</dt>
              <dd>{ticket.organization?.name}</dd>
              <dt>Solicitante</dt>
              <dd>
                {ticket.requester?.full_name}
                <br />
                <span className="muted">{ticket.requester?.email}</span>
              </dd>
              {ticket.site && (
                <>
                  <dt>Sitio</dt>
                  <dd>{ticket.site}</dd>
                </>
              )}
              <dt>Creado</dt>
              <dd>{formatDateTime(ticket.created_at)}</dd>
              {isStaff && (
                <>
                  <dt>1ª respuesta</dt>
                  <dd>
                    {ticket.first_response_at
                      ? formatDateTime(ticket.first_response_at)
                      : ticket.first_response_due_at
                        ? `Pendiente · meta ${formatDateTime(ticket.first_response_due_at)}`
                        : 'Pendiente'}
                  </dd>
                  <dt>Meta de resolución</dt>
                  <dd>{ticket.resolution_due_at ? formatDateTime(ticket.resolution_due_at) : '—'}</dd>
                </>
              )}
              {ticket.resolved_at && (
                <>
                  <dt>Resuelto</dt>
                  <dd>{formatDateTime(ticket.resolved_at)}</dd>
                </>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MessageHead({ name, at, tag }: { name: string; at: string; tag?: string }) {
  return (
    <header className="message-head">
      <span className="avatar small" aria-hidden="true">
        {initials(name)}
      </span>
      <strong>{name}</strong>
      {tag && <span className="tag">{tag}</span>}
      <time dateTime={at} title={formatDateTime(at)} className="muted">
        {timeAgo(at)}
      </time>
    </header>
  );
}

function FileChips({ files }: { files: Attachment[] }) {
  return (
    <ul className="file-chips">
      {files.map((f) => (
        <li key={f.id}>
          <button type="button" className="file-chip" onClick={() => openAttachment(f).catch(() => alert('No se pudo abrir el archivo'))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <path d="M14 3v6h6" />
            </svg>
            {f.file_name}
            <span className="muted">{formatBytes(f.size_bytes)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
