"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ModalShell({
  isOpen,
  onClose,
  children,
  maxWidth = "max-w-md",
  accent = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  accent?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the effect (and re-focusing) on every parent render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") return close.current();
      if (e.key !== "Tab" || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* bg-[var(--color-surface)], not bg-surface: globals.css turns .bg-surface into see-through glass. */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        className={`animate-modal-in relative w-full overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--color-surface)] shadow-glass-modal ${maxWidth}`}
      >
        {accent && <div className="accent-stripe" />}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-surface2 text-muted transition-colors hover:text-text"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M1 1l8 8M9 1L1 9" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
