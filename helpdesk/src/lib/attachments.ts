import { ATTACHMENTS_BUCKET, MAX_ATTACHMENT_BYTES, supabase } from './supabase';
import type { Attachment } from './types';

// Sube archivos a <ticket_id>/<uuid>-<nombre> y registra cada uno en
// ticket_attachments. Devuelve los nombres que no se pudieron subir.
export async function uploadAttachments(ticketId: string, files: File[], commentId: string | null, userId: string) {
  const failed: string[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      failed.push(`${file.name} (supera 25 MB)`);
      continue;
    }
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${ticketId}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, {
      contentType: file.type || undefined,
    });
    if (upErr) {
      failed.push(file.name);
      continue;
    }
    const { error: rowErr } = await supabase.from('ticket_attachments').insert({
      ticket_id: ticketId,
      comment_id: commentId,
      uploaded_by: userId,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
    });
    if (rowErr) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
      failed.push(file.name);
    }
  }
  return failed;
}

// Los adjuntos son privados: se abren con un enlace firmado de corta duración.
export async function openAttachment(att: Attachment) {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(att.storage_path, 60, {
    download: att.file_name,
  });
  if (error || !data) throw error ?? new Error('No se pudo abrir el archivo');
  window.open(data.signedUrl, '_blank', 'noopener');
}
