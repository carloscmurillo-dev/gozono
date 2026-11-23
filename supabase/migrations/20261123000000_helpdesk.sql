-- =============================================================================
-- Help desk Grupo Ozono: esquema inicial
--
-- Roles:
--   admin  -> todo, incluida la gestión de usuarios y catálogos
--   agent  -> atiende tiquetes de todas las organizaciones
--   client -> crea y ve solo los tiquetes de su organización
-- El personal interno de Gozono que reporta incidentes es "client" de la
-- organización interna (is_internal = true).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'agent', 'client');
create type public.ticket_status as enum ('nuevo', 'abierto', 'en_progreso', 'esperando_cliente', 'resuelto', 'cerrado');
create type public.ticket_priority as enum ('baja', 'media', 'alta', 'critica');

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  tax_id text,
  email text,
  phone text,
  address text,
  is_internal boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  phone text,
  role public.user_role not null default 'client',
  organization_id uuid references public.organizations (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index profiles_organization_idx on public.profiles (organization_id);

create table public.categories (
  id serial primary key,
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true
);

-- Metas de atención por prioridad, en minutos.
create table public.sla_policies (
  priority public.ticket_priority primary key,
  first_response_minutes int not null check (first_response_minutes > 0),
  resolution_minutes int not null check (resolution_minutes > 0)
);

create sequence public.ticket_number_seq;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('public.ticket_number_seq'),
  code text generated always as ('GOZ-' || lpad(number::text, 5, '0')) stored,
  subject text not null check (length(trim(subject)) between 1 and 200),
  description text not null default '',
  status public.ticket_status not null default 'nuevo',
  priority public.ticket_priority not null default 'media',
  category_id int references public.categories (id),
  organization_id uuid not null references public.organizations (id),
  requester_id uuid not null references public.profiles (id),
  assignee_id uuid references public.profiles (id),
  site text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  first_response_due_at timestamptz,
  resolution_due_at timestamptz
);
alter sequence public.ticket_number_seq owned by public.tickets.number;
create index tickets_status_idx on public.tickets (status);
create index tickets_org_idx on public.tickets (organization_id);
create index tickets_assignee_idx on public.tickets (assignee_id);
create index tickets_created_idx on public.tickets (created_at desc);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) default auth.uid(),
  body text not null check (length(trim(body)) > 0),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);

create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  comment_id uuid references public.ticket_comments (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) default auth.uid(),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id);

-- Historial de cambios (lo llenan los triggers, nunca la app).
create table public.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at);

-- Mensajes del formulario de contacto del sitio web.
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 160 and email like '%@%'),
  phone text check (length(phone) <= 40),
  message text not null check (length(message) between 1 and 4000),
  handled boolean not null default false,
  handled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Funciones auxiliares (security definer: leen profiles sin pasar por RLS
-- y así las políticas no se vuelven recursivas).
-- -----------------------------------------------------------------------------
create or replace function public.app_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select role in ('admin', 'agent') from public.profiles where id = auth.uid() and active), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and active), false)
$$;

