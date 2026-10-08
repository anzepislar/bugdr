"use client";

import { useEffect, useRef } from "react";

/** Modal confirm on the native <dialog>: focus trap, Esc and the backdrop come from the browser. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      // Esc fires "cancel"; keep the dialog in sync with React state instead of letting it close itself.
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-md border border-border bg-surface p-6 text-text backdrop:bg-canvas/70"
    >
      <h2 id="confirm-dialog-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-failed">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded border border-border px-4 py-1.5 text-sm text-text hover:border-action disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded bg-failed px-4 py-1.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Please wait…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
