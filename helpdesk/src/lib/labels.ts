import type { TicketPriority, TicketStatus, UserRole } from './types';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  nuevo: 'Nuevo',
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  esperando_cliente: 'Esperando cliente',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};
export const STATUSES = Object.keys(STATUS_LABEL) as TicketStatus[];
export const OPEN_STATUSES: TicketStatus[] = ['nuevo', 'abierto', 'en_progreso', 'esperando_cliente'];

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};
export const PRIORITIES: TicketPriority[] = ['baja', 'media', 'alta', 'critica'];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  agent: 'Agente',
  client: 'Cliente',
};