create or replace function public.my_org()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select organization_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.can_view_ticket(p_ticket uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_staff()
      or exists (
        select 1 from public.tickets t
        where t.id = p_ticket and t.organization_id = public.my_org()
      )
$$;

-- -----------------------------------------------------------------------------
-- Alta de usuarios: cada usuario de auth tiene su perfil. Siempre nace como
-- "client" sin organización; el rol y la organización los asigna un admin
-- (Edge Function admin-users). Nunca se confía en metadata del usuario.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un usuario puede editar su nombre y teléfono, pero no su rol, organización,
-- estado ni correo. Solo un admin (o el service role) cambia esos campos.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.organization_id is distinct from old.organization_id
       or new.active is distinct from old.active
       or new.email is distinct from old.email then
      raise exception 'No tiene permiso para cambiar estos datos del perfil';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- -----------------------------------------------------------------------------
-- Tiquetes: valores por defecto, SLA e historial
-- -----------------------------------------------------------------------------
create or replace function public.tickets_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  sla public.sla_policies;
begin
  if not public.is_staff() and auth.uid() is not null then
    -- Un cliente solo crea tiquetes propios, de su organización y sin asignar.
    new.requester_id := auth.uid();
    new.organization_id := public.my_org();
    new.status := 'nuevo';
    new.assignee_id := null;
    if new.organization_id is null then
      raise exception 'Su usuario no tiene una organización asignada';
    end if;
  end if;

  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  new.updated_at := now();

  select * into sla from public.sla_policies where priority = new.priority;
  if found then
    new.first_response_due_at := new.created_at + make_interval(mins => sla.first_response_minutes);
    new.resolution_due_at := new.created_at + make_interval(mins => sla.resolution_minutes);
  end if;
  return new;
end;
$$;

create trigger tickets_before_insert
  before insert on public.tickets
  for each row execute function public.tickets_before_insert();

create or replace function public.tickets_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  sla public.sla_policies;
begin
  new.updated_at := now();

  -- Datos que no cambian nunca.
  new.number := old.number;
  new.created_at := old.created_at;
  new.created_by := old.created_by;

  if new.priority is distinct from old.priority then
    select * into sla from public.sla_policies where priority = new.priority;
    if found then
      new.resolution_due_at := new.created_at + make_interval(mins => sla.resolution_minutes);
      if new.first_response_at is null then
        new.first_response_due_at := new.created_at + make_interval(mins => sla.first_response_minutes);
      end if;
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('resuelto', 'cerrado') and new.resolved_at is null then
      new.resolved_at := now();
    elsif new.status not in ('resuelto', 'cerrado') then
      new.resolved_at := null;
    end if;
    new.closed_at := case when new.status = 'cerrado' then now() else null end;
    -- Al pasar de "nuevo" a otro estado el personal ya tomó el caso.
    if old.status = 'nuevo' and new.first_response_at is null then
      new.first_response_at := now();
    end if;
  end if;

  -- Asignar un tiquete nuevo lo abre.
  if new.assignee_id is not null and old.assignee_id is null and new.status = 'nuevo' then
    new.status := 'abierto';
  end if;
  return new;
end;
$$;

create trigger tickets_before_update
  before update on public.tickets
  for each row execute function public.tickets_before_update();

create or replace function public.tickets_log_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events (ticket_id, actor_id, event_type, to_value)
    values (new.id, auth.uid(), 'creado', new.status::text);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.ticket_events (ticket_id, actor_id, event_type, from_value, to_value)
    values (new.id, auth.uid(), 'estado', old.status::text, new.status::text);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.ticket_events (ticket_id, actor_id, event_type, from_value, to_value)
    values (new.id, auth.uid(), 'prioridad', old.priority::text, new.priority::text);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.ticket_events (ticket_id, actor_id, event_type, from_value, to_value)
    values (
      new.id, auth.uid(), 'asignado',
      (select full_name from public.profiles where id = old.assignee_id),
      (select full_name from public.profiles where id = new.assignee_id)
    );
  end if;
  if new.category_id is distinct from old.category_id then
    insert into public.ticket_events (ticket_id, actor_id, event_type, from_value, to_value)
    values (
      new.id, auth.uid(), 'categoria',
      (select name from public.categories where id = old.category_id),
      (select name from public.categories where id = new.category_id)
    );
  end if;
  return new;
end;
$$;

create trigger tickets_log_events
  after insert or update on public.tickets
  for each row execute function public.tickets_log_events();

-- -----------------------------------------------------------------------------
-- Comentarios: primera respuesta y reapertura automática
-- -----------------------------------------------------------------------------
create or replace function public.comments_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_at := now();
  if auth.uid() is not null then
    new.author_id := auth.uid();
    if not public.is_staff() then
      new.is_internal := false;
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_before_insert
  before insert on public.ticket_comments
  for each row execute function public.comments_before_insert();

create or replace function public.comments_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  author_role public.user_role;
begin
  select role into author_role from public.profiles where id = new.author_id;

  if author_role in ('admin', 'agent') then
    if not new.is_internal then
      update public.tickets
         set first_response_at = coalesce(first_response_at, now()),
             status = case when status = 'nuevo' then 'abierto'::public.ticket_status else status end
       where id = new.ticket_id;
    end if;
  else
    -- El cliente respondió: el caso vuelve a la cola del personal.
    update public.tickets
       set status = case
             when status in ('esperando_cliente', 'resuelto') then 'abierto'::public.ticket_status
             else status
           end,
           updated_at = now()
     where id = new.ticket_id;
  end if;
  return new;
end;
$$;

create trigger comments_after_insert
  after insert on public.ticket_comments
  for each row execute function public.comments_after_insert();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.sla_policies enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ticket_events enable row level security;
alter table public.contact_messages enable row level security;

-- organizations
create policy "org: personal ve todas, cliente la suya" on public.organizations
  for select to authenticated using (public.is_staff() or id = public.my_org());
create policy "org: personal crea" on public.organizations
  for insert to authenticated with check (public.is_staff());
create policy "org: personal edita" on public.organizations
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "org: admin borra" on public.organizations
  for delete to authenticated using (public.is_admin());

-- profiles
create policy "perfil: visibles" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.is_staff()
    or organization_id = public.my_org()
    or role in ('admin', 'agent')
  );
