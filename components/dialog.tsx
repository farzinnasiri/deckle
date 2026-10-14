"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function DeskDialog({
  children,
  label,
  onClose,
  className = "",
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current!;
    // Start on the first real control; the close cross is the last resort.
    (
      root.querySelector<HTMLElement>(
        'button:not(.close-dialog), input, [tabindex="0"]',
      ) ?? root.querySelector<HTMLElement>("button")
    )?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      if (e.key !== "Tab") return;
      const items = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]',
        ),
      ];
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    root.addEventListener("keydown", listener);
    return () => {
      root.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`desk-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <button
          className="close-dialog icon-button"
          onClick={onClose}
          aria-label={`Close ${label}`}
        >
          <X size={19} />
        </button>
        {children}
      </div>
    </div>
  );
}
