import type { ChangeEvent, ReactNode } from "react";

export default function Input({
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  icon,
  disabled = false,
  autoComplete,
  className = "",
}: {
  id: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  icon?: ReactNode;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="relative">
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`peer w-full rounded-md border border-white/[0.08] bg-white/[0.04] py-3 pr-4 text-sm text-text transition-all duration-150 placeholder:text-muted2 focus:border-action/45 focus:bg-action/[0.04] focus:outline-none focus:ring-1 focus:ring-action/[0.12] disabled:cursor-not-allowed disabled:opacity-50 ${
            icon ? "pl-10" : "pl-4"
          }`}
        />
        {/* After the input: peer-focus only styles later siblings. */}
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted2 transition-colors peer-focus:text-action">
            {icon}
          </span>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1 text-xs text-failed">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="6" cy="6" r="5.25" />
            <path d="M6 3.5v3M6 8.5h.01" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
