import { useEffect, useRef } from "react";
import { DEFAULT_GATE_BUTTON, DEFAULT_GATE_TITLE } from "@shared/types";
import { IconExternal, IconLock, IconX } from "../components/Icons";
import { usePlayer } from "./PlayerContext";

function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Popup mở khoá. Chỉ NÚT CHÍNH mở link quảng cáo — phần còn lại của hộp không bấm được.
 * Nút X đóng và dừng nghe.
 */
export function GateModal() {
  const { gate, unlockGate, dismissGate } = usePlayer();
  const boxRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cp = gate.open ? gate.point : null;

  useEffect(() => {
    if (!cp) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissGate();
      } else if (e.key === "Tab" && boxRef.current) {
        // Giữ tiêu điểm trong hộp.
        const items = boxRef.current.querySelectorAll<HTMLElement>("button, a[href]");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [cp, dismissGate]);

  if (!cp) return null;
  const title = cp.title?.trim() || DEFAULT_GATE_TITLE;
  const button = cp.button?.trim() || DEFAULT_GATE_BUTTON;
  const host = hostOf(cp.link);

  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-overlay p-4 backdrop-blur-md">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-desc"
        className="pop-in relative w-full max-w-[420px] rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
            <IconLock size={13} />
            Quảng cáo · Mở khoá để nghe tiếp
          </span>
          <button
            type="button"
            onClick={dismissGate}
            aria-label="Đóng, dừng nghe"
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-text transition-colors hover:border-danger/60 hover:text-danger"
          >
            <IconX size={20} />
          </button>
        </div>

        <p id="gate-title" className="mt-4 text-[15px] leading-relaxed text-text">
          {title}
        </p>

        {cp.imageUrl && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface-2">
            <img
              src={cp.imageUrl}
              alt="Hình ảnh sản phẩm được quảng cáo"
              className="mx-auto max-h-[38vh] w-full object-contain"
              draggable={false}
            />
          </div>
        )}

        <button
          ref={primaryRef}
          type="button"
          onClick={unlockGate}
          className="btn btn-primary mt-5 h-auto min-h-[52px] w-full whitespace-normal py-3 text-center text-base leading-snug"
        >
          <span>{button}</span>
          <IconExternal size={18} className="shrink-0" />
        </button>

        <div id="gate-desc" className="mt-3 space-y-1 text-center text-xs leading-relaxed text-muted">
          {cp.description && <p>{cp.description}</p>}
          <p>
            {host ? (
              <>
                Mở tab mới tới <span className="font-mono text-text">{host}</span>.{" "}
              </>
            ) : null}
            Audio sẽ phát tiếp ngay sau khi bấm.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Thanh nhắc sau khi bấm X. */
export function GateReminder() {
  const { gate, current, reopenGate } = usePlayer();
  if (!current || gate.open || !gate.dismissed) return null;
  return (
    <div
      className="pop-in fixed inset-x-0 z-30 flex justify-center px-3"
      style={{ bottom: "calc(var(--player-h) + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div
        role="status"
        className="flex max-w-full items-center gap-3 rounded-full border border-accent/40 bg-surface/95 py-1.5 pl-4 pr-1.5 shadow-[var(--shadow)] backdrop-blur"
      >
        <IconLock size={16} className="shrink-0 text-accent" />
        <span className="truncate text-sm text-text">Mở khoá để nghe tiếp</span>
        <button type="button" className="btn btn-primary min-h-10 px-4 text-sm" onClick={reopenGate}>
          Mở lại
        </button>
      </div>
    </div>
  );
}
