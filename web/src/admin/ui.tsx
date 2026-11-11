// Thành phần giao diện dùng chung trong trang quản trị.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { adminApi, errMsg } from "./adminApi";
import { normalizeTag } from "./adminText";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

/* ---------- Nút ---------- */
type BtnKind = "primary" | "ghost" | "danger" | "outline";
const btnKind: Record<BtnKind, string> = {
  primary: "bg-[var(--accent)] text-[var(--on-accent)] hover:opacity-90",
  outline: "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]",
  ghost: "text-[var(--text)] hover:bg-[var(--surface-2)]",
  danger: "bg-[var(--danger)] text-[var(--on-accent)] hover:opacity-90",
};
export function Button({
  kind = "outline",
  small,
  busy,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; small?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        small ? "h-10 px-3 text-xs" : "h-10 px-4 text-sm",
        btnKind[kind],
        className,
      )}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        small ? "h-3.5 w-3.5" : "h-6 w-6",
      )}
    />
  );
}

/* ---------- Khung ---------- */
export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--text)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, "h-10", props.className)} />;
}
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "min-h-24", props.className)} />;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-10 items-center gap-3 text-left text-sm text-[var(--text)]"
    >
      <span
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition",
          checked ? "bg-[var(--success)]" : "bg-[var(--border)]",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-[var(--surface)] shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "warn" | "muted"; children: ReactNode }) {
  const t =
    tone === "ok"
      ? "border-[var(--success)] text-[var(--success)]"
      : tone === "warn"
        ? "border-[var(--accent-2)] text-[var(--accent-2)]"
        : "border-[var(--border)] text-[var(--muted)]";
  return <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------- Trạng thái ---------- */
export function Loading({ text = "Đang tải…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--muted)]">
      <Spinner small /> {text}
    </div>
  );
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--danger)]">
      <span>{message}</span>
      {onRetry && (
        <Button small onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)]">{children}</div>;
}

/* ---------- Thông báo nổi ---------- */
type Toast = { id: number; kind: "ok" | "err"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++seq.current;
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "err" ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              "pointer-events-auto max-w-md rounded-lg border bg-[var(--surface)] px-4 py-2.5 text-sm shadow-lg",
              t.kind === "ok" ? "border-[var(--success)] text-[var(--success)]" : "border-[var(--danger)] text-[var(--danger)]",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Hộp thoại ---------- */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full overflow-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold text-[var(--text)]">{title}</h3>
        <div className="text-sm text-[var(--text)]">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Xoá",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      footer={
        <>
          <Button kind="ghost" onClick={onCancel} disabled={busy}>
            Huỷ
          </Button>
          <Button kind="danger" onClick={onConfirm} busy={busy}>
            {confirmText}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}

/* ---------- Ô ảnh: chọn → tải lên /api/admin/assets ---------- */
export function ImageUpload({
  value,
  onChange,
  aspect = "aspect-square",
  label = "Chọn ảnh",
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  aspect?: string;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("err", "Chỉ nhận tệp ảnh");
    setBusy(true);
    try {
      const { url } = await adminApi.uploadAsset(f);
      onChange(url);
    } catch (e) {
      toast("err", "Tải ảnh lỗi: " + errMsg(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className="flex items-start gap-3">
      <div className={cx("w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]", aspect)}>
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted)]">Chưa có ảnh</div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button small busy={busy} onClick={() => ref.current?.click()}>
          {busy ? "Đang tải…" : label}
        </Button>
        {value && !busy && (
          <Button small kind="ghost" onClick={() => onChange(null)}>
            Bỏ ảnh
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- Định dạng ---------- */
export function fmtDuration(s: number) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
export function fmtDate(unixSec: number) {
  return new Date(unixSec * 1000).toLocaleDateString("vi-VN");
}
export function fmtNum(n: number) {
  return n.toLocaleString("vi-VN");
}

/* ---------- Chọn một mục (thay <select> gốc) ---------- */
export type PickerOption = { value: string; label: string; hint?: string };
export function Picker({
  value,
  options,
  onChange,
  placeholder = "Chọn…",
  ariaLabel,
  className,
}: {
  value: string;
  options: PickerOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  };

  return (
    <div ref={wrap} className={cx("relative", className)}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        className={cx(inputCls, "flex h-10 items-center justify-between gap-2 text-left")}
      >
        <span className={cx("truncate", !current && "text-[var(--muted)]")}>{current ? current.label : placeholder}</span>
        <span aria-hidden className="shrink-0 text-xs text-[var(--muted)]">
          ▾
        </span>
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(active);
            } else if (e.key === "Escape" || e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              btn.current?.focus();
            }
          }}
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 min-w-[12rem] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl outline-none"
        >
          {options.length === 0 && <li className="px-3 py-2 text-sm text-[var(--muted)]">Chưa có mục nào</li>}
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={cx(
                "flex min-h-10 cursor-pointer flex-col justify-center rounded-md px-3 py-1.5 text-sm",
                i === active && "bg-[var(--surface-2)]",
                o.value === value ? "font-medium text-[var(--accent)]" : "text-[var(--text)]",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="truncate text-xs font-normal text-[var(--muted)]">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Ô nhập tag dạng chip ---------- */
export function TagInput({ value, onChange, max = 20, placeholder = "Gõ tag rồi Enter…" }: { value: string[]; onChange: (v: string[]) => void; max?: number; placeholder?: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const next = [...value];
    for (const part of raw.split(/[,;\n#]+/)) {
      const t = normalizeTag(part);
      if (t && !next.includes(t) && next.length < max) next.push(t);
    }
    if (next.length !== value.length) onChange(next);
    setText("");
  };
  const preview = normalizeTag(text);
  return (
    <div>
      <div className={cx(inputCls, "flex min-h-10 flex-wrap items-center gap-1.5 py-1.5")}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] py-0.5 pl-2.5 pr-1 text-xs">
            #{t}
            <button
              type="button"
              aria-label={`Bỏ tag ${t}`}
              onClick={() => onChange(value.filter((x) => x !== t))}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={text}
          disabled={value.length >= max}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;\n]/.test(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && add(text)}
          onPaste={(e) => {
            const v = e.clipboardData.getData("text");
            if (/[,;\n]/.test(v)) {
              e.preventDefault();
              add(text + "," + v);
            }
          }}
          placeholder={value.length >= max ? `Tối đa ${max} tag` : placeholder}
          className="h-7 min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
        />
      </div>
      <span className="mt-1 block text-xs text-[var(--muted)]">
        {text.trim() ? (preview ? `Sẽ lưu thành: #${preview}` : "Tag cần có chữ hoặc số") : `Enter hoặc dấu phẩy để thêm · ${value.length}/${max}`}
      </span>
    </div>
  );
}

/* ---------- Nhóm nút chọn một ---------- */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-10 rounded-md px-3 text-sm transition",
            o.value === value ? "bg-[var(--surface)] font-medium text-[var(--text)] shadow" : "text-[var(--muted)] hover:text-[var(--text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Cảnh báo rời trang khi còn thay đổi chưa lưu ---------- */
const LEAVE_MSG = "Có thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?";
export function useUnsavedGuard(dirty: boolean, message = LEAVE_MSG) {
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // BrowserRouter không có useBlocker → chặn bấm link nội bộ ở pha capture.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