create policy "perfil: propio o admin edita" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- categories / sla_policies
create policy "categorias: lectura" on public.categories
  for select to authenticated using (true);
create policy "categorias: admin escribe" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "sla: lectura" on public.sla_policies
  for select to authenticated using (true);
create policy "sla: admin escribe" on public.sla_policies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- tickets
create policy "tiquete: lectura" on public.tickets
  for select to authenticated using (public.is_staff() or organization_id = public.my_org());
create policy "tiquete: creación" on public.tickets
  for insert to authenticated with check (
    public.is_staff()
    or (organization_id = public.my_org() and requester_id = auth.uid())
  );
create policy "tiquete: personal edita" on public.tickets
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "tiquete: admin borra" on public.tickets
  for delete to authenticated using (public.is_admin());

-- ticket_comments
create policy "comentario: lectura" on public.ticket_comments
  for select to authenticated using (
    public.is_staff() or (not is_internal and public.can_view_ticket(ticket_id))
  );
create policy "comentario: creación" on public.ticket_comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and public.can_view_ticket(ticket_id)
    and (public.is_staff() or not is_internal)
  );

-- ticket_attachments
create policy "adjunto: lectura" on public.ticket_attachments
  for select to authenticated using (
    public.is_staff()
    or (
      public.can_view_ticket(ticket_id)
      and (comment_id is null or exists (
        select 1 from public.ticket_comments c where c.id = comment_id and not c.is_internal
      ))
    )
  );
create policy "adjunto: creación" on public.ticket_attachments
  for insert to authenticated with check (uploaded_by = auth.uid() and public.can_view_ticket(ticket_id));
create policy "adjunto: autor o admin borra" on public.ticket_attachments
  for delete to authenticated using (uploaded_by = auth.uid() or public.is_admin());

-- ticket_events
create policy "historial: lectura" on public.ticket_events
  for select to authenticated using (public.can_view_ticket(ticket_id));

-- contact_messages: el sitio público solo puede insertar.
create policy "contacto: el sitio inserta" on public.contact_messages
  for insert to anon, authenticated with check (handled = false and handled_by is null);
create policy "contacto: personal lee" on public.contact_messages
  for select to authenticated using (public.is_staff());
create policy "contacto: personal marca atendido" on public.contact_messages
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- Storage: adjuntos privados en la ruta <ticket_id>/<archivo>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do nothing;

create policy "adjuntos: lectura" on storage.objects
  for select to authenticated using (
    bucket_id = 'attachments'
    and public.can_view_ticket(((storage.foldername(name))[1])::uuid)
  );
create policy "adjuntos: subida" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'attachments'
    and public.can_view_ticket(((storage.foldername(name))[1])::uuid)
  );
create policy "adjuntos: borrado" on storage.objects
  for delete to authenticated using (
    bucket_id = 'attachments' and (owner_id = auth.uid()::text or public.is_admin())
  );

