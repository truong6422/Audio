import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { HistoryItem } from "@shared/types";
import { apiGet, errorMessage, isAbort } from "../api";
import { useAuth } from "../auth";
import { Cover } from "../components/Cover";
import { IconPause, IconPlay } from "../components/Icons";
import { EmptyState, ErrorState } from "../components/States";
import { fmtAgo, fmtTime } from "../lib/format";
import { getProgress, isResumable } from "../lib/progress";
import { useSeo } from "../lib/seo";
import { usePlayer } from "../player/PlayerContext";

function Row({ item }: { item: HistoryItem }) {
  const { current, isPlaying, toggle, playQueue } = usePlayer();
  const t = item.track;
  // Vị trí ở máy có thể mới hơn máy chủ.
  const local = getProgress(t.id);
  const pos = local && local.updatedAt > item.updatedAt ? local.position : item.positionSeconds;
  const isCurrent = current?.id === t.id;
  const resumable = isResumable(pos, t.durationSeconds);
  const pct = t.durationSeconds > 0 ? Math.min(100, (pos / t.durationSeconds) * 100) : 0;
  const finished = !resumable && pos === 0 && item.updatedAt > 0;

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-3 sm:gap-4 sm:p-3">
      <Link to={`/track/${t.slug}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <Cover src={t.coverUrl} className="w-16 sm:w-20" rounded="rounded-xl" markSize={26} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/track/${t.slug}`} className={`line-clamp-2 text-sm font-semibold sm:text-base ${isCurrent ? "text-accent" : "hover:text-accent"}`}>
          {t.title}
        </Link>
        <p className="mt-0.5 text-xs text-muted">
          {resumable ? (
            <>
              Dừng ở <span className="font-mono text-text">{fmtTime(pos)}</span> / {fmtTime(t.durationSeconds)}
            </>
          ) : finished ? (
            "Đã nghe hết"
          ) : (
            fmtTime(t.durationSeconds)
          )}{" "}
          · {fmtAgo(item.updatedAt)}
        </p>
        {resumable && (
          <div className="mt-2 h-1 max-w-xs overflow-hidden rounded-full bg-text/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {t.status === "ready" && (
        <button
          type="button"
          onClick={() => (isCurrent ? toggle() : playQueue([t], 0, resumable ? pos : 0))}
          className={`btn shrink-0 px-3 sm:px-4 ${resumable || isCurrent ? "btn-primary" : "btn-ghost"}`}
          aria-label={isCurrent && isPlaying ? `Tạm dừng ${t.title}` : resumable ? `Tiếp tục ${t.title} từ ${fmtTime(pos)}` : `Nghe lại ${t.title}`}
        >
          {isCurrent && isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
          <span className="hidden sm:inline">{isCurrent && isPlaying ? "Tạm dừng" : resumable ? "Tiếp tục" : "Nghe lại"}</span>
        </button>
      )}
    </li>
  );
}

export function History() {
  const { user, ready } = useAuth();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useSeo({ title: "Lịch sử nghe", noindex: true });

  useEffect(() => {
    if (!user) return;
    const ac = new AbortController();
    setItems(null);
    setError(null);
    apiGet<HistoryItem[]>("/api/history", ac.signal)
      .then((r) => setItems(r ?? []))
      .catch((e) => {
        if (!isAbort(e)) setError(errorMessage(e));
      });
    return () => ac.abort();
  }, [user, reload]);

  if (ready && !user) return <Navigate to="/login?next=%2Fhistory" replace />;

  const inProgress = items?.filter((i) => isResumable(i.positionSeconds, i.track.durationSeconds)) ?? [];
  const rest = items?.filter((i) => !inProgress.includes(i)) ?? [];

  return (
    <div className="wrap max-w-3xl py-8 md:py-12">
      <h1 className="font-display text-3xl font-bold">Lịch sử nghe</h1>
      <p className="mt-1 text-sm text-muted">Vị trí nghe dở được đồng bộ trên mọi thiết bị bạn đăng nhập.</p>

      <div className="mt-8" aria-busy={!items && !error}>
        {error ? (
          <ErrorState message={error} onRetry={() => setReload((r) => r + 1)} />
        ) : !items ? (
          <ul className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-4 rounded-2xl border border-border p-3">
                <div className="skeleton h-16 w-16 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : !items.length ? (
          <EmptyState
            title="Chưa có lịch sử nghe"
            action={
              <Link to="/" className="btn btn-primary">
                Tìm truyện để nghe
              </Link>
            }
          >
            Những truyện bạn nghe sẽ hiện ở đây, kèm chỗ bạn đang nghe dở.
          </EmptyState>
        ) : (
          <>
            {inProgress.length > 0 && (
              <section aria-labelledby="h-progress">
                <h2 id="h-progress" className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-accent">
                  Đang nghe dở
                </h2>
                <ul className="space-y-3">
                  {inProgress.map((it) => (
                    <Row key={it.track.id} item={it} />
                  ))}
                </ul>
              </section>
            )}
            {rest.length > 0 && (
              <section aria-labelledby="h-rest" className={inProgress.length ? "mt-10" : ""}>
                <h2 id="h-rest" className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted">
                  Đã nghe
                </h2>
                <ul className="space-y-3">
                  {rest.map((it) => (
                    <Row key={it.track.id} item={it} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
