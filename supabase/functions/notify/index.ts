// Notificaciones por correo. La invocan Database Webhooks de Supabase
// (Database → Webhooks) con el encabezado x-webhook-secret:
//   - tickets          INSERT, UPDATE
//   - ticket_comments  INSERT
//   - contact_messages INSERT
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail, layout, esc } from '../_shared/graph.ts';
import { json } from '../_shared/cors.ts';

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, any> | null;
  old_record: Record<string, any> | null;
};

type Profile = { id: string; email: string; full_name: string; role: string; active: boolean };

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const HELPDESK_URL = (Deno.env.get('HELPDESK_URL') ?? 'https://soporte.gozono.com').replace(/\/$/, '');

const STATUS_LABEL: Record<string, string> = {
  nuevo: 'Nuevo',
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  esperando_cliente: 'Esperando su respuesta',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};
const PRIORITY_LABEL: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };

const nl2br = (s: string) => esc(s).replace(/\n/g, '<br>');
const ticketLink = (id: string) => ({ label: 'Ver tiquete', href: `${HELPDESK_URL}/tiquetes/${id}` });

async function getTicket(id: string) {
  const { data, error } = await supabase
    .from('tickets')
    .select(
      'id, code, subject, description, status, priority, assignee_id, requester_id, organization:organizations(name), category:categories(name), requester:profiles!tickets_requester_id_fkey(id, email, full_name, role, active), assignee:profiles!tickets_assignee_id_fkey(id, email, full_name, role, active)',
    )
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as any;
}

async function staffEmails(): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('email').in('role', ['admin', 'agent']).eq('active', true);
  return (data ?? []).map((p) => p.email);
}

async function getProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('id, email, full_name, role, active').eq('id', id).single();
  return data;
}

function ticketSummary(t: any): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 16px">
<tr><td style="color:#3D6070;padding:2px 16px 2px 0">Folio</td><td style="font-weight:600">${esc(t.code)}</td></tr>
<tr><td style="color:#3D6070;padding:2px 16px 2px 0">Asunto</td><td>${esc(t.subject)}</td></tr>
<tr><td style="color:#3D6070;padding:2px 16px 2px 0">Cliente</td><td>${esc(t.organization?.name ?? '')}</td></tr>
<tr><td style="color:#3D6070;padding:2px 16px 2px 0">Prioridad</td><td>${PRIORITY_LABEL[t.priority] ?? t.priority}</td></tr>
<tr><td style="color:#3D6070;padding:2px 16px 2px 0">Estado</td><td>${STATUS_LABEL[t.status] ?? t.status}</td></tr>
</table>`;
}

async function onTicketInsert(record: Record<string, any>) {
  const t = await getTicket(record.id);
  const staff = await staffEmails();

  await sendMail({
    to: staff,
    subject: `[${t.code}] Nuevo tiquete: ${t.subject}`,
    html: layout(
      'Nuevo tiquete recibido',
      `${ticketSummary(t)}<p style="font-size:14px;line-height:1.6">${nl2br(t.description ?? '')}</p>`,
      ticketLink(t.id),
    ),
  });

  if (t.requester && t.requester.role === 'client') {
    await sendMail({
      to: [t.requester.email],
      subject: `[${t.code}] Recibimos su solicitud`,
      html: layout(
        `Hola ${t.requester.full_name || ''}, recibimos su solicitud`,
        `<p style="font-size:14px;line-height:1.6">Nuestro equipo de soporte la revisará y le responderá a la brevedad.</p>${ticketSummary(t)}`,
        ticketLink(t.id),
      ),
    });
  }
}

async function onTicketUpdate(record: Record<string, any>, old: Record<string, any>) {
  const assigneeChanged = record.assignee_id && record.assignee_id !== old.assignee_id;
  const statusChanged = record.status !== old.status;
  if (!assigneeChanged && !statusChanged) return;

  const t = await getTicket(record.id);

  if (assigneeChanged && t.assignee) {
    await sendMail({
      to: [t.assignee.email],
      subject: `[${t.code}] Se le asignó: ${t.subject}`,
      html: layout('Tiene un tiquete asignado', ticketSummary(t), ticketLink(t.id)),
    });
  }

  // Al cliente solo se le avisan los estados que le piden algo o cierran el caso.
  if (statusChanged && ['esperando_cliente', 'resuelto', 'cerrado'].includes(t.status) && t.requester?.role === 'client') {
    const message: Record<string, string> = {
      esperando_cliente: 'Necesitamos información adicional de su parte para continuar.',
      resuelto: 'Marcamos su solicitud como resuelta. Si el problema persiste, responda en el portal y la reabriremos.',
      cerrado: 'Su solicitud fue cerrada. Gracias por confiar en Grupo Ozono.',
    };
    await sendMail({
      to: [t.requester.email],
      subject: `[${t.code}] ${STATUS_LABEL[t.status]}: ${t.subject}`,
      html: layout(
        STATUS_LABEL[t.status],
        `<p style="font-size:14px;line-height:1.6">${message[t.status]}</p>${ticketSummary(t)}`,
        ticketLink(t.id),
      ),
    });
  }
}

async function onCommentInsert(record: Record<string, any>) {
  const [t, author] = await Promise.all([getTicket(record.ticket_id), getProfile(record.author_id)]);
  if (!author) return;
  const isStaff = author.role === 'admin' || author.role === 'agent';
  const body = `<p style="font-size:14px;color:#3D6070;margin:0 0 8px">${esc(author.full_name || author.email)} escribió:</p>
