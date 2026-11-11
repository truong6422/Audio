// Khoá audio theo chốt: bật/tắt + thời hạn mở khoá + danh sách LockPoint + xem trước popup.
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_GATE_BUTTON, DEFAULT_GATE_TITLE, type LockPoint } from "@shared/types";
import { adminApi, errMsg } from "./adminApi";
import { fmtTime, isHttpUrl, parseTime } from "./adminText";
import { Button, Card, ConfirmDialog, Empty, ErrorBox, Field, ImageUpload, Loading, Switch, TextArea, TextInput, cx, useToast, useUnsavedGuard } from "./ui";

function newId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "cp";
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  for (const b of rnd) s += chars[b % chars.length];
  return s;
}

const hasAt = (p: LockPoint) => typeof p.atSecond === "number" && Number.isFinite(p.atSecond);
const sortPoints = (ps: LockPoint[]) => [...ps].sort((a, b) => a.fromEp - b.fromEp || (a.atSecond ?? -1) - (b.atSecond ?? -1));
const pointKey = (p: LockPoint) => (hasAt(p) ? `s${p.atSecond}` : `e${p.fromEp}`);
const pointLabel = (p: LockPoint) => (hasAt(p) ? `tại ${fmtTime(p.atSecond as number)}` : `từ tập ${p.fromEp}`);
const MAX_SECOND = 7 * 24 * 3600;
const DEFAULT_TTL = 6;

