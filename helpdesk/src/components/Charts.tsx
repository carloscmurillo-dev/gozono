import { useState } from 'react';
import { formatShortDate as formatDate } from '../lib/format';

// "2026-10-19" es una fecha sin hora: se interpreta en hora local para que
// en Costa Rica (UTC-6) no se muestre como el día anterior.
const formatShortDate = (day: string) => formatDate(`${day}T00:00:00`);

// Colores validados (contraste ≥3:1 sobre blanco, separación CVD ΔE ≥15).
export const SERIES = { created: '#0F969C', resolved: '#2F5F99' } as const;

type Week = { week: string; created: number; resolved: number };

function niceMax(n: number) {
  if (n <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / step) * step;
}

// Columnas agrupadas por semana: creados vs. resueltos.
export function WeeklyChart({ data }: { data: Week[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.created, d.resolved))));
  const ticks = [0, max / 2, max];
  const h = 200;

  return (
    <figure className="chart">
      <div className="legend" aria-hidden="true">
        <span>
          <i style={{ background: SERIES.created }} />
          Creados
        </span>
        <span>
          <i style={{ background: SERIES.resolved }} />
          Resueltos
        </span>
      </div>
      <div className="weekly" style={{ height: h }}>
        <div className="y-axis" aria-hidden="true">
          {ticks
            .slice()
            .reverse()
            .map((t) => (
              <span key={t}>{Number.isInteger(t) ? t : t.toFixed(1)}</span>
            ))}
        </div>
        <div className="plot">
          {ticks.map((t) => (
            <div key={t} className="gridline" style={{ bottom: `${(t / max) * 100}%` }} aria-hidden="true" />
          ))}
          {data.map((d, i) => (
            <div
              key={d.week}
              className="col"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`Semana del ${formatShortDate(d.week)}: ${d.created} creados, ${d.resolved} resueltos`}>
              <span className="bar" style={{ height: `${(d.created / max) * 100}%`, background: SERIES.created }} />
              <span className="bar" style={{ height: `${(d.resolved / max) * 100}%`, background: SERIES.resolved }} />
              {hover === i && (
                <span className="tooltip" role="tooltip">
                  <strong>Semana del {formatShortDate(d.week)}</strong>
                  <span>
                    <i style={{ background: SERIES.created }} /> Creados: {d.created}
                  </span>
                  <span>
                    <i style={{ background: SERIES.resolved }} /> Resueltos: {d.resolved}
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="x-axis" aria-hidden="true">
        {data.map((d) => (
          <span key={d.week}>{formatShortDate(d.week)}</span>
        ))}
      </div>
      <details className="table-view">
        <summary>Ver como tabla</summary>
        <table>
          <thead>
            <tr>
              <th>Semana</th>
              <th>Creados</th>
              <th>Resueltos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.week}>
                <td>{formatShortDate(d.week)}</td>
                <td>{d.created}</td>
                <td>{d.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// Barras horizontales de una sola serie, con el valor en la punta.
export function BarList({ items, empty = 'Sin datos' }: { items: { name: string; count: number }[]; empty?: string }) {
  if (items.length === 0) return <p className="muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="barlist">
      {items.map((i) => (
        <li key={i.name} title={`${i.name}: ${i.count}`}>
          <span className="barlist-name">{i.name}</span>
          <span className="barlist-track">
            <span className="barlist-bar" style={{ width: `${Math.max(2, (i.count / max) * 100)}%` }} />
            <span className="barlist-value">{i.count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
