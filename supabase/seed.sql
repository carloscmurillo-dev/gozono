-- =============================================================================
-- Datos de prueba SOLO para desarrollo local (supabase db reset).
-- No se aplica en producción. Usuarios locales (contraseña común abajo):
--   admin@gozono.test   -> Administrador
--   agente@gozono.test  -> Agente
--   cliente@acme.test   -> Cliente de "Hospital Acme"
-- Contraseña local de todos: Gozono-Local-2026
-- =============================================================================

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@gozono.test', 'Ana Administradora'),
      ('a0000000-0000-4000-8000-000000000002'::uuid, 'agente@gozono.test', 'Luis Agente'),
      ('a0000000-0000-4000-8000-000000000003'::uuid, 'cliente@acme.test', 'Carla Cliente')
    ) as t(id, email, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('Gozono-Local-2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name), now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now());
  end loop;
end $$;

insert into public.organizations (id, name, email, phone) values
  ('b0000000-0000-4000-8000-000000000001', 'Hospital Acme', 'ti@acme.test', '+506 2222-0000'),
  ('b0000000-0000-4000-8000-000000000002', 'Centro Comercial Beta', 'operaciones@beta.test', null);

update public.profiles set role = 'admin' where email = 'admin@gozono.test';
update public.profiles set role = 'agent' where email = 'agente@gozono.test';
update public.profiles set organization_id = 'b0000000-0000-4000-8000-000000000001' where email = 'cliente@acme.test';

-- Tiquetes de ejemplo repartidos en las últimas semanas (sin triggers, para
-- poder fijar fechas pasadas).
set session_replication_role = replica;

insert into public.tickets
  (subject, description, status, priority, category_id, organization_id, requester_id, assignee_id, site,
   created_at, updated_at, first_response_at, resolved_at, first_response_due_at, resolution_due_at)
select
  s.subject, s.description, s.status::public.ticket_status, s.priority::public.ticket_priority,
  (select id from public.categories where name = s.category),
  s.org::uuid, 'a0000000-0000-4000-8000-000000000003', s.assignee::uuid, s.site,
  now() - make_interval(days => s.age_days),
  now() - make_interval(days => greatest(s.age_days - 1, 0)),
  case when s.status <> 'nuevo' then now() - make_interval(days => s.age_days) + interval '90 minutes' end,
  case when s.status in ('resuelto', 'cerrado') then now() - make_interval(days => greatest(s.age_days - 2, 0)) end,
  now() - make_interval(days => s.age_days) + interval '2 hours',
  now() - make_interval(days => s.age_days) + interval '3 days'
from (values
  ('Sin señal 4G en sótano 2', 'Desde ayer no hay cobertura en el parqueo subterráneo.', 'en_progreso', 'alta', 'DAS activo', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Torre B, sótano 2', 1),
  ('Access point sin conexión, piso 3', 'El AP del pasillo norte parpadea en naranja.', 'nuevo', 'media', 'Wi-Fi', 'b0000000-0000-4000-8000-000000000001', null, 'Piso 3, pasillo norte', 0),
  ('Intermitencia en enlace punto a punto', 'Caídas de 2-3 minutos varias veces al día.', 'esperando_cliente', 'alta', 'Enlaces / backhaul', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'Azotea', 5),
  ('Solicitud de estudio de sitio Wi-Fi', 'Ampliación del área de food court.', 'resuelto', 'baja', 'Wi-Fi', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Food court', 12),
  ('Fibra dañada en canalización', 'Corte por obra civil.', 'cerrado', 'critica', 'Fibra óptica', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Acceso principal', 20),
  ('Cambio de antena en lobby', 'Antena dañada por filtración.', 'resuelto', 'media', 'DAS activo', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Lobby', 33),
  ('Cobertura débil en quirófanos', 'Personal reporta llamadas caídas.', 'abierto', 'alta', 'DAS activo', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Ala quirúrgica', 9)
) as s(subject, description, status, priority, category, org, assignee, site, age_days);

set session_replication_role = origin;

insert into public.contact_messages (name, email, phone, message) values
  ('Mario Pérez', 'mario@ejemplo.test', '8888-0000', 'Quisiera una cotización de DAS para un edificio de 6 pisos.');
