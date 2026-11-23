import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, errorMessage } from '../lib/supabase';
import type { Organization, Profile, UserRole } from '../lib/types';
import { ROLE_LABEL } from '../lib/labels';
import { Dialog } from '../components/Dialog';

type Draft = { id?: string; email: string; full_name: string; role: UserRole; organization_id: string; active: boolean };
const EMPTY: Draft = { email: '', full_name: '', role: 'client', organization_id: '', active: true };

// Llama a la Edge Function admin-users (usa la service role del lado servidor).
async function adminUsers(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // El cuerpo del error trae el mensaje que devolvió la función.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) return payload.error;
    }
    return errorMessage(error);
  }
  return data?.error ?? null;
}

export function UsersPage() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data }) => setUsers((data as Profile[]) ?? []));

  useEffect(() => {
    load();
    supabase
      .from('organizations')
      .select('*')
      .order('name')
      .then(({ data }) => setOrgs((data as Organization[]) ?? []));
  }, []);

  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    const err = draft.id
      ? await adminUsers({
          action: 'update',
          id: draft.id,
          full_name: draft.full_name,
          role: draft.role,
          organization_id: draft.organization_id || null,
          active: draft.active,
        })
      : await adminUsers({
          action: 'invite',
          email: draft.email,
          full_name: draft.full_name,
          role: draft.role,
          organization_id: draft.organization_id || null,
        });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setNotice(draft.id ? 'Usuario actualizado.' : `Invitación enviada a ${draft.email}.`);
    setDraft(null);
    load();
  };

  const resend = async (u: Profile) => {
    setNotice('');
    setError('');
    const err = await adminUsers({ action: 'resend', id: u.id });
    if (err) setError(err);
    else setNotice(`Se envió a ${u.email} un enlace para definir su contraseña.`);
  };

  const visible = users.filter((u) => !roleFilter || u.role === roleFilter);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Usuarios</h1>
          <p className="muted">Personal de soporte y contactos de los clientes. Cada usuario recibe un correo para definir su contraseña.</p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setError('');
            setDraft({ ...EMPTY });
          }}>
          + Invitar usuario
        </button>
      </header>

      <div className="filters">
        <label>
          <span className="sr-only">Rol</span>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}>
            <option value="">Todos los roles</option>
            {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {notice && (
        <p className="alert ok" role="status">
          {notice}
        </p>
      )}
      {error && !draft && <p className="alert error">{error}</p>}

      <div className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.full_name || '—'}</strong>
                  </td>
                  <td>{u.email}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>{u.role === 'client' ? orgName(u.organization_id) : <span className="muted">Grupo Ozono</span>}</td>
                  <td>{u.active ? 'Activo' : <span className="muted">Desactivado</span>}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setError('');
                        setDraft({
                          id: u.id,
                          email: u.email,
                          full_name: u.full_name,
                          role: u.role,
                          organization_id: u.organization_id ?? '',
                          active: u.active,
                        });
                      }}>
                      Editar
                    </button>
                    <button type="button" className="link-btn" onClick={() => resend(u)}>
                      Enviar acceso
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!draft} title={draft?.id ? 'Editar usuario' : 'Invitar usuario'} onClose={() => setDraft(null)}>
        {draft && (
          <form className="form" onSubmit={save}>
            <label>
              Correo *
              <input type="email" required disabled={!!draft.id} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </label>
            <label>
              Nombre completo *
              <input required value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
            </label>
            <div className="form-row">
              <label>
                Rol
                <select value={draft.role} disabled={draft.id === me?.id} onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}>
                  {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cliente {draft.role === 'client' && '*'}
                <select
                  required={draft.role === 'client'}
                  value={draft.organization_id}
                  onChange={(e) => setDraft({ ...draft, organization_id: e.target.value })}>
                  <option value="">{draft.role === 'client' ? 'Seleccione…' : '(ninguno)'}</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="hint">
              Cliente: ve y crea solo tiquetes de su empresa. Agente: atiende todos. Administrador: además gestiona usuarios. El personal
              interno que reporta incidentes es «Cliente» de «Grupo Ozono (interno)».
            </p>
            {draft.id && draft.id !== me?.id && (
              <label className="check">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Activo (desmarcar bloquea el acceso)
              </label>
            )}
            {error && <p className="alert error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'Guardando…' : draft.id ? 'Guardar' : 'Enviar invitación'}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
