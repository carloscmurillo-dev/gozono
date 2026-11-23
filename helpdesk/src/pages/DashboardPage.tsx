import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errorMessage } from '../lib/supabase';
import { TICKET_SELECT, type DashboardStats, type TicketRow } from '../lib/types';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../lib/labels';
import { formatHours, formatMinutes, timeAgo } from '../lib/format';
import { BarList, WeeklyChart } from '../components/Charts';
import { DueBadge, PriorityBadge, StatusBadge } from '../components/Badges';

const PERIODS = [7, 30, 90];

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<TicketRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.rpc('dashboard_stats', { p_days: days }).then(({ data, error: err }) => {
      if (err) setError(errorMessage(err));
      else setStats(data as DashboardStats);
    });
  }, [days]);

  useEffect(() => {
    supabase
      .from('tickets')
      .select(TICKET_SELECT)
      .order('updated_at', { ascending: false })
      .limit(8)
      .then(({ data }) => setRecent((data as TicketRow[]) ?? []));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Resumen de los últimos {days} días</p>
        </div>
        <div className="head-actions">
          <div className="segmented" role="group" aria-label="Período">
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)}>
                {p} días
              </button>
            ))}
          </div>
          <Link to="/tiquetes/nuevo" className="btn primary">
            + Nuevo tiquete
          </Link>
        </div>
      </header>

      {error && <p className="alert error">{error}</p>}

      <section className="kpis" aria-label="Indicadores">
        <Kpi label="Abiertos" value={stats?.open} to="/tiquetes" />
        <Kpi label="Sin asignar" value={stats?.unassigned} to="/tiquetes?asignado=nadie" />
        <Kpi label="Vencidos (SLA)" value={stats?.overdue} to="/tiquetes?vencidos=1" alert={!!stats?.overdue} />
        <Kpi label="Esperando cliente" value={stats?.waiting_client} to="/tiquetes?estado=esperando_cliente" />
        <Kpi label="1ª respuesta prom." value={stats ? formatMinutes(stats.avg_first_response_minutes) : undefined} />
        <Kpi
          label={`Resueltos (${days} d)`}
          value={stats?.resolved_period}
          sub={stats ? `de ${stats.created_period} creados · resolución prom. ${formatHours(stats.avg_resolution_hours)}` : undefined}
        />
        <Kpi label="SLA cumplido" value={stats?.sla_met_pct != null ? `${stats.sla_met_pct}%` : '—'} />
      </section>

      <section className="grid-2">
        <div className="panel span-2">
          <h2>Creados vs. resueltos por semana</h2>
          {stats ? <WeeklyChart data={stats.weekly} /> : <p className="muted">Cargando…</p>}
        </div>
        <div className="panel">
          <h2>Abiertos por categoría</h2>
          <BarList items={stats?.by_category_open ?? []} empty="No hay tiquetes abiertos" />
        </div>
        <div className="panel">
          <h2>Carga por agente</h2>
          <BarList items={stats?.by_assignee_open ?? []} empty="No hay tiquetes abiertos" />
        </div>
        <div className="panel">
          <h2>Abiertos por prioridad</h2>
          <BarList
            items={PRIORITIES.slice()
              .reverse()
              .map((p) => ({ name: PRIORITY_LABEL[p], count: stats?.by_priority_open[p] ?? 0 }))
              .filter((i) => i.count > 0)}
            empty="No hay tiquetes abiertos"
          />
        </div>
        <div className="panel">
          <h2>Clientes con más tiquetes ({days} d)</h2>
          <BarList items={stats?.by_org_period ?? []} empty="Sin tiquetes en el período" />
        </div>
        <div className="panel span-2">
          <h2>Todos por estado</h2>
          <div className="status-strip">
            {STATUSES.map((s) => (
              <Link key={s} to={`/tiquetes?estado=${s}`} className="status-cell">
                <StatusBadge status={s} />
                <strong>{stats?.by_status[s] ?? 0}</strong>
                <span className="sr-only">{STATUS_LABEL[s]}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Actividad reciente</h2>
          <Link to="/tiquetes">Ver todos →</Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Asunto</th>
                <th>Cliente</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Asignado</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tiquetes/${t.id}`} className="code">
                      {t.code}
                    </Link>
                  </td>
                  <td>{t.subject}</td>
                  <td>{t.organization?.name}</td>
                  <td>
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td>
                    <span className="badges">
                      <StatusBadge status={t.status} />
                      <DueBadge dueAt={t.resolution_due_at} status={t.status} />
                    </span>
                  </td>
                  <td className={t.assignee ? '' : 'muted'}>{t.assignee?.full_name || t.assignee?.email || 'Sin asignar'}</td>
                  <td className="muted">{timeAgo(t.updated_at)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Todavía no hay tiquetes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, to, alert }: { label: string; value?: number | string; sub?: string; to?: string; alert?: boolean }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value ?? '…'}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </>
  );
  const cls = alert ? 'kpi alert' : 'kpi';
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
