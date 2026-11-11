// Thư viện: danh sách track, tìm, phân trang 20, sửa tại chỗ, xoá có xác nhận, tải mới.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Category, Page, Track } from "@shared/types";
import { adminApi, errMsg } from "./adminApi";
import UploadPanel from "./UploadPanel";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Empty,
  ErrorBox,
  Field,
  ImageUpload,
  Loading,
  Picker,
  TagInput,
  TextArea,
  TextInput,
  fmtDate,
  fmtDuration,
  fmtNum,
  inputCls,
  useToast,
  type PickerOption,
} from "./ui";

const PAGE_SIZE = 20;
const ALL = "";

export default function LibraryPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catError, setCatError] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Track> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const [showUpload, setShowUploadRaw] = useState(params.get("upload") === "1");
  const setShowUpload = (v: boolean) => {
    setShowUploadRaw(v);
    if (!v && params.has("upload")) setParams({}, { replace: true });
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Track | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Tìm: chờ 300ms sau khi gõ.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.listTracks(page, query, category);
      // Phòng khi máy chủ chưa lọc theo thể loại: lọc thêm ở máy khách.
      setData(category ? { ...res, items: res.items.filter((t) => t.category === category) } : res);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [page, query, category]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCategories = useCallback(async () => {
    setCatError("");
    try {
      setCategories((await adminApi.getSettings()).categories ?? []);
    } catch (e) {
      setCatError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const catName = useMemo(() => new Map(categories.map((c) => [c.slug, c.name])), [categories]);
  const filterOptions: PickerOption[] = useMemo(
    () => [{ value: ALL, label: "Tất cả thể loại" }, ...categories.map((c) => ({ value: c.slug, label: c.name, hint: c.slug }))],
    [categories],
  );

  const replace = (t: Track) =>
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === t.id ? t : x)) } : d));

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await adminApi.deleteTrack(toDelete.id);
      toast("ok", `Đã xoá “${toDelete.title}”`);
      setToDelete(null);
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else load();
    } catch (e) {
      toast("err", "Xoá lỗi: " + errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize || PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {showUpload ? (
        <UploadPanel
          onClose={() => setShowUpload(false)}
          onDone={() => {
            setShowUpload(false);
            setQ("");
            setQuery("");
            setPage(1);
            load();
          }}
        />
      ) : null}

      <Card
        title={
          <span>
            Thư viện <span className="text-sm font-normal text-[var(--muted)]">({fmtNum(total)})</span>
          </span>
        }
        actions={
          !showUpload && (
            <Button kind="primary" small onClick={() => setShowUpload(true)}>
              + Tải audio mới
            </Button>
          )
        }
      >
        <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_240px]">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tiêu đề…" aria-label="Tìm audio" className={inputCls + " h-10"} />
          <Picker
            ariaLabel="Lọc theo thể loại"
            value={category}
            options={filterOptions}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
          />
        </div>
        {catError && (
          <div className="mb-4">
            <ErrorBox message={"Không tải được danh sách thể loại: " + catError} onRetry={loadCategories} />
          </div>
        )}

        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !data || data.items.length === 0 ? (
          <Empty>
            {query || category
              ? "Không có audio nào khớp bộ lọc."
              : "Chưa có audio nào. Bấm “Tải audio mới” để bắt đầu."}
          </Empty>
        ) : (
          <ul className={"space-y-2 transition " + (loading ? "opacity-60" : "")}>
            {data.items.map((t) =>
              editingId === t.id ? (
                <EditRow
                  key={t.id}
                  track={t}
                  categories={categories}
                  onCancel={() => setEditingId(null)}
                  onSaved={(nt) => {
                    replace(nt);
                    setEditingId(null);
                  }}
                />
              ) : (
                <TrackRow key={t.id} track={t} categoryName={t.category ? (catName.get(t.category) ?? `${t.category} (đã xoá)`) : null} onEdit={() => setEditingId(t.id)} onDelete={() => setToDelete(t)} />
              ),
            )}
          </ul>
        )}

        {data && pages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-2 text-sm text-[var(--muted)]">
            <Button small disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
              ‹ Trước
            </Button>
            <span>
              Trang {page} / {pages}
            </span>
            <Button small disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>
              Sau ›
            </Button>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Xoá audio?"
        message={
          <>
            Xoá <b>{toDelete?.title}</b> cùng toàn bộ tệp âm thanh đã tải lên. Không hoàn tác được.
          </>
        }
        busy={deleting}
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function TrackRow({ track: t, categoryName, onEdit, onDelete }: { track: Track; categoryName: string | null; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[var(--surface)]">
        {t.coverUrl ? (
          <img src={t.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg text-[var(--muted)]">♪</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {t.status === "ready" ? (
            <a href={`/track/${t.slug}`} target="_blank" rel="noreferrer" className="truncate font-medium text-[var(--text)] hover:text-[var(--accent)]">
              {t.title}
            </a>
          ) : (
            <span className="truncate font-medium text-[var(--text)]">{t.title}</span>
          )}
          {t.status === "ready" ? <Badge tone="ok">Sẵn sàng</Badge> : <Badge tone="warn">Đang xử lý</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-[var(--muted)]">
          {fmtDuration(t.durationSeconds)} · {t.episodeCount} tập · {fmtNum(t.playCount)} lượt nghe · {t.format === "hls" ? "HLS" : "Tệp"} ·{" "}
          {fmtDate(t.createdAt)}
        </div>
        {(categoryName || (t.tags?.length ?? 0) > 0) && (
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {categoryName && <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[var(--accent)]">{categoryName}</span>}
            {(t.tags ?? []).slice(0, 6).map((tag) => (
              <span key={tag} className="rounded-full px-1.5 py-0.5 text-[var(--muted)]">
                #{tag}
              </span>
            ))}
            {(t.tags?.length ?? 0) > 6 && <span className="py-0.5 text-[var(--muted)]">+{t.tags.length - 6}</span>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
        <Button small onClick={onEdit}>
          Sửa
        </Button>
        <Button small kind="ghost" className="text-[var(--danger)]" onClick={onDelete}>
          Xoá
        </Button>
      </div>
    </li>
  );
}

function EditRow({ track, categories, onCancel, onSaved }: { track: Track; categories: Category[]; onCancel: () => void; onSaved: (t: Track) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(track.title);
  const [category, setCategory] = useState(track.category ?? "");
  const [tags, setTags] = useState<string[]>(track.tags ?? []);
  const catOptions: PickerOption[] = [
    { value: "", label: "Chưa có thể loại" },
    ...categories.map((c) => ({ value: c.slug, label: c.name, hint: c.slug })),
    ...(track.category && !categories.some((c) => c.slug === track.category) ? [{ value: track.category, label: `${track.category} (đã xoá)` }] : []),
  ];
  const [description, setDescription] = useState(track.description);
  const [episodes, setEpisodes] = useState(String(track.episodeCount));
  const [cover, setCover] = useState<string | null>(track.coverUrl);
  const [saving, setSaving] = useState(false);
  const ep = Math.floor(Number(episodes));
  const valid = title.trim().length > 0 && Number.isFinite(ep) && ep >= 1;

  const save = async () => {
    if (!valid) return;
    const patch: Parameters<typeof adminApi.updateTrack>[1] = {};
    if (title.trim() !== track.title) patch.title = title.trim();
    if (description !== track.description) patch.description = description;
    if (ep !== track.episodeCount) patch.episodeCount = ep;
    if (cover !== track.coverUrl) patch.coverUrl = cover;
    if ((category || null) !== (track.category ?? null)) patch.category = category || null;
    if (JSON.stringify(tags) !== JSON.stringify(track.tags ?? [])) patch.tags = tags;
    if (Object.keys(patch).length === 0) return onCancel();
    setSaving(true);
    try {
      const { track: nt } = await adminApi.updateTrack(track.id, patch);
      toast("ok", "Đã lưu");
      onSaved(nt);
    } catch (e) {
      toast("err", "Lưu lỗi: " + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-lg border border-[var(--accent)] bg-[var(--surface-2)] p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3">
          <Field label="Tiêu đề">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Mô tả">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={5000} />
          </Field>
          <Field label="Số tập" hint={`Thời lượng ${fmtDuration(track.durationSeconds)} — gợi ý ~1 tập / 10 phút`}>
            <TextInput type="number" min={1} inputMode="numeric" value={episodes} onChange={(e) => setEpisodes(e.target.value)} className="max-w-32" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <span className="mb-1 block text-sm font-medium text-[var(--text)]">Thể loại</span>
              <Picker ariaLabel="Thể loại" value={category} options={catOptions} onChange={setCategory} />
              {categories.length === 0 && <span className="mt-1 block text-xs text-[var(--muted)]">Thêm thể loại ở mục Cài đặt</span>}
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-[var(--text)]">Tag</span>
              <TagInput value={tags} onChange={setTags} placeholder="me chồng, báo thù…" />
            </div>
          </div>
        </div>
        <Field label="Ảnh bìa">
          <ImageUpload value={cover} onChange={setCover} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button kind="ghost" small onClick={onCancel} disabled={saving}>
          Huỷ
        </Button>
        <Button kind="primary" small onClick={save} busy={saving} disabled={!valid}>
          Lưu
        </Button>
      </div>
    </li>
  );
}