export default function LockPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [points, setPoints] = useState<LockPoint[]>([]);
  const [ttl, setTtl] = useState(String(DEFAULT_TTL));
  const [timeText, setTimeText] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toRemove, setToRemove] = useState<LockPoint | null>(null);

  const snapshot = (e: boolean, p: LockPoint[], t: string) => JSON.stringify({ e, p: p.map((x) => ({ ...x, atSecond: hasAt(x) ? x.atSecond : null })), t: Number(t) });

  const apply = (gate: boolean, raw: LockPoint[], hours: number | undefined) => {
    const ps = sortPoints(raw.map((p) => ({ ...p, atSecond: hasAt(p) ? p.atSecond : null })));
    const t = String(Number.isFinite(hours) && (hours as number) > 0 ? hours : DEFAULT_TTL);
    setEnabled(gate);
    setPoints(ps);
    setTtl(t);
    setTimeText(Object.fromEntries(ps.map((p) => [p.id, hasAt(p) ? fmtTime(p.atSecond as number) : ""])));
    setSaved(snapshot(gate, ps, t));
    return ps;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await adminApi.getSettings();
      const ps = apply(!!s.gate_enabled, s.lock_points ?? [], s.unlock_ttl_hours);
      setSelected(ps[0]?.id ?? null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const dirty = !loading && !error && snapshot(enabled, points, ttl) !== saved;
  useUnsavedGuard(dirty);

  const update = (id: string, patch: Partial<LockPoint>) => setPoints((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const setTime = (id: string, text: string) => {
    setTimeText((m) => ({ ...m, [id]: text }));
    const v = parseTime(text);
    update(id, { atSecond: v === null || Number.isNaN(v) ? null : v });
  };

  const add = () => {
    const last = points.reduce((m, p) => Math.max(m, p.fromEp), 0);
    const p: LockPoint = { id: newId(), fromEp: last + 1, atSecond: null, name: "", title: "", link: "", imageUrl: "", button: "", description: "" };
    setPoints((ps) => [...ps, p]);
    setTimeText((m) => ({ ...m, [p.id]: "" }));
    setSelected(p.id);
  };

  const dupKeys = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of points) seen.set(pointKey(p), (seen.get(pointKey(p)) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [points]);

  const timeErr = (p: LockPoint): string => {
    const v = parseTime(timeText[p.id] ?? "");
    if (v === null) return "";
    if (Number.isNaN(v)) return "Nhập mm:ss, hh:mm:ss hoặc số giây";
    if (v > MAX_SECOND) return "Quá dài";
    return "";
  };
  const epErr = (p: LockPoint) => !Number.isInteger(p.fromEp) || p.fromEp < 1;
  const linkErr = (p: LockPoint) => p.link.trim() !== "" && !isHttpUrl(p.link);
  const ttlNum = Number(ttl);
  const ttlErr = ttl.trim() === "" || !Number.isFinite(ttlNum) || ttlNum <= 0 || ttlNum > 24 * 365;

  const problems: string[] = [];
  if (ttlErr) problems.push("Thời hạn mở khoá phải từ 0,1 tới 8760 giờ");
  if (points.some(epErr)) problems.push("“Khoá từ tập” phải là số nguyên ≥ 1");
  if (points.some((p) => timeErr(p))) problems.push("Có “Khoá tại giây” sai định dạng");
  if (dupKeys.size > 0) problems.push("Có hai chốt khoá cùng vị trí");
  if (points.some(linkErr)) problems.push("Link affiliate phải bắt đầu bằng http:// hoặc https://");
  const missingLink = enabled && points.some((p) => !p.link.trim());

  const save = async () => {
    if (problems.length) return toast("err", problems[0]);
    const sorted = sortPoints(points).map((p) => ({ ...p, link: p.link.trim(), name: p.name.trim(), atSecond: hasAt(p) ? p.atSecond : null }));
    setSaving(true);
    try {
      const s = await adminApi.saveSettings({ gate_enabled: enabled, lock_points: sorted, unlock_ttl_hours: ttlNum });
      apply(!!s.gate_enabled, s.lock_points ?? sorted, s.unlock_ttl_hours ?? ttlNum);
      toast("ok", "Đã lưu khoá audio");
    } catch (e) {
      toast("err", "Lưu lỗi: " + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  const sorted = sortPoints(points);
  const preview = points.find((p) => p.id === selected) ?? sorted[0] ?? null;
  const ttlShow = ttlErr ? DEFAULT_TTL : ttlNum;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <Card>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start">
            <div>
              <Switch checked={enabled} onChange={setEnabled} label={<span className="font-medium">Bật khoá audio</span>} />
              <p className="mt-2 text-xs text-[var(--muted)]">
                Mỗi chốt khoá từ tập “Khoá từ tập” (hoặc đúng giây “Khoá tại giây” nếu có) tới trước chốt kế tiếp, áp cho mọi audio. Phần trước chốt
                đầu tiên nghe tự do. Người nghe bấm nút trên popup thì mở link và được mở khoá chốt đó trong {ttlShow} giờ.
              </p>
            </div>
            <Field label="Thời hạn mở khoá (giờ)" hint={ttlErr ? <span className="text-[var(--danger)]">Từ 0,1 tới 8760 giờ</span> : "Mặc định 6 giờ"}>
              <TextInput type="number" min={0.1} step={0.5} inputMode="decimal" value={ttl} onChange={(e) => setTtl(e.target.value)} />
            </Field>
          </div>
        </Card>

        {sorted.length === 0 ? (
          <Empty>Chưa có chốt nào. Bấm “+ Thêm chốt”.</Empty>
        ) : (
          sorted.map((p, i) => {
            const tErr = timeErr(p);
            const dup = dupKeys.has(pointKey(p));
            return (
              <Card
                key={p.id}
                className={cx(preview?.id === p.id && "border-[var(--accent)]")}
                title={
                  <button type="button" className="min-h-10 text-left" onClick={() => setSelected(p.id)}>
                    Chốt {i + 1}
                    <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                      {p.name ? `${p.name} · ` : ""}
                      {pointLabel(p)}
                    </span>
                  </button>
                }
                actions={
                  <>
                    {preview?.id !== p.id && (
                      <Button small kind="ghost" onClick={() => setSelected(p.id)}>
                        Xem trước
                      </Button>
                    )}
                    <Button small kind="ghost" className="text-[var(--danger)]" onClick={() => setToRemove(p)}>
                      Xoá chốt
                    </Button>
                  </>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2" onFocusCapture={() => setSelected(p.id)}>
                  <Field
                    label="Khoá tại giây (ưu tiên)"
                    hint={
                      tErr ? (
                        <span className="text-[var(--danger)]">{tErr}</span>
                      ) : dup && hasAt(p) ? (
                        <span className="text-[var(--danger)]">Trùng với chốt khác</span>
                      ) : hasAt(p) ? (
                        `= giây thứ ${p.atSecond} của audio, đặt ở cao trào`
                      ) : (
                        "mm:ss hoặc hh:mm:ss. Để trống = khoá theo tập"
                      )
                    }
                  >
                    <TextInput inputMode="numeric" value={timeText[p.id] ?? ""} onChange={(e) => setTime(p.id, e.target.value)} placeholder="VD: 12:30 hoặc 1:05:00" />
                  </Field>
                  <Field
                    label="Khoá từ tập"
                    hint={
                      epErr(p) ? (
                        <span className="text-[var(--danger)]">Số nguyên ≥ 1</span>
                      ) : dup && !hasAt(p) ? (
                        <span className="text-[var(--danger)]">Trùng với chốt khác</span>
                      ) : hasAt(p) ? (
                        "Bị bỏ qua vì đã có “Khoá tại giây”"
                      ) : undefined
                    }
                  >
                    <TextInput
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={Number.isFinite(p.fromEp) ? p.fromEp : ""}
                      onChange={(e) => update(p.id, { fromEp: Math.floor(Number(e.target.value)) })}
                      className={cx(hasAt(p) && "opacity-60")}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Tên nội bộ" hint="Chỉ quản trị thấy">
                      <TextInput value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} placeholder="VD: Shopee tháng 11" />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Tiêu đề popup" hint="Để trống = dùng câu mặc định">
                      <TextArea rows={3} value={p.title} onChange={(e) => update(p.id, { title: e.target.value })} placeholder={DEFAULT_GATE_TITLE} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field
                      label="Link affiliate"
                      hint={
                        linkErr(p) ? (
                          <span className="text-[var(--danger)]">Phải bắt đầu bằng http:// hoặc https://</span>
                        ) : !p.link.trim() ? (
                          <span className="text-[var(--accent-2)]">Chưa có link</span>
                        ) : undefined
                      }
                    >
                      <TextInput type="url" value={p.link} onChange={(e) => update(p.id, { link: e.target.value })} placeholder="https://s.shopee.vn/..." />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Ảnh quảng cáo">
                      <ImageUpload value={p.imageUrl || null} onChange={(url) => update(p.id, { imageUrl: url ?? "" })} aspect="aspect-[4/3]" />
                    </Field>
                  </div>
                  <Field label="Chữ nút" hint="Để trống = chữ mặc định">
                    <TextInput value={p.button} onChange={(e) => update(p.id, { button: e.target.value })} placeholder={DEFAULT_GATE_BUTTON} />
                  </Field>
                  <Field label="Mô tả dưới nút">
                    <TextInput value={p.description} onChange={(e) => update(p.id, { description: e.target.value })} placeholder="Chữ nhỏ dưới nút (tuỳ chọn)" />
                  </Field>
                </div>
              </Card>
            );
          })
        )}

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <Button onClick={add}>+ Thêm chốt</Button>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {problems.length > 0 ? (
              <span className="text-xs text-[var(--danger)]">{problems[0]}</span>
            ) : missingLink ? (
              <span className="text-xs text-[var(--accent-2)]">Có chốt chưa có link</span>
            ) : (
              dirty && <span className="text-xs text-[var(--muted)]">Chưa lưu</span>
            )}
            <Button kind="primary" onClick={save} busy={saving} disabled={!dirty || problems.length > 0}>
              Lưu khoá audio
            </Button>
          </div>
        </div>
      </div>

      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-sm font-medium text-[var(--muted)]">Xem trước popup{preview ? ` — chốt ${pointLabel(preview)}` : ""}</p>
        {preview ? <GatePreview point={preview} ttlHours={ttlShow} enabled={enabled} /> : <Empty>Thêm chốt để xem trước.</Empty>}
      </div>

      <ConfirmDialog
        open={!!toRemove}
        title="Xoá chốt?"
        message={`Xoá chốt khoá ${toRemove ? pointLabel(toRemove) : ""}${toRemove?.name ? ` (${toRemove.name})` : ""}. Thay đổi có hiệu lực sau khi bấm “Lưu khoá audio”.`}
        confirmText="Xoá chốt"
        onConfirm={() => {
          if (toRemove) {
            setPoints((ps) => ps.filter((p) => p.id !== toRemove.id));
            if (selected === toRemove.id) setSelected(null);
          }
          setToRemove(null);
        }}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}

/** Bản xem trước popup — mô phỏng giao diện người nghe thấy. */
function GatePreview({ point, ttlHours, enabled }: { point: LockPoint; ttlHours: number; enabled: boolean }) {
  return (
    <div className="rounded-2xl bg-[var(--overlay)] p-4">
      {!enabled && <p className="mb-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-center text-xs text-[var(--accent-2)]">Khoá audio đang tắt — người nghe chưa thấy popup này.</p>}
      <div className="relative mx-auto max-w-[320px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm text-[var(--muted)]">✕</span>
        <p className="mb-2 pr-8 text-xs text-[var(--muted)]">🔒 Khoá {pointLabel(point)}</p>
        {point.imageUrl ? (
          <img src={point.imageUrl} alt="" className="mb-3 w-full rounded-lg object-cover" />
        ) : (
          <div className="mb-3 flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-[var(--surface-2)] text-xs text-[var(--muted)]">Ảnh quảng cáo</div>
        )}
        <p className="mb-3 text-center text-sm text-[var(--text)]">{point.title.trim() || DEFAULT_GATE_TITLE}</p>
        <div className="w-full rounded-lg bg-[var(--accent)] px-3 py-2.5 text-center text-sm font-semibold text-[var(--on-accent)]">{point.button.trim() || DEFAULT_GATE_BUTTON}</div>
        {point.description.trim() && <p className="mt-2 text-center text-xs text-[var(--muted)]">{point.description}</p>}
        <p className="mt-3 text-center text-xs text-[var(--muted)]">Mở khoá trong {ttlHours} giờ sau khi bấm nút</p>
        <p className="mt-1 break-all text-center text-xs text-[var(--muted)]">→ {point.link.trim() || "(chưa có link)"}</p>
      </div>
    </div>
  );
}
