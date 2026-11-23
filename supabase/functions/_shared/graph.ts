// Envío de correo con Microsoft Graph (client credentials). Requiere una app
// registrada en Entra ID con el permiso de aplicación Mail.Send. Conviene
// restringirla al buzón de soporte con una Application Access Policy.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const tenant = Deno.env.get('GRAPH_TENANT_ID');
  const body = new URLSearchParams({
    client_id: Deno.env.get('GRAPH_CLIENT_ID') ?? '',
    client_secret: Deno.env.get('GRAPH_CLIENT_SECRET') ?? '',
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`Graph token ${res.status}: ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

export type Mail = { to: string[]; subject: string; html: string; replyTo?: string };

export async function sendMail({ to, subject, html, replyTo }: Mail): Promise<void> {
  const recipients = [...new Set(to.filter(Boolean).map((e) => e.toLowerCase()))];
  if (recipients.length === 0) return;

  const from = Deno.env.get('GRAPH_MAIL_FROM');
  const token = await getToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from ?? '')}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        // Cada destinatario en copia oculta: un cliente no ve los correos de otros.
        bccRecipients: recipients.map((address) => ({ emailAddress: { address } })),
        replyTo: replyTo ? [{ emailAddress: { address: replyTo } }] : undefined,
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail ${res.status}: ${await res.text()}`);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export { esc };

// Plantilla con los colores del sitio.
export function layout(title: string, bodyHtml: string, cta?: { label: string; href: string }): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#EEF4F6;font-family:Segoe UI,Arial,sans-serif;color:#05161A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#05161A;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700">Grupo Ozono · Soporte</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#05161A">${esc(title)}</h1>
${bodyHtml}
${
  cta
    ? `<p style="margin:28px 0 0"><a href="${cta.href}" style="background:#0C7075;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : ''
}
</td></tr>
<tr><td style="padding:16px 28px;background:#F4F8F9;color:#3D6070;font-size:12px">Grupo Ozono Internacional S. A. · +506 2297-4585 · info@gozono.com</td></tr>
</table></td></tr></table></body></html>`;
}
