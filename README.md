# Grupo Ozono — sitio web y help desk

| Carpeta | Qué es | Stack | Dominio |
|---|---|---|---|
| `web/` | Sitio informativo (reemplaza el WordPress) | Astro 5, HTML estático | `gozono.com` |
| `helpdesk/` | Sistema de tiquetes con dashboard | React 19 + Vite + TypeScript | `soporte.gozono.com` |
| `supabase/` | Base de datos, seguridad, archivos y funciones | Supabase (Postgres 17, Auth, Storage, Edge Functions) | — |

## Cómo funciona el help desk

**Roles**
- **Administrador**: todo, más la gestión de usuarios (menú *Usuarios*).
- **Agente**: atiende los tiquetes de todos los clientes, gestiona clientes y mensajes del sitio.
- **Cliente**: crea y ve solo los tiquetes de su empresa. El personal interno de Gozono que reporta
  incidentes es *Cliente* de la organización «Grupo Ozono (interno)».

**No hay registro público**: un administrador invita a cada usuario, que recibe un correo para definir su contraseña.

**Tiquete**
- Folio `GOZ-00001`, estados *Nuevo → Abierto → En progreso → Esperando cliente → Resuelto → Cerrado*.
- Prioridad, categoría, sitio, responsable, comentarios públicos y **notas internas** (el cliente no las ve), adjuntos privados de hasta 25 MB e historial de cambios.
- Metas de atención (SLA) por prioridad en la tabla `sla_policies`: crítica 30 min / 8 h, alta 2 h / 24 h, media 8 h / 3 días, baja 24 h / 7 días.

**Reglas automáticas en la base de datos**
- Asignar un tiquete nuevo lo pasa a *Abierto*.
- La primera respuesta pública de un agente registra la hora de primera respuesta.
- Si el cliente responde a un tiquete *Esperando cliente* o *Resuelto*, se reabre solo.
- Un cliente no puede cambiar el estado, la prioridad, el responsable ni la organización (lo bloquea RLS en Postgres, no solo la interfaz).

**Correos** (Edge Function `notify` vía Microsoft Graph, buzón de M365):
- tiquete nuevo → al personal y acuse de recibo al cliente;
- asignación → al agente;
- *Esperando cliente / Resuelto / Cerrado* → al cliente;
- respuesta del agente → al cliente; respuesta del cliente → al responsable (o a todo el personal si no hay responsable);
- mensaje del formulario del sitio → `info@gozono.com`.

## Desarrollo local

Requisitos: Node 20+, Docker Desktop.

```bash
npx supabase start                 # levanta Postgres, Auth, Storage, Realtime y Mailpit
npx supabase db reset              # aplica la migración y supabase/seed.sql (datos de prueba)
npx supabase status -o env         # muestra ANON_KEY local

# helpdesk/.env.local  -> VITE_SUPABASE_URL=http://127.0.0.1:54321, VITE_SUPABASE_ANON_KEY=<ANON_KEY>
# web/.env.local       -> PUBLIC_SUPABASE_URL=..., PUBLIC_SUPABASE_ANON_KEY=..., PUBLIC_HELPDESK_URL=http://localhost:5173
cd helpdesk && npm install && npm run dev      # http://localhost:5173
cd web && npm install && npm run dev           # http://localhost:4321

# Edge Functions (copiar supabase/functions/.env.example a supabase/functions/.env)
npx supabase functions serve --env-file supabase/functions/.env
```

Los usuarios de prueba locales y su contraseña están documentados al inicio de `supabase/seed.sql`.
Los correos de Auth (invitaciones, recuperación) se ven en Mailpit: http://127.0.0.1:54324.

## Puesta en producción

### 1. Supabase
1. Crear el proyecto en supabase.com (región `us-east-1` o la más cercana). **Plan Pro** recomendado: el gratuito pausa el proyecto tras 7 días sin actividad y no tiene respaldos diarios.
2. Enlazar y aplicar el esquema (no ejecutar `seed.sql` en producción):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. **Authentication → Sign In / Providers**: desactivar *Allow new users to sign up*.
4. **Authentication → URL Configuration**: Site URL `https://soporte.gozono.com`; Redirect URLs `https://soporte.gozono.com/restablecer`.
5. **Authentication → Email Templates**: pegar `supabase/templates/invite.html` y `recovery.html` (con sus asuntos de `config.toml`).
6. **Authentication → SMTP**: el SMTP integrado de Supabase solo envía unos pocos correos por hora. Configurar uno propio: `smtp.office365.com:587` con un buzón de M365 que tenga *SMTP AUTH* habilitado, o un servicio como Resend/SendGrid.
7. Funciones y secretos:
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env   # completar valores
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy notify --no-verify-jwt
   npx supabase functions deploy admin-users
   ```
8. **Database → Webhooks**: crear tres webhooks de tipo *Supabase Edge Function* → `notify`, método POST, con el encabezado `x-webhook-secret: <WEBHOOK_SECRET>`:
   - `tickets` (Insert, Update), `ticket_comments` (Insert), `contact_messages` (Insert).
9. **Primer administrador**: invitar desde *Authentication → Users → Invite user*. Después, en el SQL Editor:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Nombre Apellido' where email = 'admin@gozono.com';
   ```
   Desde ahí, el resto de usuarios se invita desde el help desk (*Usuarios*).

### 2. Microsoft 365 (envío de correos)
1. Entra ID → *App registrations* → nueva app «Gozono Help Desk».
2. *API permissions* → Microsoft Graph → **Application** → `Mail.Send` → *Grant admin consent*.
3. *Certificates & secrets* → nuevo client secret.
4. Copiar `Tenant ID`, `Client ID` y el secreto a `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`.
5. Recomendado: limitar la app al buzón `soporte@gozono.com` con una *Application Access Policy* de Exchange Online.

### 3. Hosting (Vercel, Netlify o Cloudflare Pages)
- **Sitio**: proyecto con raíz `web/`, comando `npm run build`, salida `dist/`. Variables `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_HELPDESK_URL`.
- **Help desk**: proyecto con raíz `helpdesk/`, comando `npm run build`, salida `dist/`. Variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. (`vercel.json` ya redirige las rutas al SPA.)

### 4. DNS en GoDaddy
- **No tocar** los registros de correo de Microsoft 365: `MX`, `TXT` de SPF (`v=spf1 include:spf.protection.outlook.com …`), `CNAME` de DKIM (`selector1/2._domainkey`) y `autodiscover`.
- Cambiar solo `@` y `www` según indique el hosting, y agregar `CNAME soporte → <hosting>`.
- Hacer el cambio **después** de verificar el sitio nuevo en su URL temporal.

### 5. Antes de apagar el WordPress
- Copiar los 6 PDFs de *Material complementario* a `web/public/recursos/` (los nombres esperados están en `web/src/data/site.ts`). URLs actuales: `https://gozono.com/wp-content/uploads/2025/0{5,6}/…pdf`.
- Copiar fotos de proyectos y logos de marcas/clientes (hoy se muestran como marcadores en el sitio).
- Las URLs viejas (`/about`, `/services`, `/contact`, `/documentacion-tecnica`, `/support-portal`…) ya redirigen a las nuevas (`web/astro.config.mjs`).

## Pendientes conocidos
- Logo en versión clara para fondo oscuro (hoy va sobre una placa blanca).
- Fotos reales de proyectos y logos de marcas.
- Fase 2: crear tiquetes respondiendo correos, encuestas de satisfacción, base de conocimiento, exportar a Excel.
