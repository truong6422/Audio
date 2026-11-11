// Thống kê phễu: GET /api/admin/funnel?days=7|30 — lượt vào → nghe → chạm chốt → mở khoá → nghe hết, theo nguồn.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FunnelStats } from "@shared/types";
import { adminApi, errMsg } from "./adminApi";
import { Button, Card, Empty, ErrorBox, Loading, Segmented, cx, fmtNum } from "./ui";

const STEPS = [
  { key: "view", label: "Lượt vào" },
  { key: "play", label: "Nghe" },
  { key: "gate_shown", label: "Chạm chốt" },
  { key: "unlock", label: "Mở khoá" },
  { key: "complete", label: "Nghe hết" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];
type Counts = Record<StepKey, number>;

const SOURCE_NAMES: Record<string, string> = {
  tiktok: "TikTok",
  facebook: "Facebook",
  fb: "Facebook",
  messenger: "Messenger",
  instagram: "Instagram",
  zalo: "Zalo",
  youtube: "YouTube",
  google: "Google",
  threads: "Threads",
  direct: "Trực tiếp",
};
const DIRECT = "direct";
const ALL = "__all__";
const sourceKey = (s: string | null | undefined) => (s ?? "").trim().toLowerCase() || DIRECT;
const sourceName = (k: string) => SOURCE_NAMES[k] ?? k;

const zero = (): Counts => ({ view: 0, play: 0, gate_shown: 0, unlock: 0, complete: 0 });
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : "—");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export default function FunnelPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<FunnelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi.funnel(days));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [days]);
  useEffect(() => {
    load();
  }, [load]);

  const { bySource, total, byDay } = useMemo(() => {
    const src = new Map<string, Counts>();
    const day = new Map<string, Counts>();
    const tot = zero();
    for (const r of data?.rows ?? []) {
      const k = sourceKey(r.source);
      const s = src.get(k) ?? zero();
      const d = day.get(r.day) ?? zero();
      for (const st of STEPS) {
        const v = n(r[st.key]);
        s[st.key] += v;
        d[st.key] += v;
        tot[st.key] += v;
      }
      src.set(k, s);
      day.set(r.day, d);
    }
    return {
      bySource: [...src].sort((a, b) => b[1].view - a[1].view || b[1].play - a[1].play),
      total: tot,
      byDay: [...day].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [data]);

  const empty = !!data && STEPS.every((s) => total[s.key] === 0);
  const selected = source === ALL ? total : (bySource.find(([k]) => k === source)?.[1] ?? zero());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)]">Thống kê phễu</h2>
          <p className="text-xs text-[var(--muted)]">Vào trang → bắt đầu nghe → chạm chốt khoá → bấm mở khoá → nghe hết, theo nguồn truy cập.</p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            ariaLabel="Khoảng thời gian"
            value={days}
            onChange={(v) => setDays(v)}
            options={[
              { value: 7, label: "7 ngày" },
              { value: 30, label: "30 ngày" },
            ]}
          />
          <Button kind="ghost" onClick={load} busy={loading && !!data} aria-label="Làm mới">
            ↻
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <Loading text="Đang tải số liệu phễu…" />
      ) : error ? (
        <ErrorBox message={"Không tải được thống kê: " + error} onRetry={load} />
      ) : !data || empty ? (
        <Empty>
          Chưa có sự kiện nào trong {days} ngày qua. Số liệu xuất hiện khi người nghe vào trang (gắn <code>?utm_source=tiktok</code> vào link để tách nguồn).
        </Empty>
      ) : (
        <div className={cx("space-y-4 transition", loading && "opacity-60")}>
          <Card title="Theo nguồn">
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                    <th className="py-2 pr-3 font-medium">Nguồn</th>
                    {STEPS.map((s) => (
                      <th key={s.key} className="px-2 py-2 text-right font-medium">
                        {s.label}
                      </th>
                    ))}
                    <th className="py-2 pl-2 text-right font-medium">Vào → mở khoá</th>
                  </tr>
                </thead>
                <tbody>
                  {bySource.map(([k, c]) => (
                    <Row key={k} name={sourceName(k)} c={c} active={source === k} onPick={() => setSource(source === k ? ALL : k)} />
                  ))}
                </tbody>
                <tfoot>
                  <Row name="Tổng" c={total} bold active={source === ALL} onPick={() => setSource(ALL)} />
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">% dưới mỗi số = tỉ lệ so với bước liền trước. Bấm một dòng để xem biểu đồ của nguồn đó.</p>
          </Card>

          <Card title={`Phễu — ${source === ALL ? "tất cả nguồn" : sourceName(source)}`}>
            <FunnelBars c={selected} />
          </Card>

          {byDay.length > 1 && (
            <Card title="Theo ngày">
              <DailyBars rows={byDay} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ name, c, bold, active, onPick }: { name: string; c: Counts; bold?: boolean; active?: boolean; onPick: () => void }) {
  return (
    <tr
      onClick={onPick}
      className={cx("cursor-pointer border-b border-[var(--border)] hover:bg-[var(--surface-2)]", bold && "font-semibold", active && "bg-[var(--surface-2)]")}
    >
      <td className="py-2 pr-3">
        <button type="button" className={cx("min-h-10 text-left", active && "text-[var(--accent)]")} onClick={(e) => (e.stopPropagation(), onPick())}>
          {name}
        </button>
      </td>
      {STEPS.map((s, i) => (
        <td key={s.key} className="px-2 py-2 text-right tabular-nums">
          <div>{fmtNum(c[s.key])}</div>
          {i > 0 && <div className="text-xs font-normal text-[var(--muted)]">{pct(c[s.key], c[STEPS[i - 1].key])}</div>}
        </td>
      ))}
      <td className="py-2 pl-2 text-right tabular-nums text-[var(--accent)]">{pct(c.unlock, c.view)}</td>
    </tr>
  );
}

/** Biểu đồ cột phễu: chiều cao theo tỉ lệ so với bước lớn nhất. */
function FunnelBars({ c }: { c: Counts }) {
  const max = Math.max(1, ...STEPS.map((s) => c[s.key]));
  return (
    <div className="grid grid-cols-5 items-end gap-2 sm:gap-4" role="img" aria-label={STEPS.map((s) => `${s.label} ${c[s.key]}`).join(", ")}>
      {STEPS.map((s, i) => {
        const h = (c[s.key] / max) * 100;
        return (
          <div key={s.key} className="flex min-w-0 flex-col items-center gap-1">
            <span className="text-xs font-medium tabular-nums text-[var(--text)] sm:text-sm">{fmtNum(c[s.key])}</span>
            <div className="flex h-40 w-full items-end rounded-md bg-[var(--surface-2)]">
              <div
                className="w-full rounded-md transition-all"
                style={{ height: `${Math.max(h, c[s.key] > 0 ? 2 : 0)}%`, background: i === 3 ? "var(--accent-2)" : "var(--accent)", opacity: 1 - i * 0.12 }}
              />
            </div>
            <span className="w-full truncate text-center text-xs text-[var(--muted)]">{s.label}</span>
            <span className="text-xs tabular-nums text-[var(--muted)]">{i === 0 ? "100%" : pct(c[s.key], c.view)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Cột theo ngày: lượt vào (cột nhạt) và mở khoá (cột đậm). Cuộn ngang khi nhiều ngày. */
function DailyBars({ rows }: { rows: [string, Counts][] }) {
  const max = Math.max(1, ...rows.map(([, c]) => c.view));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)] opacity-40" /> Lượt vào
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent-2)]" /> Mở khoá
        </span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
        <div className="flex h-44 items-end gap-1.5" style={{ minWidth: rows.length * 28 }}>
          {rows.map(([day, c]) => (
            <div key={day} className="flex h-full min-w-[22px] flex-1 flex-col items-center justify-end gap-1" title={`${day}: ${c.view} lượt vào, ${c.unlock} mở khoá`}>
              <div className="relative flex w-full flex-1 items-end">
                <div className="w-full rounded-t bg-[var(--accent)] opacity-40" style={{ height: `${(c.view / max) * 100}%` }} />
                <div className="absolute bottom-0 left-1/4 w-1/2 rounded-t bg-[var(--accent-2)]" style={{ height: `${(c.unlock / max) * 100}%` }} />
              </div>
              <span className="text-xs tabular-nums text-[var(--muted)]">{day.slice(-2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
