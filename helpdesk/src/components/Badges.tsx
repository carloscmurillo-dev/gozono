import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/labels';
import type { TicketPriority, TicketStatus } from '../lib/types';

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`badge priority-${priority}`}>
      {(priority === 'alta' || priority === 'critica') && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M12 4v10M12 19v1" strokeLinecap="round" />
        </svg>
      )}
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

// Vencido = abierto y pasada la fecha límite de resolución.
export function DueBadge({ dueAt, status }: { dueAt: string | null; status: TicketStatus }) {
  if (!dueAt || status === 'resuelto' || status === 'cerrado') return null;
  if (new Date(dueAt).getTime() > Date.now()) return null;
  return <span className="badge overdue">Vencido</span>;
}