-- -----------------------------------------------------------------------------
-- Dashboard (security invoker: respeta RLS, cada rol ve sus números)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_stats(p_days int default 30)
returns jsonb
language sql stable
set search_path = ''
as $$
  with t as (select * from public.tickets),
  since as (select now() - make_interval(days => p_days) as d),
  weeks as (
    select generate_series(
      date_trunc('week', now()) - interval '7 weeks',
      date_trunc('week', now()),
      interval '1 week'
    ) as wk
  )
  select jsonb_build_object(
    'open', (select count(*) from t where status not in ('resuelto', 'cerrado')),
    'unassigned', (select count(*) from t where assignee_id is null and status not in ('resuelto', 'cerrado')),
    'overdue', (select count(*) from t where status not in ('resuelto', 'cerrado') and resolution_due_at < now()),
    'waiting_client', (select count(*) from t where status = 'esperando_cliente'),
    'created_period', (select count(*) from t, since where created_at >= since.d),
    'resolved_period', (select count(*) from t, since where resolved_at >= since.d),
    'avg_first_response_minutes', (
      select round(avg(extract(epoch from first_response_at - created_at) / 60))
      from t, since where first_response_at is not null and created_at >= since.d
    ),
    'avg_resolution_hours', (
      select round((avg(extract(epoch from resolved_at - created_at) / 3600))::numeric, 1)
      from t, since where resolved_at is not null and resolved_at >= since.d
    ),
    'sla_met_pct', (
      select round(100.0 * count(*) filter (where resolved_at <= resolution_due_at) / nullif(count(*), 0))
      from t, since where resolved_at is not null and resolved_at >= since.d and resolution_due_at is not null
    ),
    'by_status', (
      select coalesce(jsonb_object_agg(status::text, n), '{}'::jsonb)
      from (select status, count(*) n from t group by status) s
    ),
    'by_priority_open', (
      select coalesce(jsonb_object_agg(priority::text, n), '{}'::jsonb)
      from (select priority, count(*) n from t where status not in ('resuelto', 'cerrado') group by priority) s
    ),
    'by_category_open', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc), '[]'::jsonb)
      from (
        select coalesce(c.name, 'Sin categoría') as name, count(*) n
        from t left join public.categories c on c.id = t.category_id
        where t.status not in ('resuelto', 'cerrado')
        group by 1
      ) s
    ),
    'by_assignee_open', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc), '[]'::jsonb)
      from (
        select coalesce(nullif(p.full_name, ''), p.email, 'Sin asignar') as name, count(*) n
        from t left join public.profiles p on p.id = t.assignee_id
        where t.status not in ('resuelto', 'cerrado')
        group by 1
      ) s
    ),
    'by_org_period', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc), '[]'::jsonb)
      from (
        select o.name, count(*) n
        from t join public.organizations o on o.id = t.organization_id, since
        where t.created_at >= since.d
        group by o.name
        order by n desc
        limit 8
      ) s
    ),
    'weekly', (
      select jsonb_agg(jsonb_build_object(
        'week', to_char(w.wk, 'YYYY-MM-DD'),
        'created', (select count(*) from t where created_at >= w.wk and created_at < w.wk + interval '1 week'),
        'resolved', (select count(*) from t where resolved_at >= w.wk and resolved_at < w.wk + interval '1 week')
      ) order by w.wk)
      from weeks w
    )
  )
$$;

grant execute on function public.dashboard_stats(int) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: la vista de detalle escucha comentarios y cambios del tiquete
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.tickets, public.ticket_comments;

-- -----------------------------------------------------------------------------
-- Datos base
-- -----------------------------------------------------------------------------
insert into public.categories (name, sort_order) values
  ('DAS activo', 1),
  ('Wi-Fi', 2),
  ('Enlaces / backhaul', 3),
  ('Fibra óptica', 4),
  ('Equipos de radiofrecuencia', 5),
  ('Otro', 99);

-- Metas iniciales (ajustables desde la base de datos).
insert into public.sla_policies (priority, first_response_minutes, resolution_minutes) values
  ('critica', 30, 8 * 60),
  ('alta', 2 * 60, 24 * 60),
  ('media', 8 * 60, 3 * 24 * 60),
  ('baja', 24 * 60, 7 * 24 * 60);

insert into public.organizations (name, is_internal) values ('Grupo Ozono (interno)', true);
