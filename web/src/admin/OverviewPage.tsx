// Tổng quan: số liệu từ GET /api/admin/stats.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, errMsg, type AdminStats } from "./adminApi";
import { Button, Card, ErrorBox, Loading, fmtNum } from "./ui";

const items: Array<{ key: keyof AdminStats; label: string; hint: string }> = [
  { key: "tracks", label: "Audio", hint: "Tổng số truyện trong thư viện" },
  { key: "plays", label: "Lượt nghe", hint: "Tổng lượt phát" },
  { key: "users", label: "Tài khoản", hint: "Người đã đăng ký" },
  { key: "unlocksToday", label: "Mở khoá hôm nay", hint: "Lượt bấm nút trên popup khoá" },
];

export default function OverviewPage() {
  const nav = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await adminApi.stats());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {loading && !stats ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        stats && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {items.map((it) => (
              <div key={it.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs text-[var(--muted)]">{it.label}</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--text)]">{fmtNum(stats[it.key] ?? 0)}</div>
                <div className="mt-1 hidden text-xs text-[var(--muted)] sm:block">{it.hint}</div>
              </div>
            ))}
          </div>
        )
      )}

      <Card title="Lối tắt">
        <div className="flex flex-wrap gap-2">
          <Button kind="primary" onClick={() => nav("/admin/library?upload=1")}>
            Tải audio mới
          </Button>
          <Button onClick={() => nav("/admin/lock")}>Khoá audio</Button>
          <Button onClick={() => nav("/admin/settings")}>Cài đặt &amp; mã chèn</Button>
          <Button kind="ghost" onClick={load} busy={loading && !!stats}>
            Làm mới số liệu
          </Button>
        </div>
      </Card>
    </div>
  );
}
