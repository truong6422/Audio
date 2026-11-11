import type { ReactNode } from "react";
import { BrandMark } from "./Icons";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-14 text-center">
      <div className="opacity-80">
        <BrandMark size={44} />
      </div>
      <p className="mt-4 font-display text-lg font-semibold text-text">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-3xl border border-danger/30 bg-danger/5 px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold text-text">Không tải được dữ liệu</p>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost mt-5" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}
