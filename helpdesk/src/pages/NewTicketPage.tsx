import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, errorMessage } from '../lib/supabase';
import { uploadAttachments } from '../lib/attachments';
import type { Category, Organization, Profile, Ticket, TicketPriority } from '../lib/types';
import { PRIORITIES, PRIORITY_LABEL } from '../lib/labels';
import { FilePicker } from '../components/FilePicker';

export function NewTicketPage() {
  const { profile, isStaff } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgPeople, setOrgPeople] = useState<Profile[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('media');
  const [site, setSite] = useState('');
  const [orgId, setOrgId] = useState('');
  const [requesterId, setRequesterId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
        .eq('active', true)
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

  // El personal puede registrar un tiquete a nombre de un contacto del cliente
  // (por ejemplo, tras una llamada).
  useEffect(() => {
    if (!isStaff || !orgId) {
      setOrgPeople([]);
      return;
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', orgId)
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => {
        setOrgPeople((data as Profile[]) ?? []);
        setRequesterId('');
      });
  }, [isStaff, orgId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError('');
    if (isStaff && !orgId) {
      setError('Seleccione el cliente.');
      return;
    }
    setBusy(true);

    const { data, error: err } = await supabase
      .from('tickets')
      .insert({
        subject: subject.trim(),
        description: description.trim(),
        category_id: categoryId ? Number(categoryId) : null,
        priority,
        site: site.trim() || null,
        // Para un cliente, el trigger fuerza su propia organización y usuario.
        organization_id: isStaff ? orgId : profile.organization_id,
        requester_id: isStaff ? requesterId || profile.id : profile.id,
        assignee_id: isStaff ? assigneeId || null : null,
      })
      .select('id')
      .single();

    if (err || !data) {
      setBusy(false);
      setError(errorMessage(err));
      return;
    }
    const ticket = data as Pick<Ticket, 'id'>;
    const failed = files.length ? await uploadAttachments(ticket.id, files, null, profile.id) : [];
    setBusy(false);
    navigate(`/tiquetes/${ticket.id}`, { state: failed.length ? { uploadFailed: failed } : undefined });
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Nuevo tiquete</h1>
          <p className="muted">Describa el incidente con el mayor detalle posible: qué pasa, dónde y desde cuándo.</p>
        </div>
      </header>

      <form className="panel form" onSubmit={onSubmit}>
        {isStaff && (
          <div className="form-row">
            <label>
              Cliente *
              <select required value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                <option value="">Seleccione…</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Solicitante
              <select value={requesterId} onChange={(e) => setRequesterId(e.target.value)} disabled={!orgId}>
                <option value="">Yo ({profile?.full_name || profile?.email})</option>
                {orgPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label>
          Asunto *
          <input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej. Sin señal 4G en el sótano 2" />
        </label>

        <label>
          Descripción *
          <textarea required rows={7} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="form-row">
          <label>
            Categoría
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Seleccione…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridad
            <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>
            Sitio / ubicación
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Ej. Edificio B, piso 3" />
          </label>
          {isStaff && (
            <label>
              Asignar a
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Sin asignar</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name || a.email}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <FilePicker files={files} onChange={setFiles} />

        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => navigate(-1)}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Creando…' : 'Crear tiquete'}
          </button>
        </div>
      </form>
    </div>
  );
}
