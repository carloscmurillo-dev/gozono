import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, errorMessage } from '../lib/supabase';
import { TICKET_SELECT, type Category, type Organization, type Profile, type TicketRow } from '../lib/types';
import { OPEN_STATUSES, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../lib/labels';
import { timeAgo } from '../lib/format';
import { DueBadge, PriorityBadge, StatusBadge } from '../components/Badges';

const PAGE_SIZE = 25;

export function TicketsPage() {
  const { profile, isStaff } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);

  const estado = params.get('estado') ?? 'abiertos';
  const prioridad = params.get('prioridad') ?? '';
  const categoria = params.get('categoria') ?? '';
  const asignado = params.get('asignado') ?? '';
  const cliente = params.get('cliente') ?? '';
  const vencidos = params.get('vencidos') === '1';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('pagina') ?? 1));

  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data as Category[]) ?? []));
    if (isStaff) {
      supabase
        .from('organizations')
        .select('*')
        .order('name')
        .then(({ data }) => setOrgs((data as Organization[]) ?? []));
      supabase
        .from('profiles')
        .select('*')
        .in('role', ['admin', 'agent'])
        .eq('active', true)
        .order('full_name')
        .then(({ data }) => setAgents((data as Profile[]) ?? []));
    }
  }, [isStaff]);

  useEffect(() => {
    let query = supabase.from('tickets').select(TICKET_SELECT, { count: 'exact' });

    if (estado === 'abiertos') query = query.in('status', OPEN_STATUSES);
    else if (estado !== 'todos') query = query.eq('status', estado);
    if (prioridad) query = query.eq('priority', prioridad);
    if (categoria) query = query.eq('category_id', Number(categoria));
    if (cliente) query = query.eq('organization_id', cliente);
    if (asignado === 'yo' && profile) query = query.eq('assignee_id', profile.id);
    else if (asignado === 'nadie') query = query.is('assignee_id', null);
    else if (asignado) query = query.eq('assignee_id', asignado);
    if (vencidos) query = query.in('status', OPEN_STATUSES).lt('resolution_due_at', new Date().toISOString());
    if (q) {
      const term = q.replace(/[%,()]/g, ' ').trim();
      const num = Number(term.replace(/^GOZ-?/i, ''));
      query = Number.isInteger(num) && num > 0 ? query.or(`subject.ilike.%${term}%,number.eq.${num}`) : query.ilike('subject', `%${term}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    setLoading(true);
    query
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
      .then(({ data, count, error: err }) => {
        if (err) setError(errorMessage(err));
        else {
          setError('');
          setRows((data as TicketRow[]) ?? []);
          setTotal(count ?? 0);
        }
        setLoading(false);
      });
  }, [estado, prioridad, categoria, asignado, cliente, vencidos, q, page, profile]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next);
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const title = asignado === 'yo' ? 'Mis asignados' : isStaff ? 'Tiquetes' : 'Mis tiquetes';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">{loading ? 'Cargando…' : `${total} tiquete${total === 1 ? '' : 's'}`}</p>
        </div>
        <Link to="/tiquetes/nuevo" className="btn primary">
          + Nuevo tiquete
        </Link>
      </header>

      <form
        className="filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParam('q', search.trim());
        }}>
        <label className="search">
          <span className="sr-only">Buscar</span>
          <input type="search" placeholder="Buscar por folio o asunto" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Estado</span>
          <select value={estado} onChange={(e) => setParam('estado', e.target.value === 'abiertos' ? '' : e.target.value)}>
            <option value="abiertos">Abiertos (todos)</option>
            <option value="todos">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Prioridad</span>
          <select value={prioridad} onChange={(e) => setParam('prioridad', e.target.value)}>
            <option value="">Toda prioridad</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Categoría</span>
          <select value={categoria} onChange={(e) => setParam('categoria', e.target.value)}>
            <option value="">Toda categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {isStaff && (
          <>
            <label>
              <span className="sr-only">Asignado</span>
              <select value={asignado} onChange={(e) => setParam('asignado', e.target.value)}>
                <option value="">Cualquier responsable</option>
                <option value="yo">Asignados a mí</option>
                <option value="nadie">Sin asignar</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name || a.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Cliente</span>
              <select value={cliente} onChange={(e) => setParam('cliente', e.target.value)}>
                <option value="">Todos los clientes</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={vencidos} onChange={(e) => setParam('vencidos', e.target.checked ? '1' : '')} />
              Solo vencidos
            </label>
          </>
        )}
      </form>

      {error && <p className="alert error">{error}</p>}

      <div className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Asunto</th>
                {isStaff && <th>Cliente</th>}
                <th>Categoría</th>
                <th>Prioridad</th>
                <th>Estado</th>
                {isStaff ? <th>Asignado</th> : <th>Solicitante</th>}
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tiquetes/${t.id}`} className="code">
                      {t.code}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/tiquetes/${t.id}`} className="row-link">
                      {t.subject}
                    </Link>
                  </td>
                  {isStaff && <td>{t.organization?.name}</td>}
                  <td>{t.category?.name ?? '—'}</td>
                  <td>
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td>
                    <span className="badges">
                      <StatusBadge status={t.status} />
                      {isStaff && <DueBadge dueAt={t.resolution_due_at} status={t.status} />}
                    </span>
                  </td>
                  {isStaff ? (
                    <td className={t.assignee ? '' : 'muted'}>{t.assignee?.full_name || t.assignee?.email || 'Sin asignar'}</td>
                  ) : (
                    <td>{t.requester?.full_name || t.requester?.email}</td>
                  )}
                  <td className="muted">{timeAgo(t.updated_at)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    No hay tiquetes con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="Paginación">
          <button type="button" className="btn ghost" disabled={page <= 1} onClick={() => setParam('pagina', String(page - 1))}>
            ← Anterior
          </button>
          <span className="muted">
            Página {page} de {pages}
          </span>
          <button type="button" className="btn ghost" disabled={page >= pages} onClick={() => setParam('pagina', String(page + 1))}>
            Siguiente →
          </button>
        </nav>
      )}
    </div>
  );
}
