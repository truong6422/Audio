// Cài đặt & mã chèn: thông tin trang, ảnh OG mặc định, thể loại, mã chèn.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Category, SiteSettings } from "@shared/types";
import { adminApi, errMsg } from "./adminApi";
import { isEmail, isHttpUrl } from "./adminText";
import CategoryEditor, { categoryErrors } from "./CategoryEditor";
import { Button, Card, ErrorBox, Field, ImageUpload, Loading, Switch, TextArea, TextInput, useToast, useUnsavedGuard } from "./ui";

type Keys =
  | "brand_name"
  | "site_title"
  | "tagline"
  | "contact_email"
  | "in_app_prompt"
  | "default_og_image"
  | "categories"
  | "head_html"
  | "body_html"
  | "ads_txt";
type Form = Pick<SiteSettings, Keys>;
const KEYS: Keys[] = ["brand_name", "site_title", "tagline", "contact_email", "in_app_prompt", "default_og_image", "categories", "head_html", "body_html", "ads_txt"];

const pick = (s: SiteSettings): Form => ({
  brand_name: s.brand_name ?? "",
  site_title: s.site_title ?? "",
  tagline: s.tagline ?? "",
  contact_email: s.contact_email ?? "",
  in_app_prompt: !!s.in_app_prompt,
  default_og_image: s.default_og_image ?? "",
  categories: (s.categories ?? []).map((c: Category) => ({ slug: c.slug, name: c.name, description: c.description ?? "" })),
  head_html: s.head_html ?? "",
  body_html: s.body_html ?? "",
  ads_txt: s.ads_txt ?? "",
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const mono = "font-mono text-xs";
const bad = (t: string) => <span className="text-[var(--danger)]">{t}</span>;

export default function SettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [orig, setOrig] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const f = pick(await adminApi.getSettings());
      setForm(f);
      setOrig(f);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const changed = form && orig ? KEYS.filter((k) => !same(form[k], orig[k])) : [];
  useUnsavedGuard(changed.length > 0);
  const savedSlugs = useMemo(() => new Set((orig?.categories ?? []).map((c) => c.slug)), [orig]);

  if (loading) return <Loading />;
  if (error || !form || !orig) return <ErrorBox message={error || "Không tải được cài đặt"} onRetry={load} />;

  const set = <K extends Keys>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  const problems: string[] = [];
  if (!form.brand_name.trim()) problems.push("Tên thương hiệu không được để trống");
  const emailBad = form.contact_email.trim() !== "" && !isEmail(form.contact_email);
  if (emailBad) problems.push("Email liên hệ không hợp lệ");
  const ogBad = form.default_og_image.trim() !== "" && !isHttpUrl(form.default_og_image, true);
  if (ogBad) problems.push("Địa chỉ ảnh OG phải là https://… hoặc /media/…");
  const catErr = categoryErrors(form.categories).filter(Boolean);
  if (catErr.length) problems.push(`Thể loại: ${catErr[0]}`);

  const save = async () => {
    if (problems.length) return toast("err", problems[0]);
    const patch: Partial<SiteSettings> = {};
    for (const k of changed) (patch as Record<string, unknown>)[k] = form[k];
    if (patch.default_og_image !== undefined) patch.default_og_image = patch.default_og_image.trim();
    if (patch.categories) patch.categories = patch.categories.map((c) => ({ ...c, name: c.name.trim(), description: c.description.trim() }));
    setSaving(true);
    try {
      const f = pick(await adminApi.saveSettings(patch));
      setForm(f);
      setOrig(f);
      toast("ok", "Đã lưu cài đặt");
    } catch (e) {
      toast("err", "Lưu lỗi: " + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Thông tin trang">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tên thương hiệu" hint={!form.brand_name.trim() ? bad("Không được để trống") : undefined}>
            <TextInput value={form.brand_name} maxLength={80} onChange={(e) => set("brand_name", e.target.value)} placeholder="Kể Đêm Audio" />
          </Field>
          <Field label="Tiêu đề site" hint="Dùng cho thẻ <title> trang chủ">
            <TextInput value={form.site_title} maxLength={200} onChange={(e) => set("site_title", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Khẩu hiệu (tagline)">
              <TextInput value={form.tagline} maxLength={300} onChange={(e) => set("tagline", e.target.value)} />
            </Field>
          </div>
          <Field label="Email liên hệ" hint={emailBad ? bad("Email không hợp lệ (vd: lienhe@ten-mien.vn)") : "Hiện ở trang Liên hệ / pháp lý"}>
            <TextInput type="email" inputMode="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Switch
            checked={form.in_app_prompt}
            onChange={(v) => set("in_app_prompt", v)}
            label={
              <span>
                <span className="font-medium">Màn “Mở trong trình duyệt”</span>
                <span className="block text-xs text-[var(--muted)]">Gợi ý người xem mở bằng Chrome / Safari khi vào từ Facebook, Zalo, TikTok…</span>
              </span>
            }
          />
        </div>
      </Card>

      <Card title="Ảnh chia sẻ mặc định (OG)">
        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
          <ImageUpload value={form.default_og_image || null} onChange={(url) => set("default_og_image", url ?? "")} aspect="aspect-[1.91/1]" />
          <Field
            label="Hoặc dán địa chỉ ảnh"
            hint={ogBad ? bad("Phải là https://… hoặc /media/…") : "PNG/JPG 1200 × 630. Để trống = dùng ảnh tự sinh theo từng audio."}
          >
            <TextInput type="url" value={form.default_og_image} onChange={(e) => set("default_og_image", e.target.value)} placeholder="https://…/og.png" />
          </Field>
        </div>
      </Card>

      <Card
        title={
          <span>
            Thể loại <span className="text-sm font-normal text-[var(--muted)]">({form.categories.length})</span>
          </span>
        }
      >
        <p className="mb-3 text-xs text-[var(--muted)]">Thứ tự ở đây là thứ tự hiện trên trang. Gán thể loại cho từng audio ở mục Thư viện.</p>
        <CategoryEditor value={form.categories} onChange={(v) => set("categories", v)} savedSlugs={savedSlugs} />
      </Card>

      <Card title="Mã chèn">
        <div className="space-y-3">
          <Field label="Mã chèn vào <head>" hint="Google Analytics, xác minh Search Console, AdSense… Dán nguyên thẻ.">
            <TextArea className={mono} rows={6} spellCheck={false} value={form.head_html} onChange={(e) => set("head_html", e.target.value)} placeholder="<script>…</script>" />
          </Field>
          <Field label="Mã chèn cuối <body>">
            <TextArea className={mono} rows={5} spellCheck={false} value={form.body_html} onChange={(e) => set("body_html", e.target.value)} />
          </Field>
          <Field label="Nội dung /ads.txt">
            <TextArea
              className={mono}
              rows={4}
              spellCheck={false}
              value={form.ads_txt}
              onChange={(e) => set("ads_txt", e.target.value)}
              placeholder="google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0"
            />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        {problems.length > 0 ? (
          <span className="mr-auto text-xs text-[var(--danger)]">{problems[0]}</span>
        ) : (
          changed.length > 0 && <span className="mr-auto text-xs text-[var(--muted)]">{changed.length} mục chưa lưu</span>
        )}
        <Button kind="ghost" disabled={changed.length === 0 || saving} onClick={() => setForm(orig)}>
          Hoàn tác
        </Button>
        <Button kind="primary" busy={saving} disabled={changed.length === 0 || problems.length > 0} onClick={save}>
          Lưu cài đặt
        </Button>
      </div>
    </div>
  );
}
