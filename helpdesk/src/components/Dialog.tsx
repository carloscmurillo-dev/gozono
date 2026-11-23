import { useEffect, useRef, type ReactNode } from 'react';

// Modal accesible sobre <dialog> nativo (foco atrapado y Escape incluidos).
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="dialog-title">
      <header className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
      </header>
      {open && children}
    </dialog>
  );
}
