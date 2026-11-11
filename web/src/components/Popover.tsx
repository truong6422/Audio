import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface Props {
  label: string; // aria-label cho nút mở
  button: (open: boolean) => ReactNode;
  buttonClassName?: string;
  placement?: "up" | "down";
  align?: "start" | "center" | "end";
  children: (close: () => void) => ReactNode;
  title?: string;
}

/** Ô nổi nhỏ gắn với một nút; đóng khi bấm ra ngoài hoặc Esc. */
export function Popover({ label, button, buttonClassName, placement = "up", align = "center", children, title }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault(); // để trình phát toàn màn không đóng theo
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pos =
    (placement === "up" ? "bottom-full mb-3 " : "top-full mt-3 ") +
    (align === "center" ? "left-1/2 -translate-x-1/2" : align === "end" ? "right-0" : "left-0");

  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        className={buttonClassName}
        onClick={() => setOpen((o) => !o)}
      >
        {button(open)}
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={title ?? label}
          className={`pop-in absolute z-40 w-[264px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow)] ${pos}`}
        >
          {title && <p className="mb-3 text-sm font-semibold text-text">{title}</p>}
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
