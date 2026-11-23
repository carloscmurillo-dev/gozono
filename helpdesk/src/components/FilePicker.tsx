import { useId, useRef } from 'react';
import { formatBytes } from '../lib/format';
import { MAX_ATTACHMENT_BYTES } from '../lib/supabase';

export function FilePicker({ files, onChange, compact }: { files: File[]; onChange: (f: File[]) => void; compact?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className={compact ? 'files compact' : 'files'}>
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => {
          onChange([...files, ...Array.from(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <label htmlFor={id} className="btn ghost small">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l8-8" />
        </svg>
        Adjuntar archivos
      </label>
      {!compact && <span className="hint">Fotos, PDF, logs… hasta 25 MB por archivo.</span>}
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className={f.size > MAX_ATTACHMENT_BYTES ? 'too-big' : ''}>
              <span>{f.name}</span>
              <span className="muted">{f.size > MAX_ATTACHMENT_BYTES ? 'supera 25 MB' : formatBytes(f.size)}</span>
              <button type="button" className="icon-btn" aria-label={`Quitar ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
