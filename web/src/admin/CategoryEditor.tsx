// Quản lý danh sách thể loại (SiteSettings.categories): thêm / sửa / xoá / sắp xếp.
import { useState } from "react";
import type { Category } from "@shared/types";
import { slugify } from "./adminText";
import { Button, ConfirmDialog, Empty, Field, TextArea, TextInput, cx } from "./ui";

/** Lỗi theo từng dòng (rỗng = hợp lệ). */
export function categoryErrors(list: Category[]): string[] {
  const count = new Map<string, number>();
  for (const c of list) count.set(c.slug, (count.get(c.slug) ?? 0) + 1);
  return list.map((c) => {
    if (!c.name.trim()) return "Thiếu tên thể loại";
    if (c.name.trim().length > 80) return "Tên tối đa 80 ký tự";
    if (!c.slug) return "Thiếu đường dẫn";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) return "Đường dẫn chỉ gồm a-z, 0-9 và dấu “-”";
    if ((count.get(c.slug) ?? 0) > 1) return `Trùng đường dẫn “${c.slug}”`;
    if (c.description.length > 2000) return "Mô tả tối đa 2000 ký tự";
    return "";
  });
}

export default function CategoryEditor({
  value,
  onChange,
  savedSlugs,
}: {
  value: Category[];
  onChange: (v: Category[]) => void;
  savedSlugs: Set<string>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [slugAuto, setSlugAuto] = useState(false);
  const [startSlug, setStartSlug] = useState("");
  const [toRemove, setToRemove] = useState<number | null>(null);
  const errors = categoryErrors(value);

  const patch = (i: number, p: Partial<Category>) => onChange(value.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    if (editing === i) setEditing(j);
    else if (editing === j) setEditing(i);
  };
  const add = () => {
    onChange([...value, { slug: "", name: "", description: "" }]);
    setEditing(value.length);
    setStartSlug("");
    setSlugAuto(true);
  };
  const startEdit = (i: number) => {
    const c = value[i];
    setEditing(i);
    setStartSlug(c.slug);
    // Thể loại mới (chưa lưu) mà slug vẫn khớp tên → tiếp tục tự sinh.
    setSlugAuto(!savedSlugs.has(c.slug) && (c.slug === "" || c.slug === slugify(c.name)));
  };

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <Empty>Chưa có thể loại nào. Bấm “+ Thêm thể loại”.</Empty>
      ) : (
        <ul className="space-y-2">
          {value.map((c, i) => {
            const err = errors[i];
            const open = editing === i;
            const renamed = open && savedSlugs.has(startSlug) && c.slug !== startSlug;
            return (
              <li key={i} className={cx("rounded-lg border bg-[var(--surface-2)] p-3", open ? "border-[var(--accent)]" : err ? "border-[var(--danger)]" : "border-[var(--border)]")}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[var(--text)]">{c.name.trim() || <span className="text-[var(--muted)]">(chưa đặt tên)</span>}</div>
                    <div className="truncate text-xs text-[var(--muted)]">
                      /the-loai/{c.slug || "…"}
                      {!savedSlugs.has(c.slug) && c.slug && <span className="ml-1 text-[var(--accent-2)]">· mới</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button small kind="ghost" aria-label="Chuyển lên" disabled={i === 0} onClick={() => move(i, -1)} className="w-10 px-0">
                      ↑
                    </Button>
                    <Button small kind="ghost" aria-label="Chuyển xuống" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="w-10 px-0">
                      ↓
                    </Button>
                    <Button small onClick={() => (open ? setEditing(null) : startEdit(i))}>
                      {open ? "Xong" : "Sửa"}
                    </Button>
                    <Button small kind="ghost" className="text-[var(--danger)]" onClick={() => setToRemove(i)}>
                      Xoá
                    </Button>
                  </div>
                </div>
                {err && !open && <p className="mt-1 text-xs text-[var(--danger)]">{err}</p>}
                {open && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Tên thể loại">
                      <TextInput
                        autoFocus
                        maxLength={80}
                        value={c.name}
                        placeholder="VD: Drama gia đình"
                        onChange={(e) => {
                          const name = e.target.value;
                          patch(i, slugAuto ? { name, slug: slugify(name) } : { name });
                        }}
                      />
                    </Field>
                    <Field
                      label="Đường dẫn (slug)"
                      hint={
                        err && /đường dẫn/i.test(err) ? (
                          <span className="text-[var(--danger)]">{err}</span>
                        ) : renamed ? (
                          <span className="text-[var(--accent-2)]">Đổi đường dẫn: audio đã gán slug cũ sẽ không còn thuộc thể loại này.</span>
                        ) : (
                          "Tự sinh từ tên, không dấu"
                        )
                      }
                    >
                      <TextInput
                        value={c.slug}
                        placeholder="drama-gia-dinh"
                        onChange={(e) => {
                          setSlugAuto(false);
                          patch(i, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-") });
                        }}
                        onBlur={() => patch(i, { slug: slugify(c.slug) })}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Mô tả" hint="Hiện ở đầu trang thể loại, giúp SEO">
                        <TextArea rows={3} maxLength={2000} value={c.description} onChange={(e) => patch(i, { description: e.target.value })} />
                      </Field>
                    </div>
                    {err && !/đường dẫn/i.test(err) && <p className="text-xs text-[var(--danger)] sm:col-span-2">{err}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Button onClick={add}>+ Thêm thể loại</Button>

      <ConfirmDialog
        open={toRemove !== null}
        title="Xoá thể loại?"
        message={
          <>
            Xoá <b>{toRemove !== null ? value[toRemove]?.name || "(chưa đặt tên)" : ""}</b>. Audio đang gán thể loại này sẽ thành “chưa có thể loại”
            trên trang. Có hiệu lực sau khi bấm “Lưu cài đặt”.
          </>
        }
        onConfirm={() => {
          if (toRemove !== null) {
            onChange(value.filter((_, j) => j !== toRemove));
            if (editing === toRemove) setEditing(null);
            else if (editing !== null && editing > toRemove) setEditing(editing - 1);
          }
          setToRemove(null);
        }}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