<div style="font-size:14px;line-height:1.6;border-left:3px solid #0F969C;padding:4px 0 4px 14px;margin:0 0 20px">${nl2br(record.body)}</div>`;

  let to: string[] = [];
  if (record.is_internal) {
    // Nota interna: solo al responsable (si no es quien la escribió).
    if (t.assignee && t.assignee.id !== author.id) to = [t.assignee.email];
  } else if (isStaff) {
    if (t.requester && t.requester.id !== author.id) to = [t.requester.email];
  } else {
    to = t.assignee ? [t.assignee.email] : await staffEmails();
  }
  if (to.length === 0) return;

  await sendMail({
    to,
    subject: `[${t.code}] ${record.is_internal ? 'Nota interna' : 'Nueva respuesta'}: ${t.subject}`,
    html: layout(record.is_internal ? 'Nueva nota interna' : 'Nueva respuesta en su tiquete', body + ticketSummary(t), ticketLink(t.id)),
  });
}

async function onContactInsert(record: Record<string, any>) {
  await sendMail({
    to: [Deno.env.get('CONTACT_NOTIFY_TO') ?? 'info@gozono.com'],
    replyTo: record.email,
    subject: `Nuevo mensaje del sitio web: ${record.name}`,
    html: layout(
      'Nuevo mensaje del formulario de contacto',
      `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 16px">
<tr><td style="color:#3D6070;padding:2px 16px 2px 0">Nombre</td><td>${esc(record.name)}</td></tr>
<tr><td style="color:#3D6070;padding:2px 16px 2px 0">Correo</td><td>${esc(record.email)}</td></tr>
<tr><td style="color:#3D6070;padding:2px 16px 2px 0">Teléfono</td><td>${esc(record.phone ?? '—')}</td></tr>
</table><p style="font-size:14px;line-height:1.6">${nl2br(record.message)}</p>`,
      { label: 'Ver en el help desk', href: `${HELPDESK_URL}/mensajes` },
    ),
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return json({ error: 'No autorizado' }, 401);

  const payload = (await req.json()) as WebhookPayload;
  const { type, table, record, old_record } = payload;
  if (!record) return json({ ok: true, skipped: true });

  try {
    if (table === 'tickets' && type === 'INSERT') await onTicketInsert(record);
    else if (table === 'tickets' && type === 'UPDATE' && old_record) await onTicketUpdate(record, old_record);
    else if (table === 'ticket_comments' && type === 'INSERT') await onCommentInsert(record);
    else if (table === 'contact_messages' && type === 'INSERT') await onContactInsert(record);
    return json({ ok: true });
  } catch (err) {
    console.error('notify error', table, type, err);
    return json({ error: String(err) }, 500);
  }
});
