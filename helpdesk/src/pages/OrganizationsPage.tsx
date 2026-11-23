import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errorMessage } from '../lib/supabase';
import type { Organization } from '../lib/types';
import { Dialog } from '../components/Dialog';

type OrgWithCounts = Organization & { tickets: { count: number }[]; profiles: { count: number }[] };
type Draft = Pick<Organization, 'name' | 'tax_id' | 'email' | 'phone' | 'address' | 'active'> & { id?: string };

const EMPTY: Draft = { name: '', tax_id: '', email: '', phone: '', address: '', active: true };

export function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgWithCounts[]>([]);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    supabase
      .from('organizations')
      .select('*, tickets(count), profiles(count)')
      .order('name')
      .then(({ data, error: err }) => {
        if (err) setError(errorMessage(err));
        else setOrgs((data as OrgWithCounts[]) ?? []);
      });

  useEffect(() => {
    load();
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    const row = {
      name: draft.name.trim(),
      tax_id: draft.tax_id?.trim() || null,
      email: draft.email?.trim() || null,
      phone: draft.phone?.trim() || null,
      address: draft.address?.trim() || null,
      active: draft.active,
    };
    const { error: err } = draft.id
      ? await supabase.from('organizations').update(row).eq('id', draft.id)
      : await supabase.from('organizations').insert(row);
    setBusy(false);
    if (err) {
      setError(err.code === '23505' ? 'Ya existe un cliente con ese nombre.' : errorMessage(err));
      return;
    }
    setDraft(null);
    load();
  };

  const visible = orgs.filter((o) => o.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Clientes</h1>
          <p className="muted">Empresas e instituciones que reportan tiquetes.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setDraft({ ...EMPTY })}>
          + Nuevo cliente
        </button>
      </header>

      <div className="filters">
        <label className="search">
          <span className="sr-only">Filtrar</span>
          <input type="search" placeholder="Filtrar por nombre" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      </div>

      {error && !draft && <p className="alert error">{error}</p>}

      <div className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cédula jurídica</th>
                <th>Contacto</th>
                <th>Usuarios</th>
                <th>Tiquetes</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.name}</strong>
                    {o.is_internal && <span className="tag">Interno</span>}
                  </td>
                  <td>{o.tax_id || '—'}</td>
                  <td>
                    {o.email || '—'}
                    {o.phone && (
                      <>
                        <br />
                        <span className="muted">{o.phone}</span>
                      </>
                    )}
                  </td>
                  <td>{o.profiles[0]?.count ?? 0}</td>
                  <td>
                    <Link to={`/tiquetes?cliente=${o.id}&estado=todos`}>{o.tickets[0]?.count ?? 0}</Link>
                  </td>
                  <td>{o.active ? 'Activo' : <span className="muted">Inactivo</span>}</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setDraft({ ...o })}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No hay clientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!draft} title={draft?.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={() => setDraft(null)}>
        {draft && (
          <form className="form" onSubmit={save}>
            <label>
              Nombre *
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div className="form-row">
              <label>
                Cédula jurídica
                <input value={draft.tax_id ?? ''} onChange={(e) => setDraft({ ...draft, tax_id: e.target.value })} />
              </label>
              <label>
                Teléfono
                <input value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </label>
            </div>
            <label>
              Correo
              <input type="email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </label>
            <label>
              Dirección
              <textarea rows={2} value={draft.address ?? ''} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Activo
            </label>
            {error && <p className="alert error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
