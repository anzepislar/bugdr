"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

// Replaces the native <select> (its popup cannot be styled). Select-only combobox pattern
// (WAI-ARIA APG): focus stays on the button, the listbox is portalled to <body> at a fixed
// position, so `className` styles the button exactly like the old <select>.
export function Select<T extends string>({
  value,
  defaultValue,
  onChange,
  options,
  className = "",
  id,
  "aria-label": ariaLabel,
}: {
  value?: T;
  /** Uncontrolled use; `value` wins when both are given. */
  defaultValue?: T;
  onChange?: (value: T) => void;
  options: readonly SelectOption<T>[];
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value);
  const current = value ?? inner;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === current),
  );

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;

  const show = (index: number) => {
    const rect = buttonRef.current!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const up = below < 200 && above > below;
    setPosition({
      left: rect.left,
      minWidth: rect.width,
      maxHeight: Math.min(288, (up ? above : below) - 4),
      ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
    setActive(index);
    setOpen(true);
  };

  const choose = (index: number) => {
    const next = options[index].value;
    setOpen(false);
    if (next === current) return;
    setInner(next);
    onChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    // The list is fixed to where the button was, so any page scroll or resize closes it.
    const scroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is derived from a stable id
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent) => {
    const last = options.length - 1;
    const move = (index: number) => {
      e.preventDefault();
      if (open) setActive(index);
      else show(selectedIndex);
    };
    switch (e.key) {
      case "ArrowDown":
        return move(Math.min(active + 1, last));
      case "ArrowUp":
        return move(Math.max(active - 1, 0));
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "Enter":
      case " ":
        e.preventDefault();
        return open ? choose(active) : show(selectedIndex);
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      case "Tab":
        return setOpen(false);
    }
    // Type-ahead: jump to the first option starting with what was typed in the last 500 ms.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const text = (now - typed.current.at < 500 ? typed.current.text : "") + e.key.toLowerCase();
      typed.current = { text, at: now };
      const match = options.findIndex((o) => o.label.toLowerCase().startsWith(text));
      if (match < 0) return;
      if (open) setActive(match);
      else show(match);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={(e) => {
          e.currentTarget.focus(); // Safari does not focus buttons on click; keys need it
          if (open) setOpen(false);
          else show(selectedIndex);
        }}
        onKeyDown={onKeyDown}
        className={`inline-flex cursor-pointer items-center justify-between gap-2 text-left ${className}`}
      >
        <span className="min-w-0 truncate">{options[selectedIndex]?.label}</span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 shrink-0 text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            style={position}
            className="fixed z-50 max-w-[calc(100vw-2rem)] overflow-y-auto rounded border border-border bg-surface py-1 text-sm shadow-lg shadow-black/40"
          >
            {options.map((o, i) => {
              const selected = i === selectedIndex;
              return (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex cursor-pointer items-center justify-between gap-4 whitespace-nowrap px-3 py-2 ${
                    i === active ? "bg-border/60" : ""
                  } ${selected ? "text-action" : "text-text"}`}
                >
                  {o.label}
                  <Icon name="check" className={`h-4 w-4 shrink-0 ${selected ? "" : "invisible"}`} />
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
