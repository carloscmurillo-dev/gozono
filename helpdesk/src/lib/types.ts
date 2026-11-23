export type UserRole = 'admin' | 'agent' | 'client';
export type TicketStatus = 'nuevo' | 'abierto' | 'en_progreso' | 'esperando_cliente' | 'resuelto' | 'cerrado';
export type TicketPriority = 'baja' | 'media' | 'alta' | 'critica';

export interface Organization {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_internal: boolean;
  active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  organization_id: string | null;
  active: boolean;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface Ticket {
  id: string;
  number: number;
  code: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category_id: number | null;
  organization_id: string;
  requester_id: string;
  assignee_id: string | null;
  site: string | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
}

type PersonRef = Pick<Profile, 'id' | 'full_name' | 'email'>;

// Tiquete con sus relaciones, como lo devuelve TICKET_SELECT.
export interface TicketRow extends Ticket {
  organization: Pick<Organization, 'id' | 'name'> | null;
  category: Pick<Category, 'id' | 'name'> | null;
  requester: PersonRef | null;
  assignee: PersonRef | null;
}

export const TICKET_SELECT =
  '*, organization:organizations(id, name), category:categories(id, name), requester:profiles!tickets_requester_id_fkey(id, full_name, email), assignee:profiles!tickets_assignee_id_fkey(id, full_name, email)';

export interface Comment {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  author?: PersonRef & { role: UserRole };
}

export interface Attachment {
  id: string;
  ticket_id: string;
  comment_id: string | null;
  uploaded_by: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface TicketEvent {
  id: number;
  ticket_id: string;
  actor_id: string | null;
  event_type: 'creado' | 'estado' | 'prioridad' | 'asignado' | 'categoria';
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  actor?: { full_name: string; email: string } | null;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  handled: boolean;
  handled_by: string | null;
  created_at: string;
}

export interface DashboardStats {
  open: number;
  unassigned: number;
  overdue: number;
  waiting_client: number;
  created_period: number;
  resolved_period: number;
  avg_first_response_minutes: number | null;
  avg_resolution_hours: number | null;
  sla_met_pct: number | null;
  by_status: Partial<Record<TicketStatus, number>>;
  by_priority_open: Partial<Record<TicketPriority, number>>;
  by_category_open: { name: string; count: number }[];
  by_assignee_open: { name: string; count: number }[];
  by_org_period: { name: string; count: number }[];
  weekly: { week: string; created: number; resolved: number }[];
}
