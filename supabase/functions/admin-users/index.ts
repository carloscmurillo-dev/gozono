// Gestión de usuarios para administradores del help desk:
//   { action: 'invite', email, full_name, role, organization_id }
//   { action: 'update', id, full_name?, role?, organization_id?, active? }
//   { action: 'resend', id }   -> reenvía el correo para definir contraseña
// Usa la service role key, por eso valida primero que quien llama sea admin.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const HELPDESK_URL = (Deno.env.get('HELPDESK_URL') ?? 'https://soporte.gozono.com').replace(/\/$/, '');
const ROLES = ['admin', 'agent', 'client'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  // Quién llama (verify_jwt ya validó la firma del token).
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: 'Sesión inválida' }, 401);
  const { data: caller } = await admin.from('profiles').select('role, active').eq('id', userData.user.id).single();
  if (!caller || caller.role !== 'admin' || !caller.active) return json({ error: 'Solo un administrador puede gestionar usuarios' }, 403);

  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const fullName = String(body.full_name ?? '').trim();
      const role = String(body.role ?? 'client');
      const organizationId = body.organization_id || null;
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Correo inválido' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Rol inválido' }, 400);
      if (role === 'client' && !organizationId) return json({ error: 'Un cliente necesita una organización' }, 400);

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${HELPDESK_URL}/restablecer`,
      });
      if (error) return json({ error: error.message }, 400);

      // El trigger handle_new_user creó el perfil como "client"; aquí se le
      // asigna el rol y la organización reales.
      const { error: profileErr } = await admin
        .from('profiles')
        .update({ full_name: fullName, role, organization_id: organizationId })
        .eq('id', data.user.id);
      if (profileErr) return json({ error: profileErr.message }, 400);
      return json({ ok: true, id: data.user.id });
    }

    if (body.action === 'update') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Falta el usuario' }, 400);
      if (id === userData.user.id && ((body.role && body.role !== 'admin') || body.active === false)) {
        return json({ error: 'No puede quitarse a sí mismo el rol de administrador ni desactivarse' }, 400);
      }
      const patch: Record<string, unknown> = {};
      if (body.full_name !== undefined) patch.full_name = String(body.full_name).trim();
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) return json({ error: 'Rol inválido' }, 400);
        patch.role = body.role;
      }
      if (body.organization_id !== undefined) patch.organization_id = body.organization_id || null;
      if (body.active !== undefined) patch.active = Boolean(body.active);

      const { error } = await admin.from('profiles').update(patch).eq('id', id);
      if (error) return json({ error: error.message }, 400);

      // Un usuario desactivado tampoco puede iniciar sesión.
      if (body.active !== undefined) {
        await admin.auth.admin.updateUserById(id, { ban_duration: body.active ? 'none' : '876000h' });
      }
      return json({ ok: true });
    }

    if (body.action === 'resend') {
      const { data: profile } = await admin.from('profiles').select('email').eq('id', body.id).single();
      if (!profile) return json({ error: 'Usuario no encontrado' }, 404);
      const { error } = await admin.auth.resetPasswordForEmail(profile.email, { redirectTo: `${HELPDESK_URL}/restablecer` });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Acción desconocida' }, 400);
  } catch (err) {
    console.error('admin-users error', err);
    return json({ error: 'Error interno' }, 500);
  }
});
