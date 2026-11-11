import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Page, Track } from "@shared/types";
import { apiGet, errorMessage, isAbort } from "../api";
import { ErrorState } from "./States";
import { GRID, TrackCard, TrackCardSkeleton } from "./TrackCard";

export type Sort = "new" | "hot";

/** Nút chuyển Mới nhất / Nghe nhiều. */
export function SortTabs({ sort, onChange }: { sort: Sort; onChange: (s: Sort) => void }) {
  return (
    <div role="tablist" aria-label="Sắp xếp" className="inline-flex rounded-full border border-border bg-surface p-1">
      {(
        [
          ["new", "Mới nhất"],
          ["hot", "Nghe nhiều"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          role="tab"
          type="button"
          aria-selected={sort === key}
          onClick={() => onChange(key)}
          className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors ${
            sort === key ? "bg-accent text-on-accent" : "text-muted hover:text-text"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Lưới truyện có phân trang "Xem thêm", đủ trạng thái tải / trống / lỗi.
 * urlFor(page) đổi → tải lại từ trang 1.
 */
export function TrackGrid({
  urlFor,
  empty,
  onTotal,
}: {
  urlFor: ((page: number) => string) | null;
  empty: ReactNode;
  onTotal?: (total: number | null) => void;
}) {
  const [items, setItems] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  useEffect(() => {
    if (!urlFor) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    onTotalRef.current?.(null);
    apiGet<Page<Track>>(urlFor(1), ac.signal)
      .then((r) => {
        setItems(r.items ?? []);
        setTotal(r.total ?? 0);
        setPage(1);
        onTotalRef.current?.(r.total ?? 0);
      })
      .catch((e) => {
        if (!isAbort(e)) {
          setItems([]);
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [urlFor, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!urlFor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const r = await apiGet<Page<Track>>(urlFor(page + 1));
      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...(r.items ?? []).filter((t) => !seen.has(t.id))];
      });
      setTotal(r.total ?? total);
      setPage(page + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [urlFor, page, total]);

  const hasMore = items.length > 0 && items.length < total;

  return (
    <div aria-busy={loading}>
      {loading ? (
        <div className={GRID}>
          {Array.from({ length: 10 }, (_, i) => (
            <TrackCardSkeleton key={i} />
          ))}
        </div>
      ) : error && !items.length ? (
        <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !items.length ? (
        empty
      ) : (
        <>
          <div className={GRID}>
            {items.map((t, i) => (
              <TrackCard key={t.id} track={t} list={items} index={i} eager={i < 5} />
            ))}
          </div>
          {error && (
            <p className="mt-6 text-center text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {hasMore && (
            <div className="mt-10 flex justify-center">
              <button type="button" className="btn btn-ghost min-w-48" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Đang tải…" : `Xem thêm (${total - items.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
